// =============================================================
// Prajwal AI — Frontend application logic (vanilla JS)
// =============================================================

import { animate, stagger } from "https://cdn.jsdelivr.net/npm/motion@10.18.0/+esm";

// ---------- Config ----------
const BACKEND_BASE_URL =
  window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000"
    : "https://portfolioai-9yzi.onrender.com";
const THEME_STORAGE_KEY = "portfolio_ai_theme";
const MAX_TEXTAREA_HEIGHT = 160;
const ACCEPTED_FILE_TYPES = [".pdf", ".docx", ".txt"];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_CHAT_MESSAGE_LENGTH = 4000;
const MAX_RECRUITER_MESSAGE_LENGTH = 2000;

const CHAT_STREAM_TIMEOUT_MS = 45000;
const JD_ANALYSIS_TIMEOUT_MS = 75000;

// Wake-up screen tuning: the health check is given a short "grace"
// window before the overlay appears, so a fast/warm backend never
// causes a visible flash of the wake-up screen.
const HEALTH_CHECK_TIMEOUT_MS = 1000;
const WAKEUP_GRACE_DELAY_MS = 350;
const WAKEUP_POLL_INTERVAL_MS = 2500;
const WAKEUP_STATUS_ROTATION_MS = 2000;
const WAKEUP_STATUS_MESSAGES = [
  "Initializing…",
  "Connecting to AI backend…",
  "Establishing secure connection…",
  "Waking up backend services…",
  "Loading AI components…",
  "Preparing the application environment…",
  "Initializing request handling…",
  "Checking backend availability…",
  "Finalizing the connection…",
  "Almost ready…",
  "Starting your AI session…",
];

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Centralized state ----------
const state = {
  isSending: false,
  hasMessages: false,
  attachedFile: null,
  conversationHistory: [],
  parsedDocument: null,
  isParsingFile: false,
  activeRequestController: null,
  wakeupVisible: false,
  wakeupResolved: false,
};

// Timer handles kept outside `state` (not serializable app state, just
// bookkeeping) so we never accidentally spin up duplicate loops.
let wakeupGraceTimeoutId = null;
let wakeupPollIntervalId = null;
let wakeupStatusIntervalId = null;

// ---------- DOM refs (populated on DOMContentLoaded) ----------
const els = {};

function cacheDom() {
  els.app = document.getElementById("app");

  els.newChatBtn = document.getElementById("newChatBtn");
  els.themeToggle = document.getElementById("themeToggle");

  els.chatArea = document.getElementById("chatArea");
  els.welcomeScreen = document.getElementById("welcomeScreen");
  els.suggestionGrid = document.getElementById("suggestionGrid");
  els.messagesContainer = document.getElementById("messagesContainer");

  els.composerForm = document.getElementById("composerForm");
  els.messageInput = document.getElementById("messageInput");
  els.sendBtn = document.getElementById("sendBtn");
  els.attachBtn = document.getElementById("attachBtn");
  els.fileInput = document.getElementById("fileInput");

  els.attachmentPreview = document.getElementById("attachmentPreview");
  els.attachmentName = document.getElementById("attachmentName");
  els.attachmentType = document.getElementById("attachmentType");
  els.attachmentRemove = document.getElementById("attachmentRemove");

  els.customTooltip = document.getElementById("customTooltip");

  els.wakeupScreen = document.getElementById("wakeupScreen");
  els.wakeupPanel = document.getElementById("wakeupPanel");
  els.wakeupMark = document.getElementById("wakeupMark");
  els.wakeupStatusText = document.getElementById("wakeupStatusText");
}

// =============================================================
// APP BOOTSTRAP
// =============================================================

function initializeApp() {
  cacheDom();
  renderLucideIcons();
  initializeTheme();
  initializeComposer();
  initializeFileUpload();
  initializeSuggestionCards();
  initializeChat();
  initializeTooltips();
  runStartupHealthFlow();
  playWelcomeEntrance();
}

function renderLucideIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

