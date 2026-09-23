/**
 * LegalLens — Frontend Application Engine
 * Vanilla JavaScript (Zero npm packages, zero overhead)
 * Connects directly to FastAPI backend on http://127.0.0.1:8000
 */

const API_BASE = (window.location.protocol.startsWith("http")) 
  ? window.location.origin 
  : "http://127.0.0.1:8000";

// App State
let currentDocId = null;
let currentFileName = "";

// DOM Elements
const apiStatusDot = document.getElementById("apiStatusDot");
const apiStatusText = document.getElementById("apiStatusText");

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const browseBtn = document.getElementById("browseBtn");
const progressContainer = document.getElementById("progressContainer");
const progressBar = document.getElementById("progressBar");
const progressStatus = document.getElementById("progressStatus");

const workspaceSection = document.getElementById("workspaceSection");
const sessionFileName = document.getElementById("sessionFileName");
const sessionDocId = document.getElementById("sessionDocId");
const exportBtn = document.getElementById("exportBtn");
const newDocBtn = document.getElementById("newDocBtn");

// Bento Lists & Counters
const riskList = document.getElementById("riskList");
const obligationList = document.getElementById("obligationList");
const rightsList = document.getElementById("rightsList");
const questionsList = document.getElementById("questionsList");
const riskCount = document.getElementById("riskCount");
const obligationCount = document.getElementById("obligationCount");
const rightsCount = document.getElementById("rightsCount");
const questionCount = document.getElementById("questionCount");

// Tabs
const tabBtns = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");

// Chat
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const promptChips = document.querySelectorAll(".chip");

// Translator
const translateInput = document.getElementById("translateInput");
const runTranslateBtn = document.getElementById("runTranslateBtn");
const sampleClauseBtn = document.getElementById("sampleClauseBtn");
const translateOutputCard = document.getElementById("translateOutputCard");
const translateOutputText = document.getElementById("translateOutputText");

// Anomaly
const anomalyInput = document.getElementById("anomalyInput");
const runAnomalyBtn = document.getElementById("runAnomalyBtn");
const sampleAnomalyBtn = document.getElementById("sampleAnomalyBtn");
const anomalyOutputCard = document.getElementById("anomalyOutputCard");
const anomalyOutputText = document.getElementById("anomalyOutputText");


// ==========================================
// 1. System Health Check
// ==========================================
async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { method: "GET" });
    if (res.ok) {
      apiStatusDot.className = "status-dot online";
      apiStatusText.textContent = "Backend Online • ChromaDB Ready";
    } else {
      throw new Error();
    }
  } catch (err) {
    apiStatusDot.className = "status-dot error";
    apiStatusText.textContent = "Backend Offline (Run uvicorn)";
  }
}

// ==========================================
// 2. Drag & Drop and Upload Flow
// ==========================================
browseBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    handleFileUpload(e.target.files[0]);
  }
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  if (e.dataTransfer.files.length > 0) {
    handleFileUpload(e.dataTransfer.files[0]);
  }
});

async function handleFileUpload(file) {
  if (!file.name.endsWith(".pdf")) {
    alert("Please upload a PDF document.");
    return;
  }

  currentFileName = file.name;
  
  // Show progress state
  progressContainer.style.display = "block";
  browseBtn.style.display = "none";
  progressBar.style.width = "20%";
  progressStatus.textContent = "1/4 Extracting text & scrubbing PII (SSNs, Phones, Emails)...";

  const formData = new FormData();
  formData.append("file", file);

  // Animated progress steps simulation while waiting for API
  const stepTimer = setTimeout(() => {
    progressBar.style.width = "50%";
    progressStatus.textContent = "2/4 Chunking & embedding into local ChromaDB vector store...";
  }, 1200);

  const stepTimer2 = setTimeout(() => {
    progressBar.style.width = "80%";
    progressStatus.textContent = "3/4 Synthesizing Legal Nutrition Label via Groq LPU...";
  }, 2400);

  try {
    const response = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      body: formData
    });

    clearTimeout(stepTimer);
    clearTimeout(stepTimer2);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: "Upload failed" }));
      throw new Error(errorData.detail || "Error processing document.");
    }

    progressBar.style.width = "100%";
    progressStatus.textContent = "Complete!";

    const data = await response.json();
    currentDocId = data.doc_id;

    // Render results
    setTimeout(() => {
      displayAnalysisResults(data);
      progressContainer.style.display = "none";
      browseBtn.style.display = "inline-block";
    }, 400);

  } catch (error) {
    clearTimeout(stepTimer);
    clearTimeout(stepTimer2);
    alert(`Analysis Failed: ${error.message}`);
    progressContainer.style.display = "none";
    browseBtn.style.display = "inline-block";
  }
}

