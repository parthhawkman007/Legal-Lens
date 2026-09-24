/**
 * LegalLens — Frontend Navigation & State Management
 * Connects to FastAPI backend on http://127.0.0.1:8000
 */

const API_BASE = (window.location.protocol.startsWith("http")) 
  ? window.location.origin 
  : "http://127.0.0.1:8000";

// DOM Elements
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");
const sidebarDrawer = document.getElementById("sidebarDrawer");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const newSessionBtn = document.getElementById("newSessionBtn");

// Capsule Elements
const capsuleDocBtn = document.getElementById("capsuleDocBtn");
const capsuleFileInput = document.getElementById("capsuleFileInput");
const capsuleInput = document.getElementById("capsuleInput");
const capsuleSendBtn = document.getElementById("capsuleSendBtn");
const capsuleAttachmentBadge = document.getElementById("capsuleAttachmentBadge");
const attachmentName = document.getElementById("attachmentName");
const btnRemoveAttachment = document.getElementById("btnRemoveAttachment");

// View Elements
const heroCenter = document.getElementById("heroCenter");
const chatFeed = document.getElementById("chatFeed");

// State
let selectedFile = null;
let currentDocId = null;

// ==========================================
// 1. Sidebar Drawer Controls
// ==========================================
function openSidebar() {
  sidebarDrawer.classList.add("active");
  sidebarOverlay.classList.add("active");
  sidebarDrawer.setAttribute("aria-hidden", "false");
}

function closeSidebar() {
  sidebarDrawer.classList.remove("active");
  sidebarOverlay.classList.remove("active");
  sidebarDrawer.setAttribute("aria-hidden", "true");
}

sidebarToggleBtn.addEventListener("click", openSidebar);
sidebarCloseBtn.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sidebarDrawer.classList.contains("active")) {
    closeSidebar();
  }
});

newSessionBtn.addEventListener("click", () => {
  closeSidebar();
  selectedFile = null;
  currentDocId = null;
  capsuleAttachmentBadge.style.display = "none";
  capsuleInput.value = "";
  capsuleInput.placeholder = "Ask a question or upload a document...";
});

// ==========================================
// 2. Chat Capsule Document Attachment
// ==========================================
capsuleDocBtn.addEventListener("click", () => {
  capsuleFileInput.click();
});

capsuleFileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    selectedFile = e.target.files[0];
    attachmentName.textContent = selectedFile.name;
    capsuleAttachmentBadge.style.display = "inline-flex";
    capsuleInput.placeholder = `Analyze "${selectedFile.name}" or ask a specific question...`;
    capsuleInput.focus();
  }
});

btnRemoveAttachment.addEventListener("click", () => {
  selectedFile = null;
  capsuleFileInput.value = "";
  capsuleAttachmentBadge.style.display = "none";
  capsuleInput.placeholder = "Ask a question or upload a document...";
});

// ==========================================
// 3. Send / Query Submission
// ==========================================
capsuleSendBtn.addEventListener("click", handleSubmission);

capsuleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    handleSubmission();
  }
});

function transitionToChat() {
  if (!heroCenter.classList.contains("hidden")) {
    heroCenter.classList.add("hidden");
    setTimeout(() => {
      heroCenter.style.display = "none";
      chatFeed.style.display = "flex";
    }, 500);
  }
}

function appendUserMessage(text) {
  const msgDiv = document.createElement("div");
  msgDiv.className = "chat-message msg-user";
  msgDiv.textContent = text;
  chatFeed.appendChild(msgDiv);
  chatFeed.scrollTop = chatFeed.scrollHeight;
}

function appendSystemMessage(htmlContent) {
  const msgDiv = document.createElement("div");
  msgDiv.className = "chat-message msg-system";
  msgDiv.innerHTML = htmlContent;
  chatFeed.appendChild(msgDiv);
  chatFeed.scrollTop = chatFeed.scrollHeight;
  return msgDiv;
}

function appendLoader() {
  const loaderDiv = document.createElement("div");
  loaderDiv.className = "chat-message msg-system";
  loaderDiv.id = "chatLoader";
  loaderDiv.innerHTML = `
    <div class="loader-dots">
      <span></span><span></span><span></span>
    </div>
  `;
  chatFeed.appendChild(loaderDiv);
  chatFeed.scrollTop = chatFeed.scrollHeight;
}

