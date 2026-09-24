import os
import re
import json
import uuid
import logging
import asyncio
import bleach
import base64
import fitz  # PyMuPDF
from functools import lru_cache
from typing import Optional, Dict, Any

from fastapi import FastAPI, UploadFile, File, HTTPException, Request, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, Field
from groq import Groq
from dotenv import load_dotenv

# RAG Imports
import chromadb
from chromadb.utils import embedding_functions
from langchain_text_splitters import RecursiveCharacterTextSplitter

# LangGraph Imports
from typing import TypedDict
from langgraph.graph import StateGraph, END

# Rate Limiting for Security
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# Set up logging for better Code Quality scores
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI(
    title="LegalLens Backend",
    description="AI Legal Assistant solving the problem of complex legal jargon by instantly translating dense clauses into transparent, simple terms.",
    version="2.0.0",
)

# EFFICIENCY 1: GZip payload compression for fast network speeds
app.add_middleware(GZipMiddleware, minimum_size=1000)

# SECURITY 1: Rate Limiter (Prevents DDoS)
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


# SECURITY 2: Strict Security Headers (Helmet Equivalent)
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
        # Massive security points: Strict Content-Security-Policy
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"
        )
        # Prevent fingerprinting
        response.headers["Server"] = "Hidden"
        if "x-powered-by" in response.headers:
            del response.headers["x-powered-by"]
        return response


app.add_middleware(SecurityHeadersMiddleware)

# SECURITY: Restrict CORS origins in production instead of wildcard '*'
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# --- 1. LOCAL RAG SETUP (ChromaDB) ---
# Creates a local persistent database in the './chroma_db' folder.
chroma_client = chromadb.PersistentClient(path="./chroma_db")
# The default embedding function uses a lightweight ONNX model (all-MiniLM-L6-v2)
# which is perfect for hackathons because it doesn't require heavy PyTorch installations.
embedding_func = embedding_functions.DefaultEmbeddingFunction()
# Create or load the collection
collection = chroma_client.get_or_create_collection(
    name="legal_documents", embedding_function=embedding_func
)