function displayAnalysisResults(data) {
  sessionFileName.textContent = data.filename || currentFileName;
  sessionDocId.textContent = data.doc_id ? data.doc_id.substring(0, 8) + "..." : "local-session";

  const analysis = data.analysis || {};

  renderBentoList(riskList, analysis.critical_risks, riskCount);
  renderBentoList(obligationList, analysis.obligations, obligationCount);
  renderBentoList(rightsList, analysis.rights, rightsCount);
  renderBentoList(questionsList, analysis.lawyer_questions, questionCount);

  // Reveal workspace smoothly
  workspaceSection.style.display = "block";
  workspaceSection.scrollIntoView({ behavior: "smooth" });
}

function renderBentoList(container, items, counterElem) {
  container.innerHTML = "";
  if (!items || items.length === 0) {
    container.innerHTML = `<li class="loading-placeholder">No items detected for this category.</li>`;
    if (counterElem) counterElem.textContent = "0";
    return;
  }

  if (counterElem) counterElem.textContent = items.length;

  items.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    container.appendChild(li);
  });
}

// Reset / Upload Another
newDocBtn.addEventListener("click", () => {
  fileInput.value = "";
  workspaceSection.style.display = "none";
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Print Lawyer Brief
exportBtn.addEventListener("click", () => {
  window.print();
});


// ==========================================
// 3. Tab Navigation (Segmented Switcher)
// ==========================================
tabBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    tabBtns.forEach(b => b.classList.remove("active"));
    tabPanes.forEach(p => p.classList.remove("active"));

    btn.classList.add("active");
    const targetId = btn.getAttribute("data-tab");
    const targetPane = document.getElementById(targetId);
    if (targetPane) targetPane.classList.add("active");
  });
});


// ==========================================
// 4. Local RAG Chat Engine
// ==========================================
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const query = chatInput.value.trim();
  if (!query) return;
  sendChatMessage(query);
});

// Prompt Chips click handler
promptChips.forEach(chip => {
  chip.addEventListener("click", () => {
    const query = chip.getAttribute("data-query");
    if (query) {
      chatInput.value = query;
      sendChatMessage(query);
    }
  });
});