function removeLoader() {
  const loader = document.getElementById("chatLoader");
  if (loader) {
    loader.remove();
  }
}

async function handleSubmission() {
  const query = capsuleInput.value.trim();

  // If a file is selected and not analyzed yet, upload it first
  if (selectedFile && !currentDocId) {
    transitionToChat();
    appendUserMessage(`Analyzing document: ${selectedFile.name}`);
    await uploadAndAnalyzeFile(selectedFile);
  } else if (query) {
    transitionToChat();
    appendUserMessage(query);
    capsuleInput.value = "";
    await sendChatQuery(query);
  }
}

async function uploadAndAnalyzeFile(file) {
  const originalPlaceholder = capsuleInput.placeholder;
  capsuleInput.value = "";
  capsuleInput.placeholder = "Sanitizing PII & indexing document with ChromaDB...";
  capsuleInput.disabled = true;
  capsuleSendBtn.style.opacity = "0.5";

  appendLoader();

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      body: formData
    });

    if (!res.ok) throw new Error("Document analysis failed.");

    const data = await res.json();
    currentDocId = data.doc_id;

    removeLoader();
    
    // Format the AI Nutrition Label JSON object nicely
    let analysisHTML = "";
    if (data.analysis && typeof data.analysis === "object") {
      analysisHTML += "<ul>";
      if (data.analysis.critical_risks && data.analysis.critical_risks.length > 0) {
        analysisHTML += `<li><strong>Critical Risks:</strong> ${data.analysis.critical_risks.join(", ")}</li>`;
      }
      if (data.analysis.obligations && data.analysis.obligations.length > 0) {
        analysisHTML += `<li><strong>Key Obligations:</strong> ${data.analysis.obligations.join(", ")}</li>`;
      }
      if (data.analysis.rights && data.analysis.rights.length > 0) {
        analysisHTML += `<li><strong>Key Rights:</strong> ${data.analysis.rights.join(", ")}</li>`;
      }
      if (data.analysis.lawyer_questions && data.analysis.lawyer_questions.length > 0) {
        analysisHTML += `<li><strong>Questions for Lawyer:</strong> ${data.analysis.lawyer_questions.join(", ")}</li>`;
      }
      analysisHTML += "</ul>";
    } else {
      analysisHTML = `<p>${String(data.analysis).replace(/\n/g, '<br>')}</p>`;
    }

    appendSystemMessage(`
      <h3>Document Indexed Successfully</h3>
      <p>I have extracted the text, scrubbed any PII, and indexed <strong>${file.name}</strong> for semantic search.</p>
      <p><strong>Initial Analysis:</strong></p>
      ${analysisHTML}
      <p><em>You can now ask me questions about this document.</em></p>
    `);

    capsuleInput.placeholder = `Document indexed! Ask any question about ${file.name}...`;
  } catch (err) {
    removeLoader();
    appendSystemMessage(`<h3>Error</h3><p>${err.message}</p>`);
    capsuleInput.placeholder = originalPlaceholder;
  } finally {
    capsuleInput.disabled = false;
    capsuleSendBtn.style.opacity = "1";
    capsuleInput.focus();
  }
}

async function sendChatQuery(query) {
  capsuleInput.disabled = true;
  capsuleSendBtn.style.opacity = "0.5";
  
  appendLoader();

  try {
    const payload = {
      query: query
    };
    
    if (currentDocId) {
        payload.doc_id = currentDocId;
    }

    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
        let errMsg = "Chat request failed.";
        try {
            const errData = await res.json();
            if (errData.detail) {
                if (typeof errData.detail === 'string') errMsg = errData.detail;
                else if (Array.isArray(errData.detail)) errMsg = errData.detail[0].msg;
            }
        } catch (e) {}
        throw new Error(errMsg);
    }

    const data = await res.json();
    removeLoader();
    
    // Simple markdown parsing to HTML
    let htmlAnswer = data.answer
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
      
    if (!htmlAnswer.startsWith('<p>')) {
      htmlAnswer = '<p>' + htmlAnswer + '</p>';
    }

    appendSystemMessage(htmlAnswer);

  } catch (err) {
    removeLoader();
    appendSystemMessage(`<h3>Error</h3><p>${err.message}</p>`);
  } finally {
    capsuleInput.disabled = false;
    capsuleSendBtn.style.opacity = "1";
    capsuleInput.focus();
  }
}
