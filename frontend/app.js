// =============================================================
// Prajwal AI — Frontend application logic (vanilla JS)
// =============================================================

import { animate, stagger } from "https://cdn.jsdelivr.net/npm/motion@10.18.0/+esm";

// ---------- Config ----------
const BACKEND_BASE_URL = "http://127.0.0.1:8000";
const THEME_STORAGE_KEY = "portfolio_ai_theme";
const SIDEBAR_STORAGE_KEY = "portfolio_ai_sidebar";
const MAX_TEXTAREA_HEIGHT = 160;
const ACCEPTED_FILE_TYPES = [".pdf", ".docx", ".txt"];

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Centralized state ----------
const state = {
  isSending: false,
  hasMessages: false,
  attachedFile: null,
  conversationHistory: [],
  parsedDocument: null,
  isParsingFile: false,
  mobileMediaQuery: window.matchMedia("(max-width: 900px)"),
};

// ---------- DOM refs (populated on DOMContentLoaded) ----------
const els = {};

function cacheDom() {
  els.app = document.getElementById("app");
  els.sidebar = document.getElementById("sidebar");
  els.sidebarInner = document.getElementById("sidebarInner");
  els.sidebarOverlay = document.getElementById("sidebarOverlay");
  els.sidebarCloseBtn = document.getElementById("sidebarCloseBtn");
  els.sidebarExpandBtn = document.getElementById("sidebarExpandBtn");
  els.menuBtn = document.getElementById("menuBtn");
  els.newChatBtn = document.getElementById("newChatBtn");

  els.themeToggle = document.getElementById("themeToggle");
  els.themeToggleMobile = document.getElementById("themeToggleMobile");

  els.backendStatus = document.getElementById("backendStatus");
  els.backendStatusDot = document.getElementById("backendStatusDot");
  els.backendStatusText = document.getElementById("backendStatusText");

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
}

// =============================================================
// APP BOOTSTRAP
// =============================================================

function initializeApp() {
  cacheDom();
  renderLucideIcons();
  initializeTheme();
  initializeSidebar();
  initializeComposer();
  initializeFileUpload();
  initializeSuggestionCards();
  initializeChat();
  initializeTooltips();
  checkBackendHealth();
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
  els.themeToggleMobile.addEventListener("click", toggleTheme);
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
// SIDEBAR
// =============================================================

function initializeSidebar() {
  const isMobile = state.mobileMediaQuery.matches;
  const saved = safeGetItem(SIDEBAR_STORAGE_KEY);

  if (isMobile) {
    // Mobile always starts as a closed drawer, regardless of any
    // desktop-collapsed state saved previously — the two contexts
    // must never trap each other.
    els.sidebar.classList.remove("is-collapsed");
    closeSidebar({ persist: false, animate: false });
  } else {
    els.sidebarOverlay.classList.remove("is-visible");
    if (saved === "closed") {
      setSidebarCollapsed(true, { animate: false });
    } else {
      setSidebarCollapsed(false, { animate: false });
    }
  }

  els.menuBtn.addEventListener("click", () => openSidebar());
  els.sidebarCloseBtn.addEventListener("click", () => closeSidebar());
  els.sidebarExpandBtn.addEventListener("click", () => openSidebar());
  els.sidebarOverlay.addEventListener("click", () => closeSidebar());

  state.mobileMediaQuery.addEventListener("change", (e) => {
    if (e.matches) {
      // switched to mobile: drop desktop collapse concept, start closed drawer
      els.sidebar.classList.remove("is-collapsed");
      els.sidebarExpandBtn.classList.remove("is-visible");
      els.sidebarExpandBtn.hidden = true;
      closeSidebar({ persist: false, animate: false });
    } else {
      // switched to desktop: overlay must never linger; restore saved collapse state
      els.sidebar.classList.remove("is-open");
      els.sidebarOverlay.classList.remove("is-visible");
      const savedNow = safeGetItem(SIDEBAR_STORAGE_KEY);
      setSidebarCollapsed(savedNow === "closed", { animate: false });
    }
  });

  // Escape closes the mobile drawer
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.mobileMediaQuery.matches) {
      closeSidebar();
    }
  });
}