// =============================================================
// THEME
// =============================================================

function initializeTheme() {
  const saved = safeGetItem(THEME_STORAGE_KEY);
  const initial = saved === "light" ? "light" : "dark";
  setTheme(initial, { persist: false });

  els.themeToggle.addEventListener("click", toggleTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  setTheme(next, { persist: true });

  if (!prefersReducedMotion) {
    animate(
      "body",
      { opacity: [0.94, 1] },
      { duration: 0.28, easing: "ease-out" }
    );
  }
}

function setTheme(theme, { persist = true } = {}) {
  document.documentElement.setAttribute("data-theme", theme);
  if (persist) {
    safeSetItem(THEME_STORAGE_KEY, theme);
  }
}

// =============================================================
// BACKEND HEALTH + SERVER WAKE-UP SCREEN
// =============================================================

// Single source of truth for pinging the existing health endpoint.
async function pingBackendHealth(timeoutMs = HEALTH_CHECK_TIMEOUT_MS) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${BACKEND_BASE_URL}/api/health`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return res.ok;
  } catch (err) {
    return false;
  }
}

// Runs once on initial load.
async function runStartupHealthFlow() {
  state.wakeupResolved = false;

  wakeupGraceTimeoutId = setTimeout(() => {
    if (!state.wakeupResolved) {
      showWakeupScreen();
    }
  }, WAKEUP_GRACE_DELAY_MS);

  const healthy = await pingBackendHealth();

  state.wakeupResolved = true;
  clearTimeout(wakeupGraceTimeoutId);
  wakeupGraceTimeoutId = null;

  if (healthy) {
    hideWakeupScreen();
    return;
  }

  showWakeupScreen();
  startWakeupPolling();
}

function startWakeupPolling() {
  // Guard against duplicate polling loops.
  if (wakeupPollIntervalId) return;

  wakeupPollIntervalId = setInterval(async () => {
    const healthy = await pingBackendHealth();

    if (healthy) {
      clearInterval(wakeupPollIntervalId);
      wakeupPollIntervalId = null;
      hideWakeupScreen();
    }
  }, WAKEUP_POLL_INTERVAL_MS);
}

function showWakeupScreen() {
  if (!els.wakeupScreen || state.wakeupVisible) return;

  state.wakeupVisible = true;
  els.wakeupScreen.hidden = false;
  renderLucideIcons();

  requestAnimationFrame(() => {
    els.wakeupScreen.classList.add("is-visible");
  });

  startWakeupStatusRotation();

  if (!prefersReducedMotion) {
    animate(
      els.wakeupPanel,
      {
        opacity: [0, 1],
        transform: ["translateY(14px) scale(0.98)", "translateY(0px) scale(1)"],
      },
      { duration: 0.5, easing: [0.16, 1, 0.3, 1] }
    );

    if (els.wakeupMark) {
      animate(
        els.wakeupMark,
        { opacity: [0, 1], transform: ["scale(0.85)", "scale(1)"] },
        { duration: 0.45, delay: 0.08, easing: [0.16, 1, 0.3, 1] }
      );
    }
  }
}

function hideWakeupScreen() {
  if (!els.wakeupScreen || !state.wakeupVisible) return;

  stopWakeupStatusRotation();

  const finish = () => {
    els.wakeupScreen.hidden = true;
    els.wakeupScreen.classList.remove("is-visible");
    state.wakeupVisible = false;
  };

  if (!prefersReducedMotion) {
    animate(els.wakeupScreen, { opacity: [1, 0] }, { duration: 0.4, easing: "ease-in" })
      .finished.then(finish);
  } else {
    finish();
  }
}

function startWakeupStatusRotation() {
  if (!els.wakeupStatusText) return;

  let index = 0;
  els.wakeupStatusText.textContent = WAKEUP_STATUS_MESSAGES[0];

  if (wakeupStatusIntervalId) return;

  wakeupStatusIntervalId = setInterval(() => {
    index = (index + 1) % WAKEUP_STATUS_MESSAGES.length;
    updateWakeupStatusText(WAKEUP_STATUS_MESSAGES[index]);
  }, WAKEUP_STATUS_ROTATION_MS);
}

function stopWakeupStatusRotation() {
  clearInterval(wakeupStatusIntervalId);
  wakeupStatusIntervalId = null;
}

function updateWakeupStatusText(text) {
  if (!els.wakeupStatusText) return;

  if (!prefersReducedMotion) {
    animate(els.wakeupStatusText, { opacity: [1, 0] }, { duration: 0.15 }).finished.then(() => {
      els.wakeupStatusText.textContent = text;
      animate(els.wakeupStatusText, { opacity: [0, 1] }, { duration: 0.25 });
    });
  } else {
    els.wakeupStatusText.textContent = text;
  }
}

// =============================================================
// SUGGESTION CARDS
// =============================================================

function initializeSuggestionCards() {
  const cards = els.suggestionGrid.querySelectorAll(".suggestion-card");
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const prompt = card.getAttribute("data-prompt");
      els.messageInput.value = prompt;
      updateSendButtonState();
      autoResizeTextarea();
      sendMessage();
    });
  });
}

function playWelcomeEntrance() {
  if (prefersReducedMotion) return;

  const heading = document.querySelector(".welcome-mark");
  const title = document.querySelector(".welcome-heading");
  const sub = document.querySelector(".welcome-sub");
  const cards = els.suggestionGrid.querySelectorAll(".suggestion-card");

  [heading, title, sub].forEach((el, i) => {
    if (!el) return;
    animate(
      el,
      { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0px)"] },
      { duration: 0.45, delay: i * 0.06, easing: [0.16, 1, 0.3, 1] }
    );
  });

  if (cards.length) {
    animate(
      cards,
      { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0px)"] },
      { duration: 0.4, delay: stagger(0.05, { start: 0.18 }), easing: [0.16, 1, 0.3, 1] }
    );
  }
}

// =============================================================
// CHAT / COMPOSER
// =============================================================

function initializeChat() {
  els.newChatBtn.addEventListener("click", resetChat);
}

function initializeComposer() {
  els.composerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage();
  });

  els.messageInput.addEventListener("input", () => {
    autoResizeTextarea();
    updateSendButtonState();
  });

  els.messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  updateSendButtonState();
}

function autoResizeTextarea() {
  const ta = els.messageInput;
  ta.style.height = "auto";
  const next = Math.min(ta.scrollHeight, MAX_TEXTAREA_HEIGHT);
  ta.style.height = `${next}px`;
  ta.style.overflowY = ta.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
}

function resetTextarea() {
  els.messageInput.value = "";
  els.messageInput.style.height = "auto";
  els.messageInput.style.overflowY = "hidden";
}

function updateSendButtonState() {
  const hasText =
    els.messageInput.value.trim().length > 0;

  const hasFile =
    !!state.attachedFile;

  els.sendBtn.disabled =
    (!hasText && !hasFile) ||
    state.isSending ||
    state.isParsingFile;
}

async function sendMessage() {
  const text = els.messageInput.value.trim();
  const attachedFile = state.attachedFile?.file || null;

  if (
    (!text && !attachedFile) ||
    state.isSending
  ) {
    return;
  }

  if (!attachedFile && text.length > MAX_CHAT_MESSAGE_LENGTH) {
    showTransientError(
      `Message is too long. Maximum length is ${MAX_CHAT_MESSAGE_LENGTH} characters.`
    );
    return;
  }

  if (
    attachedFile &&
    text.length > MAX_RECRUITER_MESSAGE_LENGTH
  ) {
    showTransientError(
      `Recruiter instruction is too long. Maximum length is ${MAX_RECRUITER_MESSAGE_LENGTH} characters.`
    );
    return;
  }

  state.isSending = true;

  showWelcomeIfFirstMessage();

  const userDisplayMessage = attachedFile
    ? (
      text
        ? `${text}\n\nAttachment:${attachedFile.name}`
        : `Analyze this job description: ${attachedFile.name}`
    )
    : text;

  addMessage(
    "user",
    userDisplayMessage
  );

  clearAttachment();
  resetTextarea();
  updateSendButtonState();

  setSendButtonLoading(true);

  const requestController = new AbortController();
  state.activeRequestController = requestController;

  const thinkingEl = addThinkingIndicator();

  // ---------------------------------------------------------
  // JOB DESCRIPTION FLOW
  // ---------------------------------------------------------

  if (attachedFile) {
    try {
      console.log("[JD ANALYZE] Sending file for analysis...");

      const analysis = await analyzeJobDescription(
        attachedFile,
        text,
        requestController
      );

      console.log("[JD ANALYZE] Analysis received.");

      removeThinkingIndicator(thinkingEl);
      addMessage("assistant", formatJDAnalysisMarkdown(analysis));

    } catch (error) {
      const wasCancelledByReset =
        error?.name === "AbortError" &&
        state.activeRequestController !== requestController;

      if (!wasCancelledByReset) {
        console.error("[JD ANALYZE] Request failed:", error);
        removeThinkingIndicator(thinkingEl);
        addMessage(
          "assistant",
          error.message || "I couldn't analyze this job description right now."
        );
      }
    } finally {
      if (state.activeRequestController === requestController) {
        state.activeRequestController = null;
        state.isSending = false;
        state.isParsingFile = false;

        setSendButtonLoading(false);
        updateSendButtonState();
        els.messageInput.focus();
      }
    }
    return;
  }

  // ---------------------------------------------------------
  // NORMAL CHAT STREAMING FLOW
  // ---------------------------------------------------------

  const historyForRequest = [...state.conversationHistory];
  let streamTimeoutId = null;

  const resetStreamTimeout = () => {
    clearTimeout(streamTimeoutId);
    streamTimeoutId = setTimeout(() => {
      requestController.abort();
    }, CHAT_STREAM_TIMEOUT_MS);
  };

  try {
    console.log("[CHAT] Sending streaming request...");
    resetStreamTimeout();

    const response = await fetch(`${BACKEND_BASE_URL}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: requestController.signal,
      body: JSON.stringify({
        message: text,
        history: historyForRequest,
      }),
    });

    console.log("[CHAT] Stream response:", response.status);

    if (!response.ok) {
      let message = "Failed to generate AI response.";
      try {
        const data = await response.json();
        if (data?.detail) {
          message = data.detail;
        }
      } catch { }
      throw new Error(message);
    }

    if (!response.body) {
      throw new Error("Streaming is not supported by this browser.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";
    let streamingMessage = null;
    let hasReceivedFirstChunk = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      resetStreamTimeout();
      const chunk = decoder.decode(value, { stream: true });
      if (!chunk) continue;

      fullResponse += chunk;

      if (!hasReceivedFirstChunk) {
        hasReceivedFirstChunk = true;
        removeThinkingIndicator(thinkingEl);
        streamingMessage = createStreamingAssistantMessage();
      }

      streamingMessage.content.innerHTML = renderMarkdown(fullResponse);
      scrollToLatestMessage();
    }

    const finalChunk = decoder.decode();
    if (finalChunk) {
      fullResponse += finalChunk;

      if (!streamingMessage) {
        removeThinkingIndicator(thinkingEl);
        streamingMessage = createStreamingAssistantMessage();
      }

      streamingMessage.content.innerHTML = renderMarkdown(fullResponse);
      scrollToLatestMessage();
    }

    if (!fullResponse.trim()) {
      throw new Error("AI backend returned an empty response.");
    }

    state.conversationHistory.push({ role: "user", content: text });
    state.conversationHistory.push({ role: "assistant", content: fullResponse });

  } catch (error) {
    const wasCancelledByReset =
      error?.name === "AbortError" &&
      state.activeRequestController !== requestController;

    if (!wasCancelledByReset) {
      console.error("[CHAT] Streaming request failed:", error);
      removeThinkingIndicator(thinkingEl);

      const message =
        error?.name === "AbortError"
          ? "The AI response timed out. Please try again."
          : "I couldn't reach the AI backend right now. Please try again in a moment.";

      addMessage("assistant", message);
    }
  } finally {
    clearTimeout(streamTimeoutId);

    if (state.activeRequestController === requestController) {
      state.activeRequestController = null;
      setSendButtonLoading(false);
      state.isSending = false;
      state.isParsingFile = false;
      updateSendButtonState();
      els.messageInput.focus();
    }
  }
}