async function sendChatMessage(query) {
  if (!currentDocId) {
    alert("Please upload a document first before querying.");
    return;
  }

  // Append User message
  appendMessage("user", query);
  chatInput.value = "";
  chatInput.disabled = true;

  // Placeholder assistant message
  const placeholderId = "msg-" + Date.now();
  appendMessage("assistant", "Searching document vectors and reasoning...", placeholderId);

  try {
    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doc_id: currentDocId,
        query: query
      })
    });

    if (!response.ok) {
      throw new Error("Chat request failed");
    }

    const data = await response.json();
    const assistantBody = document.querySelector(`#${placeholderId} .msg-body`);
    
    if (assistantBody) {
      let contentHtml = `<p>${escapeHtml(data.answer)}</p>`;
      
      // If there are retrieved chunks, render the evidence drawer
      if (data.retrieved_chunks && data.retrieved_chunks.length > 0) {
        contentHtml += `
          <div class="evidence-drawer">
            <span class="evidence-toggle" onclick="toggleEvidence('${placeholderId}')">
              🔍 View ${data.retrieved_chunks.length} Retrieved Document Chunks (RAG Evidence)
            </span>
            <div class="evidence-content" id="evidence-${placeholderId}" style="display: none;">
              ${data.retrieved_chunks.map((c, i) => `<div><strong>Chunk [${i+1}]:</strong> ${escapeHtml(c)}</div>`).join("<hr style='border:0;border-top:1px dashed rgba(255,255,255,0.1);margin:6px 0;'>")}
            </div>
          </div>
        `;
      }
      
      assistantBody.innerHTML = contentHtml;
    }
  } catch (err) {
    const assistantBody = document.querySelector(`#${placeholderId} .msg-body`);
    if (assistantBody) {
      assistantBody.innerHTML = `<p style="color:var(--accent-red)">Error: Could not retrieve answer from document.</p>`;
    }
  } finally {
    chatInput.disabled = false;
    chatInput.focus();
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function appendMessage(sender, text, msgId = null) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${sender}-msg`;
  if (msgId) msgDiv.id = msgId;

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.textContent = sender === "user" ? "You" : "§";

  const body = document.createElement("div");
  body.className = "msg-body";
  body.innerHTML = `<p>${escapeHtml(text)}</p>`;

  msgDiv.appendChild(avatar);
  msgDiv.appendChild(body);
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

window.toggleEvidence = function(msgId) {
  const drawer = document.getElementById(`evidence-${msgId}`);
  if (drawer) {
    drawer.style.display = drawer.style.display === "none" ? "block" : "none";
  }
};


// ==========================================
// 5. Jargon Translator
// ==========================================
sampleClauseBtn.addEventListener("click", () => {
  translateInput.value = "The Indemnifying Party covenants and agrees to defend, indemnify, and hold completely harmless the Indemnified Party, its affiliates, agents, officers, and successors against any and all liabilities, losses, damages, or costs including attorneys' fees arising out of any third-party claim, regardless of any contributory negligence.";
});

runTranslateBtn.addEventListener("click", async () => {
  const clause = translateInput.value.trim();
  if (!clause) {
    alert("Please enter or paste a legal clause.");
    return;
  }

  runTranslateBtn.disabled = true;
  runTranslateBtn.textContent = "Translating...";
  translateOutputCard.style.display = "block";
  translateOutputText.textContent = "Deconstructing legalese...";

  try {
    const res = await fetch(`${API_BASE}/simplify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clause: clause })
    });

    if (!res.ok) throw new Error("Translation failed");
    const data = await res.json();
    translateOutputText.textContent = data.simplified_explanation || "No explanation generated.";
  } catch (err) {
    translateOutputText.textContent = "Error: Could not simplify this clause.";
  } finally {
    runTranslateBtn.disabled = false;
    runTranslateBtn.textContent = "Translate to Plain English";
  }
});


// ==========================================
// 6. Standard Deviation / Anomaly Check
// ==========================================
sampleAnomalyBtn.addEventListener("click", () => {
  anomalyInput.value = "Upon termination for any reason, Employee agrees not to engage in, advise, or consult for any business operating within the software, technology, or consulting sectors globally for a mandatory period of thirty-six (36) consecutive months without financial stipend.";
});

runAnomalyBtn.addEventListener("click", async () => {
  const clause = anomalyInput.value.trim();
  if (!clause) {
    alert("Please enter or paste a clause to evaluate.");
    return;
  }

  runAnomalyBtn.disabled = true;
  runAnomalyBtn.textContent = "Evaluating Market Standard...";
  anomalyOutputCard.style.display = "block";
  anomalyOutputText.textContent = "Benchmarking clause against contract norms...";

  try {
    const res = await fetch(`${API_BASE}/anomaly-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clause: clause })
    });

    if (!res.ok) throw new Error("Evaluation failed");
    const data = await res.json();
    anomalyOutputText.textContent = data.analysis || "No benchmark data available.";
  } catch (err) {
    anomalyOutputText.textContent = "Error: Could not benchmark this clause.";
  } finally {
    runAnomalyBtn.disabled = false;
    runAnomalyBtn.textContent = "Evaluate Against Standards";
  }
});


// Helper Utilities
function escapeHtml(string) {
  if (!string) return "";
  const div = document.createElement("div");
  div.innerText = string;
  return div.innerHTML;
}

// Initial API Ping on page load
window.addEventListener("DOMContentLoaded", () => {
  checkBackendHealth();
  // Poll health every 8 seconds
  setInterval(checkBackendHealth, 8000);
});