function openSidebar() {
  hideTooltip(); // clear stale tooltips
  const isMobile = state.mobileMediaQuery.matches;

  if (isMobile) {
    els.sidebar.classList.add("is-open");
    els.sidebarOverlay.classList.add("is-visible");
    if (!prefersReducedMotion) {
      animate(els.sidebarOverlay, { opacity: [0, 1] }, { duration: 0.22, easing: "ease-out" });
      animate(els.sidebar, { transform: ["translateX(-100%)", "translateX(0%)"] }, {
        duration: 0.3,
        easing: [0.4, 0, 0.2, 1],
      });
    }
  } else {
    setSidebarCollapsed(false, { animate: true });
  }

  safeSetItem(SIDEBAR_STORAGE_KEY, "open");
}

function closeSidebar({ persist = true, animate: shouldAnimate = true } = {}) {
  hideTooltip(); // clear stale tooltips
  const isMobile = state.mobileMediaQuery.matches;

  if (isMobile) {
    const finish = () => {
      els.sidebar.classList.remove("is-open");
      els.sidebarOverlay.classList.remove("is-visible");
    };

    if (shouldAnimate && !prefersReducedMotion) {
      animate(els.sidebarOverlay, { opacity: [1, 0] }, { duration: 0.2, easing: "ease-in" });
      animate(els.sidebar, { transform: ["translateX(0%)", "translateX(-100%)"] }, {
        duration: 0.26,
        easing: [0.4, 0, 0.2, 1],
      }).finished.then(finish);
    } else {
      finish();
    }
  } else {
    setSidebarCollapsed(true, { animate: shouldAnimate });
  }

  if (persist) {
    safeSetItem(SIDEBAR_STORAGE_KEY, "closed");
  }
}

// Desktop-only: collapses the sidebar to zero width so the main
// chat area reclaims the space, rather than merely hiding it.
function setSidebarCollapsed(collapsed, { animate: shouldAnimate = true } = {}) {
  hideTooltip(); // clear stale tooltips on layout shift
  els.sidebar.classList.toggle("is-collapsed", collapsed);

  if (collapsed) {
    els.sidebarExpandBtn.hidden = false;
    requestAnimationFrame(() => els.sidebarExpandBtn.classList.add("is-visible"));
  } else {
    els.sidebarExpandBtn.classList.remove("is-visible");
    setTimeout(() => {
      if (!els.sidebar.classList.contains("is-collapsed")) {
        els.sidebarExpandBtn.hidden = true;
      }
    }, 200);
  }

  if (shouldAnimate && !prefersReducedMotion) {
    animate(
      els.sidebarInner,
      { opacity: collapsed ? [1, 0] : [0, 1] },
      { duration: collapsed ? 0.15 : 0.22, delay: collapsed ? 0 : 0.08, easing: "ease-out" }
    );
  }
}

// =============================================================
// BACKEND HEALTH
// =============================================================