function setSendButtonLoading(isLoading) {
  els.sendBtn.classList.toggle("is-loading", isLoading);

  const hasText = els.messageInput.value.trim().length > 0;
  const hasFile = !!state.attachedFile;

  els.sendBtn.disabled =
    isLoading ||
    (!hasText && !hasFile) ||
    state.isParsingFile;
}

function showWelcomeIfFirstMessage() {
  if (state.hasMessages) return;
  state.hasMessages = true;
  els.welcomeScreen.style.display = "none";
  els.messagesContainer.classList.add("is-active");
}

function addMessage(role, content) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role === "user" ? "message-row-user" : "message-row-assistant"}`;

  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "P";
    wrapper.appendChild(avatar);
  }

  const body = document.createElement("div");
  body.className = "message-body";

  if (role === "assistant") {
    const roleLabel = document.createElement("div");
    roleLabel.className = "message-role";
    roleLabel.textContent = "Prajwal AI";
    body.appendChild(roleLabel);

    const content_ = document.createElement("div");
    content_.className = "message-assistant-content";
    content_.innerHTML = renderMarkdown(content);
    body.appendChild(content_);

    const actions = document.createElement("div");
    actions.className = "message-actions";
    actions.appendChild(createActionButton("copy", "Copy", () => copyToClipboard(content)));
    actions.appendChild(createActionButton("refresh-cw", "Regenerate", () => { }));
    body.appendChild(actions);
  } else {
    const bubble = document.createElement("div");
    bubble.className = "message-user-bubble";
    bubble.textContent = content;
    body.appendChild(bubble);
  }

  wrapper.appendChild(body);
  els.messagesContainer.appendChild(wrapper);
  renderLucideIcons();
  scrollToLatestMessage();

  if (!prefersReducedMotion) {
    animate(
      wrapper,
      { opacity: [0, 1], transform: ["translateY(8px)", "translateY(0px)"] },
      { duration: 0.32, easing: [0.16, 1, 0.3, 1] }
    );
  }

  return wrapper;
}

function createStreamingAssistantMessage() {
  const wrapper = document.createElement("div");
  wrapper.className = "message message-row-assistant";

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = "P";

  const body = document.createElement("div");
  body.className = "message-body";

  const roleLabel = document.createElement("div");
  roleLabel.className = "message-role";
  roleLabel.textContent = "Prajwal AI";

  const content = document.createElement("div");
  content.className = "message-assistant-content";
  content.setAttribute("aria-live", "polite");

  body.appendChild(roleLabel);
  body.appendChild(content);

  wrapper.appendChild(avatar);
  wrapper.appendChild(body);

  els.messagesContainer.appendChild(wrapper);
  renderLucideIcons();
  scrollToLatestMessage();

  if (!prefersReducedMotion) {
    animate(
      wrapper,
      { opacity: [0, 1], transform: ["translateY(8px)", "translateY(0px)"] },
      { duration: 0.28, easing: [0.16, 1, 0.3, 1] }
    );
  }

  return { wrapper, content };
}

function createActionButton(icon, label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn";
  btn.setAttribute("data-tooltip", label);
  btn.setAttribute("aria-label", label);
  btn.innerHTML = `<i data-lucide="${icon}"></i>`;
  btn.addEventListener("click", onClick);
  return btn;
}

function addThinkingIndicator() {
  const wrapper = document.createElement("div");
  wrapper.className = "message message-row-assistant";
  wrapper.innerHTML = `
    <div class="message-avatar">P</div>
    <div class="message-body">
      <div class="message-role">Prajwal AI</div>
      <div class="thinking-indicator" aria-label="Prajwal AI is thinking">
        <span class="thinking-dot"></span>
        <span class="thinking-dot"></span>
        <span class="thinking-dot"></span>
      </div>
    </div>
  `;
  els.messagesContainer.appendChild(wrapper);
  scrollToLatestMessage();
  return wrapper;
}

function removeThinkingIndicator(el) {
  if (el && el.parentNode) {
    el.parentNode.removeChild(el);
  }
}

function scrollToLatestMessage() {
  requestAnimationFrame(() => {
    els.chatArea.scrollTo({
      top: els.chatArea.scrollHeight,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  });
}

function resetChat() {
  if (state.activeRequestController) {
    state.activeRequestController.abort();
    state.activeRequestController = null;
  }

  state.hasMessages = false;
  state.isSending = false;
  state.isParsingFile = false;
  state.conversationHistory = [];
  els.messagesContainer.innerHTML = "";
  els.messagesContainer.classList.remove("is-active");
  els.welcomeScreen.style.display = "flex";

  clearAttachment();
  resetTextarea();
  updateSendButtonState();

  if (!prefersReducedMotion) {
    animate(
      els.welcomeScreen,
      { opacity: [0, 1] },
      { duration: 0.3, easing: "ease-out" }
    );
  }

  els.messageInput.focus();
}

// =============================================================
// REAL AI BACKEND
// =============================================================

async function getAssistantResponse(userText, history) {
  const response = await fetch(`${BACKEND_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: userText, history: history }),
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error("Invalid response received from backend.");
  }

  if (!response.ok) {
    throw new Error(data?.detail || "Failed to generate AI response.");
  }

  if (!data?.response) {
    throw new Error("AI backend returned an empty response.");
  }

  return data.response;
}