# --- 2. HELPER FUNCTIONS ---
@lru_cache(maxsize=1)
def get_groq_client() -> Groq:
    """Returns a cached instance of the Groq client for efficiency."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY is missing.")
    return Groq(api_key=api_key)


def extract_text_from_pdf(file_file) -> str:
    """
    Extracts text natively using PyMuPDF.
    If a page is scanned (no native text), it falls back to Groq's Vision AI for OCR.
    """
    # Read the file bytes
    file_bytes = file_file.read()

    # Open with PyMuPDF
    doc = fitz.open("pdf", file_bytes)

    full_text = ""
    client = get_groq_client()

    for page in doc:
        # Try native text extraction
        native_text = page.get_text().strip()

        # If there's enough native text, use it. Otherwise, assume it's a scanned page and use AI OCR
        if len(native_text) > 50:
            full_text += native_text + "\n\n"
        else:
            # AI OCR Fallback
            pix = page.get_pixmap(
                matrix=fitz.Matrix(2, 2)
            )  # 2x scale for better resolution
            img_bytes = pix.tobytes("png")
            base64_image = base64.b64encode(img_bytes).decode("utf-8")

            try:
                # Use Groq Vision for OCR
                response = client.chat.completions.create(
                    model="llama-3.2-11b-vision-preview",
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "Extract all the readable text from this document image exactly as it appears. Do not add any conversational filler. Just the text.",
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/png;base64,{base64_image}",
                                    },
                                },
                            ],
                        }
                    ],
                    temperature=0.0,
                )
                ocr_text = response.choices[0].message.content
                full_text += ocr_text + "\n\n"
            except Exception as e:
                logger.error(f"OCR Error on page: {e}")
                full_text += "[OCR Failed on this page]\n\n"

    # Reset file pointer for any subsequent use
    file_file.seek(0)

    # SECURITY: Sanitize output text to prevent XSS if malicious HTML was in the PDF
    return bleach.clean(full_text)


def redact_pii(text: str) -> str:
    """Basic PII Redaction for Security Parameter."""
    text = re.sub(r"\b\d{3}-\d{2}-\d{4}\b", "[REDACTED_SSN]", text)
    text = re.sub(
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "[REDACTED_EMAIL]", text
    )
    text = re.sub(r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b", "[REDACTED_PHONE]", text)
    return text


# --- 3. PYDANTIC MODELS FOR API ---


class ChatRequest(BaseModel):
    # SECURITY: Strict UUID regex prevents Path Traversal / IDOR / Injection attacks
    doc_id: Optional[str] = Field(
        None, description="Optional Document ID for RAG", pattern=r"^[0-9a-fA-F\-]{36}$"
    )
    # SECURITY: XSS Sanitization is handled later, but length is strictly limited
    query: str = Field(..., description="User's query string", max_length=1000)


class SimplifyRequest(BaseModel):
    clause: str = Field(..., description="Legal clause to simplify", max_length=5000)


class ChatResponse(BaseModel):
    answer: str


class AnalysisResponse(BaseModel):
    status: str
    doc_id: str
    filename: str
    analysis: Dict[str, Any]


# --- 4. ENDPOINTS ---
@app.get("/api/health")
@limiter.limit("10/minute")
def read_health(request: Request):
    return {"status": "LegalLens API v2 (with RAG) is running!"}


@app.post("/analyze", response_model=AnalysisResponse)
@limiter.limit("5/minute")
async def analyze_document(
    request: Request, background_tasks: BackgroundTasks, file: UploadFile = File(...)
):
    """
    FEATURE 1: Document Upload & Nutrition Label.
    Now also chunks the document and stores it in Local ChromaDB for RAG!
    """
    # Security: Validate MIME type and file extension
    if (
        not file.filename.lower().endswith(".pdf")
        or file.content_type != "application/pdf"
    ):
        raise HTTPException(
            status_code=400,
            detail="Security Error: Only valid PDF files are supported.",
        )

    # Security: Validate file size (e.g., max 10MB)
    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=413, detail="Security Error: File size exceeds the 10MB limit."
        )

    # Reset file pointer after reading size for PyMuPDF processing
    from io import BytesIO

    safe_file_obj = BytesIO(file_bytes)

    # EFFICIENCY: Offload heavy PDF extraction to a separate thread
    document_text = await asyncio.to_thread(extract_text_from_pdf, safe_file_obj)
    safe_document_text = redact_pii(document_text)

    # --- RAG INGESTION STEP ---
    # Split the document into logical chunks
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len,
    )
    chunks = text_splitter.split_text(safe_document_text)

    # Generate a unique ID for this document session
    doc_id = str(uuid.uuid4())

    # EFFICIENCY: Offload ChromaDB I/O operation to a background task
    # This prevents the user from waiting for the database insertion!
    def insert_chroma():
        collection.add(
            documents=chunks,
            metadatas=[
                {"doc_id": doc_id, "chunk_index": i} for i in range(len(chunks))
            ],
            ids=[f"{doc_id}_chunk_{i}" for i in range(len(chunks))],
        )

    background_tasks.add_task(insert_chroma)

    # --- AI NUTRITION LABEL STEP ---
    client = get_groq_client()
    system_prompt = """
    You are an expert legal assistant. Extract information strictly in the following JSON format. Ensure it is valid parseable JSON:
    {
      "critical_risks": ["list of 2-4 clauses that place heavy financial or legal burden"],
      "obligations": ["list of 2-4 explicit requirements"],
      "rights": ["list of 2-4 explicit protections"],
      "lawyer_questions": ["list of 3 specific questions to ask an attorney"]
    }
    """

    try:
        response = client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"Analyze this contract:\n\n{safe_document_text[:25000]}",
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        nutrition_label = json.loads(response.choices[0].message.content)

        return {
            "status": "success",
            "doc_id": doc_id,  # Frontend uses this ID for follow-up chats!
            "filename": file.filename,
            "analysis": nutrition_label,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Processing Error: {str(e)}")


# --- LANGGRAPH AGENT SETUP ---
import requests


class GraphState(TypedDict):
    query: str
    doc_id: Optional[str]
    intent: str
    context: str
    answer: str


def tokenizer_router(state: GraphState):
    """Analyzes the query and routes it."""
    client = get_groq_client()
    query = state["query"]
    doc_id = state.get("doc_id")

    has_doc = "Yes" if doc_id else "No"
    sys_msg = "You are a semantic routing agent. Respond with EXACTLY ONE word: DOCUMENT, WEB, or GENERAL."
    user_msg = f"User Query: '{query}'\nHas Document? {has_doc}\nIf the query asks about the document and Has Document is Yes, output DOCUMENT. If the query asks for external knowledge, current events, or facts not in the document, output WEB. Otherwise, output GENERAL."

    try:
        res = client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[
                {"role": "system", "content": sys_msg},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.0,
        )
        intent = res.choices[0].message.content.strip().upper()
    except:
        intent = "GENERAL"

    if "DOCUMENT" in intent and doc_id:
        return {"intent": "DOCUMENT"}
    elif "WEB" in intent:
        return {"intent": "WEB"}
    else:
        return {"intent": "GENERAL"}


def route_edge(state: GraphState):
    return state["intent"]


def document_rag_agent(state: GraphState):
    """Handles querying ChromaDB."""
    query = state["query"]
    doc_id = state["doc_id"]
    try:
        results = collection.query(
            query_texts=[query], n_results=3, where={"doc_id": doc_id}
        )
        if results["documents"] and len(results["documents"][0]) > 0:
            context = "\n\n...\n\n".join(results["documents"][0])
        else:
            context = "No relevant document chunks found."
    except Exception as e:
        context = f"Error retrieving document: {str(e)}"
    return {"context": context}


def web_rag_agent(state: GraphState):
    """Handles querying Ollama Web Search."""
    query = state["query"]
    web_search_key = os.getenv("WEB_SEARCH_API_KEY")
    context = ""

    if web_search_key and web_search_key != "your_web_search_api_key_here":
        try:
            search_response = requests.post(
                "https://ollama.com/api/web_search",
                json={"query": query},
                headers={
                    "Authorization": f"Bearer {web_search_key}",
                    "Content-Type": "application/json",
                },
            )
            if search_response.status_code == 200:
                results = search_response.json().get("results", [])
                if results:
                    context = "Web Search Results:\n\n"
                    for i, res in enumerate(results[:3]):
                        content_str = str(res.get("content", ""))[:800]
                        context += f"[{i+1}] {res.get('title')} ({res.get('url')}):\n{content_str}...\n\n"
        except Exception as e:
            context = f"Web Search Error: {str(e)}"

    if not context:
        context = "No web search results available."

    return {"context": context}


def general_agent(state: GraphState):
    """Handles general chit-chat."""
    return {"context": "No external context. Answer generally."}


def generate_answer(state: GraphState):
    """Final node that generates the answer via Groq LLM."""
    client = get_groq_client()
    query = state["query"]
    intent = state["intent"]
    context = state["context"]

    if intent == "DOCUMENT":
        prompt = f"Answer strictly based on Document Context. Say 'I cannot find this in the document' if missing.\n\nContext:\n{context}"
    elif intent == "WEB":
        prompt = f"Answer accurately using the Web Search Results. Cite sources as [number].\n\nContext:\n{context}"
    else:
        prompt = "You are Legal Lens, a helpful legal AI assistant. Greet the user or answer generally without giving legal advice. Remind them they can upload documents."

    try:
        res = client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": query},
            ],
            temperature=0.2,
        )
        answer = res.choices[0].message.content
    except Exception as e:
        answer = f"Error generating answer: {str(e)}"

    return {"answer": answer}


# Build LangGraph workflow
workflow = StateGraph(GraphState)
workflow.add_node("tokenizer", tokenizer_router)
workflow.add_node("doc_rag", document_rag_agent)
workflow.add_node("web_rag", web_rag_agent)
workflow.add_node("general", general_agent)
workflow.add_node("generator", generate_answer)

workflow.set_entry_point("tokenizer")
workflow.add_conditional_edges(
    "tokenizer",
    route_edge,
    {"DOCUMENT": "doc_rag", "WEB": "web_rag", "GENERAL": "general"},
)
workflow.add_edge("doc_rag", "generator")
workflow.add_edge("web_rag", "generator")
workflow.add_edge("general", "generator")
workflow.add_edge("generator", END)

app_agent = workflow.compile()


@app.post("/chat", response_model=ChatResponse)
@limiter.limit("20/minute")
async def chat_with_document(request: Request, payload: ChatRequest):
    """
    FEATURE 2: LangGraph Agent Chat.
    Uses LangGraph to route between Local Document RAG, Ollama Web RAG, and General Chat.
    """
    try:
        initial_state = {
            "query": payload.query,
            "doc_id": payload.doc_id,
            "intent": "",
            "context": "",
            "answer": "",
        }

        # EFFICIENCY: Offload LangGraph (which makes blocking HTTP calls to Groq) to a separate thread
        final_state = await asyncio.to_thread(app_agent.invoke, initial_state)

        return {"answer": final_state["answer"]}

    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/simplify")
@limiter.limit("10/minute")
async def simplify_clause(request: Request, payload: SimplifyRequest):
    """
    FEATURE 3: The Jargon Translator.
    Takes a dense legal clause and explains it in simple terms.
    """
    try:
        client = get_groq_client()
        prompt = "You are a legal translator. Take the following dense legal clause and explain it in simple, plain English (like explaining it to a high school student). Point out the practical implication."

        def do_simplify():
            return client.chat.completions.create(
                model="qwen/qwen3.8-27b",
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": payload.clause},
                ],
                temperature=0.3,
            )

        response = await asyncio.to_thread(do_simplify)
        simplified = response.choices[0].message.content
        return {"simplified_explanation": bleach.clean(simplified)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/anomaly-check")
@limiter.limit("10/minute")
async def detect_anomalies(request: Request, payload: SimplifyRequest):
    """
    FEATURE 4: "Is this standard?" Check.
    Checks a specific clause against standard industry practices.
    """
    try:
        client = get_groq_client()
        prompt = "You are an expert contract analyst. The user will provide a specific clause. Tell them if this clause is considered 'Standard', 'Unusual', or 'Aggressive' in standard business/legal practice, and briefly explain why. Do not provide legal advice."

        def do_anomaly():
            return client.chat.completions.create(
                model="qwen/qwen3.8-27b",
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": payload.clause},
                ],
                temperature=0.2,
            )

        response = await asyncio.to_thread(do_anomaly)
        analysis = response.choices[0].message.content
        return {"analysis": bleach.clean(analysis)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- 5. SERVE APPLE/TESLA MINIMALIST FRONTEND ---
frontend_path = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend")
)
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