async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${BACKEND_BASE_URL}/api/health`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      setBackendStatus(true);
    } else {
      setBackendStatus(false);
    }
  } catch (err) {
    setBackendStatus(false);
  }
}

function setBackendStatus(isOnline) {
  els.backendStatus.classList.toggle("is-online", isOnline);
  els.backendStatus.classList.toggle("is-offline", !isOnline);
  els.backendStatusText.textContent = isOnline ? "AI backend connected" : "Backend unavailable";
  els.backendStatus.setAttribute(
    "data-tooltip",
    isOnline ? "AI backend connected" : "Backend unavailable — running in demo mode"
  );
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
    // Shift+Enter: default behavior (newline) is preserved.
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

  els.sendBtn.disabled =
    !hasText ||
    state.isSending ||
    state.isParsingFile;
}

async function sendMessage() {
  const text = els.messageInput.value.trim();

  if (!text || state.isSending) return;

  state.isSending = true;
  showWelcomeIfFirstMessage();

  addMessage("user", text);

  clearAttachment();
  resetTextarea();
  updateSendButtonState();

  setSendButtonLoading(true);

  const thinkingEl = addThinkingIndicator();

  // Snapshot previous conversation BEFORE adding this turn.
  const historyForRequest = [...state.conversationHistory];

  try {
    console.log("[CHAT] Sending streaming request...");

    // -------------------------------------------------------
    // IMPORTANT:
    // Start the network request FIRST.
    // Only create the streaming UI once the request succeeds.
    // This prevents UI helper failures from blocking fetch().
    // -------------------------------------------------------
    const response = await fetch(
      `${BACKEND_BASE_URL}/api/chat/stream`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          message: text,
          history: historyForRequest,
        }),
      }
    );

    console.log(
      "[CHAT] Stream response:",
      response.status
    );

    if (!response.ok) {
      let message = "Failed to generate AI response.";

      try {
        const data = await response.json();

        if (data?.detail) {
          message = data.detail;
        }
      } catch {
        // Keep fallback message.
      }

      throw new Error(message);
    }

    if (!response.body) {
      throw new Error(
        "Streaming is not supported by this browser."
      );
    }

    const reader = response.body.getReader();

    const decoder = new TextDecoder();

    let fullResponse = "";

    let streamingMessage = null;
    let hasReceivedFirstChunk = false;

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      const chunk = decoder.decode(
        value,
        { stream: true }
      );

      if (!chunk) {
        continue;
      }

      fullResponse += chunk;

      // Remove the thinking pulse ONLY when the first
      // actual streamed content arrives.
      if (!hasReceivedFirstChunk) {
        hasReceivedFirstChunk = true;

        removeThinkingIndicator(thinkingEl);

        streamingMessage =
          createStreamingAssistantMessage();
      }

      streamingMessage.content.innerHTML =
        renderMarkdown(fullResponse);

      scrollToLatestMessage();
    }

    // Flush any remaining decoder bytes.
    const finalChunk = decoder.decode();

    if (finalChunk) {
      fullResponse += finalChunk;

      streamingMessage.content.innerHTML =
        renderMarkdown(fullResponse);

      scrollToLatestMessage();
    }

    if (!fullResponse.trim()) {
      throw new Error(
        "AI backend returned an empty response."
      );
    }

    // Save the completed conversation turn.
    state.conversationHistory.push({
      role: "user",
      content: text,
    });

    state.conversationHistory.push({
      role: "assistant",
      content: fullResponse,
    });

  } catch (error) {
    console.error(
      "[CHAT] Streaming request failed:",
      error
    );

    removeThinkingIndicator(thinkingEl);

    addMessage(
      "assistant",
      "I couldn't reach the AI backend right now. Please try again in a moment."
    );

  } finally {
    setSendButtonLoading(false);

    state.isSending = false;

    updateSendButtonState();

    els.messageInput.focus();
  }
}

function setSendButtonLoading(isLoading) {
  els.sendBtn.classList.toggle("is-loading", isLoading);
  els.sendBtn.disabled = isLoading || els.messageInput.value.trim().length === 0;
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
      {
        opacity: [0, 1],
        transform: [
          "translateY(8px)",
          "translateY(0px)"
        ]
      },
      {
        duration: 0.28,
        easing: [0.16, 1, 0.3, 1]
      }
    );
  }

  return {
    wrapper,
    content
  };
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
  state.hasMessages = false;
  state.isSending = false;
  state.conversationHistory = [];
  els.messagesContainer.innerHTML = "";
  els.messagesContainer.classList.remove("is-active");
  els.welcomeScreen.style.display = "flex";

  clearAttachment();
  resetTextarea();
  updateSendButtonState();

  if (state.mobileMediaQuery.matches) {
    closeSidebar();
  }

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
  const response = await fetch(
    `${BACKEND_BASE_URL}/api/chat`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        message: userText,
        history: history,
      }),
    }
  );

  let data = null;

  try {
    data = await response.json();
  } catch (error) {
    throw new Error("Invalid response received from backend.");
  }

  if (!response.ok) {
    throw new Error(
      data?.detail || "Failed to generate AI response."
    );
  }

  if (!data?.response) {
    throw new Error("AI backend returned an empty response.");
  }

  return data.response;
}

async function streamAssistantResponse(
  userText,
  history,
  onChunk
) {
  const response = await fetch(
    `${BACKEND_BASE_URL}/api/chat/stream`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        message: userText,
        history: history,
      }),
    }
  );

  if (!response.ok) {
    let message = "Failed to start AI response stream.";

    try {
      const data = await response.json();

      if (data?.detail) {
        message = data.detail;
      }
    } catch {
      // Keep fallback message.
    }

    throw new Error(message);
  }

  if (!response.body) {
    throw new Error(
      "Streaming is not supported by this browser."
    );
  }

  const reader = response.body.getReader();

  const decoder = new TextDecoder();

  let fullResponse = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    const chunk = decoder.decode(
      value,
      { stream: true }
    );

    fullResponse += chunk;

    onChunk(
      fullResponse
    );
  }

  return fullResponse;
}

// =============================================================
// FILE ATTACHMENT
// =============================================================

function initializeFileUpload() {
  els.attachBtn.addEventListener("click", () => {
    els.fileInput.click();
  });

  els.fileInput.addEventListener("change", handleFileSelection);
  els.attachmentRemove.addEventListener("click", clearAttachment);
}

async function handleFileSelection(e) {
  const file =
    e.target.files && e.target.files[0];

  if (!file) return;

  const extension =
    `.${file.name.split(".").pop().toLowerCase()}`;

  if (!ACCEPTED_FILE_TYPES.includes(extension)) {
    showTransientError(
      `Unsupported file type. Please attach a ${ACCEPTED_FILE_TYPES.join(", ")} file.`
    );

    clearAttachment();
    return;
  }

  // Store the selected file for the current UI state.
  state.attachedFile = {
    name: file.name,
    extension,
  };

  state.parsedDocument = null;
  state.isParsingFile = true;

  renderAttachmentPreview();

  // Update status text while backend parses the file.
  els.attachmentType.textContent =
    `${extension.replace(".", "").toUpperCase()} · Processing...`;

  try {
    const formData = new FormData();

    formData.append("file", file);

    const response = await fetch(
      `${BACKEND_BASE_URL}/api/jd/parse`,
      {
        method: "POST",
        body: formData,
      }
    );

    let data = null;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        "Invalid response received from backend."
      );
    }

    if (!response.ok) {
      throw new Error(
        data?.detail ||
        "Failed to parse the document."
      );
    }

    state.parsedDocument = data;

    els.attachmentType.textContent =
      `${data.file_type} · Ready`;

  } catch (error) {

    console.error(
      "Document parsing failed:",
      error
    );

    state.parsedDocument = null;

    showTransientError(
      error.message ||
      "The document could not be parsed."
    );

    clearAttachment();

  } finally {

    state.isParsingFile = false;

    updateSendButtonState();
  }
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
  // Lightweight, non-blocking error surface — avoids raw browser alerts.
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
  } catch (err) {
    // fail silently and gracefully — clipboard API can be blocked
  }
}

// =============================================================
// LIGHTWEIGHT MARKDOWN RENDERER
// (headings, bold, italic, lists, inline code, code blocks, links, blockquotes)
// =============================================================

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text) {
  let out = escapeHtml(text);

  // ---------------------------------------------------------
  // Protect inline code so URLs/emails/phone numbers inside
  // code blocks are not converted into clickable links.
  // ---------------------------------------------------------
  const codePlaceholders = [];

  out = out.replace(/`([^`]+)`/g, (_, code) => {
    const index = codePlaceholders.length;

    codePlaceholders.push(`<code>${code}</code>`);

    return `@@CODE_${index}@@`;
  });


  // ---------------------------------------------------------
  // Protect Markdown links.
  // Supports:
  // https://
  // http://
  // mailto:
  // tel:
  // ---------------------------------------------------------
  const linkPlaceholders = [];

  out = out.replace(
    /\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^\s)]+)\)/g,
    (_, label, url) => {
      const index = linkPlaceholders.length;

      linkPlaceholders.push(`
        <a
          href="${url}"
          target="_blank"
          rel="noopener noreferrer"
        >${label}</a>
      `);

      return `@@LINK_${index}@@`;
    }
  );


  // ---------------------------------------------------------
  // Convert plain HTTP/HTTPS URLs into clickable links.
  // ---------------------------------------------------------
  out = out.replace(
    /https?:\/\/[^\s<]+/g,
    (url) => {
      const trailingMatch = url.match(/[.,!?;:]+$/);

      const trailing = trailingMatch
        ? trailingMatch[0]
        : "";

      const cleanUrl = trailing
        ? url.slice(0, -trailing.length)
        : url;

      return `
        <a
          href="${cleanUrl}"
          target="_blank"
          rel="noopener noreferrer"
        >${cleanUrl}</a>${trailing}
      `;
    }
  );


  // ---------------------------------------------------------
  // Convert plain email addresses into clickable mailto links.
  // ---------------------------------------------------------
  out = out.replace(
    /(?<![\w.-])([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})(?![\w.-])/g,
    '<a href="mailto:$1">$1</a>'
  );


  // ---------------------------------------------------------
  // Convert phone numbers into clickable tel links.
  //
  // Handles formats such as:
  // +91 8002 974 625
  // +91-8002-974-625
  // 8002974625
  // ---------------------------------------------------------
  out = out.replace(
    /(?<![\d])(\+91[\s-]?)?[6-9]\d{3}[\s-]?\d{3}[\s-]?\d{3}(?![\d])/g,
    (phone) => {
      const digits = phone.replace(/\D/g, "");

      const internationalNumber =
        phone.trim().startsWith("+91")
          ? `+${digits}`
          : `+91${digits}`;

      return `
        <a
          href="tel:${internationalNumber}"
        >${phone}</a>
      `;
    }
  );


  // ---------------------------------------------------------
  // Basic Markdown formatting.
  // ---------------------------------------------------------
  out = out.replace(
    /\*\*([^*]+)\*\*/g,
    "<strong>$1</strong>"
  );

  out = out.replace(
    /(?<!\*)\*([^*]+)\*(?!\*)/g,
    "<em>$1</em>"
  );


  // ---------------------------------------------------------
  // Restore protected Markdown links.
  // ---------------------------------------------------------
  out = out.replace(
    /@@LINK_(\d+)@@/g,
    (_, index) => linkPlaceholders[Number(index)]
  );


  // ---------------------------------------------------------
  // Restore protected inline code.
  // ---------------------------------------------------------
  out = out.replace(
    /@@CODE_(\d+)@@/g,
    (_, index) => codePlaceholders[Number(index)]
  );


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
// TOOLTIPS (custom, delegated so dynamically-added buttons work too)
// =============================================================