// =============================================================
// FILE ATTACHMENT
// =============================================================

function initializeFileUpload() {
  els.attachBtn.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", handleFileSelection);
  els.attachmentRemove.addEventListener("click", clearAttachment);
}

async function analyzeJobDescription(file, userMessage, requestController) {
  const formData = new FormData();
  formData.append("file", file);

  if (userMessage && userMessage.trim()) {
    formData.append("message", userMessage.trim());
  }

  const timeoutId = setTimeout(() => {
    requestController.abort();
  }, JD_ANALYSIS_TIMEOUT_MS);

  try {
    const response = await fetch(`${BACKEND_BASE_URL}/api/jd/analyze`, {
      method: "POST",
      body: formData,
      signal: requestController.signal,
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      throw new Error("Invalid response received from JD analysis backend.");
    }

    if (!response.ok) {
      throw new Error(data?.detail || "Failed to analyze the job description.");
    }

    if (!data) {
      throw new Error("JD analysis returned an empty response.");
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function formatJDAnalysisMarkdown(analysis) {
  const formatList = (items) => {
    if (!Array.isArray(items) || items.length === 0) return "_None identified._";
    return items.map((item) => `- ${item}`).join("\n");
  };

  const alignment = analysis.overall_alignment
    ? analysis.overall_alignment.charAt(0).toUpperCase() + analysis.overall_alignment.slice(1)
    : "Unknown";

  return `
## Job Fit Analysis

**Overall Alignment:** ${alignment}

### Summary

${analysis.summary}

### Strong Matches

${formatList(analysis.strong_matches)}

### Partial Matches

${formatList(analysis.partial_matches)}

### Gaps

${formatList(analysis.gaps)}

### Relevant Projects

${formatList(analysis.relevant_projects)}

### Relevant Experience

${formatList(analysis.relevant_experience)}
`.trim();
}

function handleFileSelection(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const extension = `.${file.name.split(".").pop().toLowerCase()}`;

  if (!ACCEPTED_FILE_TYPES.includes(extension)) {
    showTransientError(`Unsupported file type. Please attach a ${ACCEPTED_FILE_TYPES.join(", ")} file.`);
    clearAttachment();
    return;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    showTransientError("File is too large. Maximum size is 10 MB.");
    clearAttachment();
    return;
  }

  state.attachedFile = { file, name: file.name, extension };
  state.parsedDocument = null;
  state.isParsingFile = false;

  renderAttachmentPreview();
  els.attachmentType.textContent = `${extension.replace(".", "").toUpperCase()} · Ready to analyze`;
  updateSendButtonState();
}

function renderAttachmentPreview() {
  if (!state.attachedFile) {
    hideAttachmentPreview();
    return;
  }
  els.attachmentName.textContent = state.attachedFile.name;
  els.attachmentType.textContent = `${state.attachedFile.extension.replace(".", "").toUpperCase()} · Ready to analyze`;
  showAttachmentPreview();
}

function showAttachmentPreview() {
  const el = els.attachmentPreview;
  el.classList.add("is-visible");
  renderLucideIcons();

  if (!prefersReducedMotion) {
    animate(
      el,
      { opacity: [0, 1], transform: ["translateY(6px) scale(0.98)", "translateY(0px) scale(1)"] },
      { duration: 0.24, easing: [0.16, 1, 0.3, 1] }
    );
  }
}

function hideAttachmentPreview() {
  const el = els.attachmentPreview;
  if (!el.classList.contains("is-visible")) return;

  if (!prefersReducedMotion) {
    animate(
      el,
      { opacity: [1, 0], transform: ["translateY(0px) scale(1)", "translateY(6px) scale(0.98)"] },
      { duration: 0.16, easing: "ease-in" }
    ).finished.then(() => el.classList.remove("is-visible"));
  } else {
    el.classList.remove("is-visible");
  }
}

function clearAttachment() {
  hideTooltip();
  state.attachedFile = null;
  state.parsedDocument = null;
  state.isParsingFile = false;
  hideAttachmentPreview();
  els.fileInput.value = "";
  updateSendButtonState();
}

function showTransientError(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(8px);
    background: var(--elevated-surface); color: var(--text-primary);
    border: 1px solid var(--danger); padding: 10px 16px; border-radius: 10px;
    font-size: 13px; z-index: 300; box-shadow: var(--shadow-md); opacity: 0;
    max-width: 90vw; text-align: center;
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transition = "opacity 200ms ease, transform 200ms ease";
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0)";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(8px)";
    setTimeout(() => toast.remove(), 220);
  }, 3200);
}

// =============================================================
// CLIPBOARD
// =============================================================

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) { }
}

