# Legal Lens ⚖️

Legal Lens is an advanced, AI-powered legal assistant featuring a minimalist Apple/Tesla-inspired golden-black UI. It leverages an intelligent **LangGraph** routing architecture to seamlessly shift between Local Document RAG, Real-Time Web Search, and general AI capabilities. 

## 🚀 Core Features & Parameters

Legal Lens is built on 6 core pillars of intelligence:

1. **LangGraph Semantic Router**: A central AI router that analyzes user intent and redirects queries to specialized sub-agents (Document RAG, Web Search, or General Chat).
2. **Local RAG (ChromaDB)**: When a document is uploaded, it is automatically chunked, embedded, and stored in a local, persistent vector database. 
3. **AI Vision OCR (PyMuPDF + Groq)**: Automatically detects scanned PDFs/images and falls back to a powerful Vision AI model (`llama-3.2-11b-vision-preview`) to perform Optical Character Recognition without any bulky local dependencies (like Tesseract).
4. **WebRAG (Ollama Web Search)**: If a user asks about current events, external legal precedent, or facts outside their document, the agent searches the live internet, retrieves the context, and cites its sources.
5. **AI Nutrition Label**: Instantly extracts and formats a JSON summary of Critical Risks, Key Obligations, Key Rights, and Questions for your Lawyer upon document upload.
6. **PII Sanitization**: Automatically scrubs sensitive information (SSNs, Phone Numbers, Emails) from text before it is processed by external LLMs.

---

## 🏗️ Architecture

- **Frontend**: Pure HTML, CSS, and Vanilla JS. Zero heavy dependencies. Minimalist Golden-Black aesthetic with a dynamic floating chat capsule.
- **Backend**: FastAPI (Python)
- **AI Models**: Groq (`qwen/qwen3.8-27b` for text generation and routing, `llama-3.2-11b-vision-preview` for OCR).
- **Vector Store**: Local ChromaDB (`all-MiniLM-L6-v2` embeddings).
- **Web Search**: Ollama Web Search API.

---

## 🔌 API Endpoints

The FastAPI backend exposes the following endpoints:

*   `GET /api/health`: Health check for the server.
*   `POST /analyze`: Accepts a PDF file upload. Handles Text Extraction, Vision OCR, PII Scrubbing, ChromaDB Indexing, and returns the AI Nutrition Label.
*   `POST /chat`: The LangGraph-powered query engine. Accepts `{"query": "...", "doc_id": "..."}`. Routes to Document RAG, Web RAG, or General Chat.
*   `POST /simplify`: Translates a dense legal clause into plain English.
*   `POST /anomaly-check`: Analyzes a specific clause to determine if it is standard, unusual, or aggressive in the industry.

---

## 🛠️ Setup & Running Locally

1. **Install Dependencies**:
   ```bash
   cd backend
   python -m venv venv
   source venv/Scripts/activate  # Windows
   pip install -r requirements.txt
   pip install langgraph PyMuPDF
   ```

2. **Environment Variables**:
   Create a `.env` file in the `backend` folder:
   ```env
   GROQ_API_KEY=your_groq_api_key
   WEB_SEARCH_API_KEY=your_ollama_web_search_key
   ```

3. **Run the Server**:
   ```bash
   python -m uvicorn main:app --host 127.0.0.1 --port 8000
   ```
   *The server acts as both the API and the static file server for the frontend UI.*

4. **Access the App**:
   Open `http://127.0.0.1:8000` in your browser.

---

*Disclaimer: Legal Lens is strictly for educational and informational purposes and does not provide certified legal advice.*