function initializeTooltips() {
  // Delegated listeners cover elements added after initial render
  // (e.g. per-message copy/regenerate buttons).
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

  // Cleanly dismiss tooltips when any tooltip element is clicked. 
  // This explicitly prevents "stale" tooltips from lingering when 
  // a button initiates a layout shift, disables, or hides entirely.
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

  // Read raw dimensions cleanly before overriding any styles
  const targetRect = el.getBoundingClientRect();
  const tooltipRect = els.customTooltip.getBoundingClientRect();

  // Baseline attempt: exactly centered above the element
  let top = targetRect.top - tooltipRect.height - 8;
  let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);

  // --- Viewport Boundary Collision Handlers ---

  // Vertical collision: if it clips off the top, flip it below the button
  if (top < 8) {
    top = targetRect.bottom + 8;

    // Failsafe clamp if flipping it hits the bottom
    if (top + tooltipRect.height > window.innerHeight - 8) {
      top = window.innerHeight - tooltipRect.height - 8;
    }
  }

  // Horizontal collision: firmly pad against edge if it clips left/right sides
  if (left < 8) {
    left = 8;
  } else if (left + tooltipRect.width > window.innerWidth - 8) {
    left = window.innerWidth - tooltipRect.width - 8;
  }

  // Set explicitly mapped pixels, allowing CSS to strictly handle animations
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
// STORAGE HELPERS (safe wrappers — never let storage errors break the UI)
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
  } catch (err) {
    // storage unavailable (private browsing, quota, etc.) — fail silently
  }
}

// =============================================================
// BOOT
// =============================================================

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}