// =============================================================
// LIGHTWEIGHT MARKDOWN RENDERER
// =============================================================

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderInline(text) {
  let out = escapeHtml(text);
  const codePlaceholders = [];

  out = out.replace(/`([^`]+)`/g, (_, code) => {
    const index = codePlaceholders.length;
    codePlaceholders.push(`<code>${code}</code>`);
    return `@@CODE_${index}@@`;
  });

  const linkPlaceholders = [];
  out = out.replace(/\[([^\]]+)\]\(((?:https?:\/\/\vert{}mailto:\vert{}tel:)[^\s)]+)\)/g, (_, label, url) => {
    const index = linkPlaceholders.length;
    linkPlaceholders.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    return `@@LINK_${index}@@`;
  });

  out = out.replace(/https?:\/\/[^\s<]+/g, (url) => {
    const trailingMatch = url.match(/[.,!?;:]+$/);
    const trailing = trailingMatch ? trailingMatch[0] : "";
    const cleanUrl = trailing ? url.slice(0, -trailing.length) : url;
    return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${trailing}`;
  });

  out = out.replace(/(?<![\w.-])([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})(?![\w.-])/g, '<a href="mailto:$1">$1</a>');

  out = out.replace(/(?<![\d])(\+91[\s-]?)?[6-9]\d{3}[\s-]?\d{3}[\s-]?\d{3}(?![\d])/g, (phone) => {
    const digits = phone.replace(/\D/g, "");
    const internationalNumber = phone.trim().startsWith("+91") ? `+${digits}` : `+91${digits}`;
    return `<a href="tel:${internationalNumber}">${phone}</a>`;
  });

  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");

  out = out.replace(/@@LINK_(\d+)@@/g, (_, index) => linkPlaceholders[Number(index)]);
  out = out.replace(/@@CODE_(\d+)@@/g, (_, index) => codePlaceholders[Number(index)]);

  return out;
}

function renderMarkdown(md) {
  const lines = md.split("\n");
  let html = "";
  let inCodeBlock = false;
  let codeBuffer = [];
  let listType = null;

  const closeList = () => {
    if (listType) {
      html += listType === "ul" ? "</ul>" : "</ol>";
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;

    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        html += `<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`;
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        closeList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      html += `<h${level}>${renderInline(headingMatch[2])}</h${level}>`;
      continue;
    }

    const blockquoteMatch = line.match(/^>\s?(.*)/);
    if (blockquoteMatch) {
      closeList();
      html += `<blockquote>${renderInline(blockquoteMatch[1])}</blockquote>`;
      continue;
    }

    const ulMatch = line.match(/^[-*]\s+(.*)/);
    if (ulMatch) {
      if (listType !== "ul") {
        closeList();
        html += "<ul>";
        listType = "ul";
      }
      html += `<li>${renderInline(ulMatch[1])}</li>`;
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.*)/);
    if (olMatch) {
      if (listType !== "ol") {
        closeList();
        html += "<ol>";
        listType = "ol";
      }
      html += `<li>${renderInline(olMatch[1])}</li>`;
      continue;
    }

    closeList();
    html += `<p>${renderInline(line)}</p>`;
  }

  closeList();
  if (inCodeBlock && codeBuffer.length) {
    html += `<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`;
  }

  return html;
}

// =============================================================
// TOOLTIPS
// =============================================================

function initializeTooltips() {
  document.addEventListener("mouseover", (e) => {
    const target = e.target.closest("[data-tooltip]");
    if (target) showTooltip(target);
  });

  document.addEventListener("mouseout", (e) => {
    const target = e.target.closest("[data-tooltip]");
    if (target) hideTooltip();
  });

  document.addEventListener("focus", (e) => {
    const target = e.target.closest && e.target.closest("[data-tooltip]");
    if (target) showTooltip(target);
  }, true);

  document.addEventListener("blur", (e) => {
    const target = e.target.closest && e.target.closest("[data-tooltip]");
    if (target) hideTooltip();
  }, true);

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-tooltip]")) {
      hideTooltip();
    }
  });
}

function showTooltip(el) {
  if (!els.customTooltip) return;

  const label = el.getAttribute("data-tooltip");
  if (!label) return;

  els.customTooltip.textContent = label;

  const targetRect = el.getBoundingClientRect();
  const tooltipRect = els.customTooltip.getBoundingClientRect();

  let top = targetRect.top - tooltipRect.height - 8;
  let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);

  if (top < 8) {
    top = targetRect.bottom + 8;
    if (top + tooltipRect.height > window.innerHeight - 8) {
      top = window.innerHeight - tooltipRect.height - 8;
    }
  }

  if (left < 8) {
    left = 8;
  } else if (left + tooltipRect.width > window.innerWidth - 8) {
    left = window.innerWidth - tooltipRect.width - 8;
  }

  els.customTooltip.style.top = `${top}px`;
  els.customTooltip.style.left = `${left}px`;
  els.customTooltip.classList.add("is-visible");
}

function hideTooltip() {
  if (els.customTooltip) {
    els.customTooltip.classList.remove("is-visible");
  }
}

// =============================================================
// STORAGE HELPERS
// =============================================================

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) { }
}

// =============================================================
// BOOT
// =============================================================

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}