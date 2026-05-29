const token = localStorage.getItem("adminToken");
if (!token) {
  window.location.href = "/login.html";
}
// =========================
// STATE
// =========================
const socket = io();
let pcs = {};
let templates = [];
let currentRemotePcId = null;
let previewPcs = new Set();
let autoPreviewEnabled = true;
let viewMode = "grid";
let serverStartTime = Date.now();
let fpsData = {};
let frameCounts = {};
let fullFrameCount = 0;
let fullLastFps = Date.now();

// Template state
let editingTemplateId = null;
let editMessageType = "info";
let customMessageType = "info";
let messageTarget = "all";
let selectedPcId = null;


// Helper for authenticated API calls
async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    if (res.status === 401) {
        logout();
        return;
    }

    return res;
}  

// =========================
// SOCKET CONNECTION
// =========================
socket.on("connect", () => {
  console.log("✅ Connected to server");
  updateConnectionStatus(true);
  socket.emit("authenticate", {
    type: "admin",
    token: token,
  });
});

socket.on("auth-success", (data) => {
  console.log("✅ Admin authenticated");
  socket.emit("register-client", { type: "admin" });
});

socket.on("auth-error", (err) => {
  console.error("❌ Auth failed:", err.message);
  showToast("Authentication failed: " + err.message, "error");
  setTimeout(() => {
    logout();
  }, 2000);
});

socket.on("connect_error", (err) => {
  console.error("❌ Connection error:", err.message);
  updateConnectionStatus(false);
  if (err.message === "IP not allowed") {
    showToast("Your IP is not authorized", "error");
  }
});

socket.on("disconnect", () => {
  console.log("❌ Disconnected");
  updateConnectionStatus(false);
  stopRemoteDesktop();
  previewPcs.clear();
});

function updateConnectionStatus(connected) { 
  const el = document.getElementById("connection-status");
  if (connected) {
    el.textContent = "Connected";
    el.className = "status-badge status-connected";
  } else {
    el.textContent = "Disconnected";
    el.className = "status-badge status-disconnected";
  }
}

// =========================
// TEMPLATE EVENTS
// =========================
socket.on("templates-update", (data) => {
  templates = data;
  document.getElementById("templateCountBadge").textContent = templates.length;
  renderTemplates();
  renderSendTemplates();
});

socket.on("template-success", (data) => {
  showToast(data.message, "success");
});

socket.on("template-error", (data) => {
  showToast(data.message, "error");
});

// =========================
// TEMPLATE CRUD FUNCTIONS
// =========================
function openEditTemplate(id = null) {
  editingTemplateId = id;
  const panel = document.getElementById("editTemplatePanel");
  const title = document.getElementById("editPanelTitle");
  const btn = document.getElementById("addTemplateBtn");

  if (id) {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    title.textContent = "Edit Template";
    document.getElementById("templateTitleInput").value = template.title;
    document.getElementById("templateMessageInput").value = template.message;
    document.getElementById("templateCharCount").textContent =
      template.message.length;
    selectEditType(
      template.type,
      document.querySelector(
        `#editTemplatePanel button[onclick="selectEditType('${template.type}', this)"]`,
      ),
    );
  } else {
    title.textContent = "Add Template";
    document.getElementById("templateTitleInput").value = "";
    document.getElementById("templateMessageInput").value = "";
    document.getElementById("templateCharCount").textContent = "0";
    selectEditType(
      "info",
      document.querySelector(
        "#editTemplatePanel button[onclick=\"selectEditType('info', this)\"]",
      ),
    );
  }

  panel.style.display = "block";
  btn.style.display = "none";
}

function closeEditTemplate() {
  document.getElementById("editTemplatePanel").style.display = "none";
  document.getElementById("addTemplateBtn").style.display = "flex";
  editingTemplateId = null;
}

function selectEditType(type, btn) {
  editMessageType = type;
  const buttons = document.querySelectorAll("#editTemplatePanel .type-btn");
  buttons.forEach((b) => {
    b.classList.remove("active");
  });
  btn.classList.add("active");
}

function selectCustomType(type, btn) {
  customMessageType = type;
  const buttons = document.querySelectorAll("#tab-send .type-btn");
  buttons.forEach((b) => {
    b.classList.remove("active");
  });
  btn.classList.add("active");
}

// Character counter
document.addEventListener("DOMContentLoaded", () => {
  const textarea = document.getElementById("templateMessageInput");
  if (textarea) {
    textarea.addEventListener("input", function () {
      document.getElementById("templateCharCount").textContent =
        this.value.length;
    });
  }
});

function saveTemplate() {
  const title = document.getElementById("templateTitleInput").value.trim();
  const message = document.getElementById("templateMessageInput").value.trim();

  if (!title || !message) {
    showToast("Please fill in all fields", "error");
    return;
  }

  socket.emit("save-template", {
    id: editingTemplateId,
    title,
    message,
    type: editMessageType,
  });

  closeEditTemplate();
}

function deleteTemplate(id) {
  if (!confirm("Are you sure you want to delete this template?")) return;
  socket.emit("delete-template", { id });
}

function renderTemplates() {
  const container = document.getElementById("templatesList");
  const btn = document.getElementById("addTemplateBtn");

  if (templates.length === 0) {
    container.innerHTML = `
                <div class="empty-state">
                    <img class="empty-state-icon-img" src="assets/icons/template.svg" alt="">
                    <p>No templates yet. Click "Add Template" to create one.</p>
                </div>
            `;
    btn.style.display = "flex";
    return;
  }

  container.innerHTML = templates
    .map(
      (t) => `
            <div class="template-card">
                <div class="template-icon">
                    <img class="template-icon-img" src="assets/icons/template.svg" alt="">
                </div>
                <div class="template-content">
                    <div class="template-title">${escapeHtml(t.title)}</div>
                    <div class="template-text">${escapeHtml(t.message)}</div>
                </div>
                <div class="template-actions">
                    <button class="template-btn" onclick="openEditTemplate(${t.id})" title="Edit">Edit</button>
                    <button class="template-btn delete" onclick="deleteTemplate(${t.id})" title="Delete">Delete</button>
                </div>
            </div>
        `,
    )
    .join("");

  btn.style.display = templates.length >= 3 ? "none" : "flex";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function escapeJsString(text) {
  return String(text || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// =========================
// SEND MESSAGE FUNCTIONS
// =========================
function renderSendTemplates() {
  const container = document.getElementById("sendTemplatesList");
  const noMsg = document.getElementById("noTemplatesMsg");

  if (templates.length === 0) {
    container.innerHTML = "";
    noMsg.style.display = "block";
    return;
  }

  noMsg.style.display = "none";
  container.innerHTML = templates
    .map(
      (t) => `
            <div class="send-template-item" onclick="sendTemplateMessage(${t.id})">
                <div class="send-template-head">
                    <img class="nav-icon" src="assets/icons/template.svg" alt="">
                    <span class="send-template-title">${escapeHtml(t.title)}</span>
                    <span class="template-type-chip ${t.type}">${t.type}</span>
                </div>
                <div class="send-template-preview">${escapeHtml(t.message)}</div>
            </div>
        `,
    )
    .join("");
}

function sendTemplateMessage(templateId) {
  const template = templates.find((t) => t.id === templateId);
  if (!template) return;

  if (messageTarget === "select" && !selectedPcId) {
    showToast("Please select a PC first", "error");
    switchTab(document.querySelector('[onclick*="send"]'), "send");
    return;
  }

  socket.emit("send-template-message", {
    templateId,
    pcId: messageTarget === "select" ? selectedPcId : null,
    sendToAll: messageTarget === "all",
  });

  showToast(`"${template.title}" sent!`, "success");
}

function setTarget(target) {
  messageTarget = target;
  document
    .getElementById("targetAllBtn")
    .classList.toggle("active", target === "all");
  document
    .getElementById("targetSelectBtn")
    .classList.toggle("active", target === "select");
  document.getElementById("pcSelector").style.display =
    target === "select" ? "block" : "none";
  if (target === "all") selectedPcId = null;
}

function renderPcSelector() {
  const container = document.getElementById("pcSelector");
  const onlinePcs = Object.entries(pcs).filter(([_, pc]) => pc.online);

  if (onlinePcs.length === 0) {
    container.innerHTML = `<p class="empty-note">No PCs online</p>`;
    return;
  }

  container.innerHTML = onlinePcs
    .map(
      ([pcKey, pc]) => `
            <div class="pc-select-item ${selectedPcId === pcKey ? "selected" : ""}" onclick="selectPc('${pcKey}')">
                <div class="pc-select-dot"></div>
                <span>${escapeHtml(pc.pcId || pcKey)}</span>
                ${pc.currentGame ? `<span class="pc-select-game">${escapeHtml(pc.currentGame)}</span>` : ""}
            </div>
        `,
    )
    .join("");
}

function selectPc(pcId) {
  selectedPcId = selectedPcId === pcId ? null : pcId;
  renderPcSelector();
}

function sendCustomMessage() {
  const title = document.getElementById("customTitleInput").value.trim();
  const message = document.getElementById("customMessageInput").value.trim();

  if (!title || !message) {
    showToast("Please enter title and message", "error");
    return;
  }

  if (messageTarget === "select" && !selectedPcId) {
    showToast("Please select a PC", "error");
    return;
  }

  socket.emit("send-custom-message", {
    title,
    message,
    type: customMessageType,
    pcId: messageTarget === "select" ? selectedPcId : null,
    sendToAll: messageTarget === "all",
  });

  document.getElementById("customTitleInput").value = "";
  document.getElementById("customMessageInput").value = "";
  showToast("Message sent!", "success");
}

// =========================
// PC MONITORING (existing)
// =========================
socket.on("pcs-update", (data) => { 
  const oldPcs = { ...pcs };
  pcs = data;

  for (const [pcId, pc] of Object.entries(pcs)) {
    if (pc.online && !oldPcs[pcId]?.online && autoPreviewEnabled) {
      startPreview(pcId);
    }
    if (!pc.online && previewPcs.has(pcId)) {
      stopPreview(pcId);
    }
  }

  renderPCs();
  updateSidebarStats();
});

function updateSidebarStats() {
  const pcList = Object.values(pcs);
  const online = pcList.filter((p) => p.online).length;

  document.getElementById("pcCountBadge").textContent = pcList.length;
  document.getElementById("statsOnline").textContent = `${online} Online`;
  document.getElementById("statsPreviewing").textContent =
    `${previewPcs.size} Previewing`;

  const uptime = Math.floor((Date.now() - serverStartTime) / 1000);
  document.getElementById("statsUptime").textContent = formatUptime(uptime);
}

function renderPCs() {
  const container = document.getElementById("pcs-container");
  const pcEntries = Object.entries(pcs);

  if (pcEntries.length === 0) {
    container.innerHTML = `
                <div class="empty-state">
                    <img class="empty-state-icon-img" src="assets/icons/invalid.svg" alt="">
                    <p>No PCs connected yet</p>
                </div>
            `;
    return;
  }

  container.innerHTML = pcEntries
    .map(([pcKey, pc]) => {
      const isOnline = pc.online;
      const isPreviewing = previewPcs.has(pcKey);
      const isFullRemote = currentRemotePcId === pcKey;
      const fps = fpsData[pcKey] || 0;
      const displayName = pc.pcId || pcKey;
      const safePcKey = escapeJsString(pcKey);

      return `
                <div class="pc-card ${isOnline ? "" : "offline"}" id="card-${pcKey}">
                    <div class="preview-container" onclick="handlePreviewClick('${safePcKey}')">
                        ${
                          isOnline
                            ? `
                            <img id="preview-${pcKey}" class="preview-image" style="${isPreviewing ? "" : "display:none;"}" alt="Preview"/>
                            <div id="preview-placeholder-${pcKey}" class="preview-placeholder" style="${isPreviewing ? "display:none;" : ""}">
                                <img class="preview-placeholder-icon" src="assets/icons/preview.svg" alt="">
                                <span>${isPreviewing ? "Loading..." : "Click to preview"}</span>
                            </div>
                        `
                            : `
                            <div class="preview-placeholder">
                                <img class="preview-placeholder-icon" src="assets/icons/offline.svg" alt="">
                                <span>Offline</span>
                            </div>
                        `
                        }
                        <div class="preview-status ${isOnline ? "online" : "offline"}">
                            <span class="status-dot"></span>
                            ${isOnline ? "Online" : "Offline"}
                        </div>
                        ${isPreviewing ? `<div class="preview-fps" id="preview-fps-${pcKey}">${fps} FPS</div>` : ""}
                        ${
                          isOnline
                            ? `
                            <div class="preview-overlay">
                                <button class="preview-btn btn-remote-big" onclick="event.stopPropagation(); startRemoteDesktop('${safePcKey}')">Full Control</button>
                            </div>
                        `
                            : ""
                        }
                    </div>
                    <div class="pc-info">
                        <div class="pc-header">
                            <div class="pc-title-block">
                                <span class="pc-name">${escapeHtml(displayName)}</span>
                                <span class="pc-ip">${escapeHtml(pc.pcIp || pcKey)}</span>
                            </div>
                            <div class="pc-header-actions">
                                <button class="pc-manage-btn" data-pc-ip="${escapeHtml(pcKey)}" data-pc-name="${escapeHtml(displayName)}" onclick="event.stopPropagation(); editPcNameFromButton(this)" title="Edit display name">Edit</button>
                                <button class="pc-manage-btn delete" data-pc-ip="${escapeHtml(pcKey)}" data-pc-name="${escapeHtml(displayName)}" onclick="event.stopPropagation(); deletePcRecordFromButton(this)" title="Delete PC record">Delete</button>
                            </div>
                        </div>
                        ${pc.currentGame ? `<div class="pc-game">${escapeHtml(pc.currentGame)}</div>` : ""}
                        <div class="stats-bar">
                            <div class="stat-item">
                                <div class="stat-label">CPU</div>
                                <div class="stat-value ${getUsageClass(pc.cpuUsage)}">${pc.cpuUsage || 0}%</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">RAM</div>
                                <div class="stat-value ${getUsageClass(pc.ramUsage)}">${pc.ramUsage || 0}%</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">Uptime</div>
                                <div class="stat-value stat-value-small">${formatUptime(pc.uptime)}</div>
                            </div>
                        </div>
                        <div class="pc-actions">
                            ${
                              isOnline
                                ? `
                                <button class="btn btn-remote ${isFullRemote ? "active" : ""}" onclick="event.stopPropagation(); toggleRemoteDesktop('${safePcKey}')" id="btn-remote-${pcKey}">${isFullRemote ? "Controlling" : "Remote"}</button>
                                <button class="btn btn-lock" onclick="event.stopPropagation(); sendCommand('lock', '${safePcKey}')" title="Lock">Lock</button>
                                <button class="btn btn-danger" onclick="event.stopPropagation(); sendCommand('restart', '${safePcKey}')" title="Restart">Restart</button>
                                <button class="btn btn-danger" onclick="event.stopPropagation(); sendCommand('shutdown', '${safePcKey}')" title="Shutdown">Off</button>
                            `
                                : `
                                <span class="offline-note"><img class="nav-icon" src="assets/icons/date.svg" alt=""> Last seen: ${pc.lastSeen ? new Date(pc.lastSeen).toLocaleTimeString() : "Never"}</span>
                            `
                            }
                        </div>
                    </div>
                </div>
            `;
    })
    .join("");
}

function editPcNameFromButton(button) {
  editPcName(button.dataset.pcIp, button.dataset.pcName);
}

function deletePcRecordFromButton(button) {
  deletePcRecord(button.dataset.pcIp, button.dataset.pcName);
}

async function editPcName(pcIp, currentName) {
  const nextName = prompt("Enter a new display name for this PC:", currentName);
  if (nextName === null) return;

  const pcId = nextName.trim();
  if (!pcId) {
    showToast("Display name cannot be empty", "error");
    return;
  }

  try {
    const res = await apiFetch(`/api/pcs/${encodeURIComponent(pcIp)}`, {
      method: "PATCH",
      body: JSON.stringify({ pcId }),
    });
    if (!res) return;

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update PC");

    pcs[pcIp] = data.pc;
    renderPCs();
    renderPcSelector();
    showToast("PC display name updated", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function deletePcRecord(pcIp, displayName) {
  if (!confirm(`Delete "${displayName}" from the PC list? This removes the SQLite record for ${pcIp}.`)) return;

  try {
    const res = await apiFetch(`/api/pcs/${encodeURIComponent(pcIp)}`, {
      method: "DELETE",
    });
    if (!res) return;

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to delete PC");

    if (currentRemotePcId === pcIp) stopRemoteDesktop();
    if (previewPcs.has(pcIp)) {
      previewPcs.delete(pcIp);
      delete frameCounts[pcIp];
      delete fpsData[pcIp];
    }
    if (selectedPcId === pcIp) selectedPcId = null;

    delete pcs[pcIp];
    renderPCs();
    renderPcSelector();
    updateSidebarStats();
    showToast("PC record deleted", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function getUsageClass(value) {
  if (!value) return "";
  if (value > 90) return "danger";
  if (value > 70) return "warning";
  return "";
}

function formatUptime(seconds) {
  if (!seconds) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  return `${h}h ${m}m`;
}

// =========================
// PREVIEW & REMOTE (existing)
// =========================
function handlePreviewClick(pcId) {
  if (!pcs[pcId]?.online) return;
  if (previewPcs.has(pcId)) {
    startRemoteDesktop(pcId);
  } else {
    startPreview(pcId);
  }
}

function startPreview(pcId) {
  if (!pcs[pcId]?.online || previewPcs.has(pcId)) return;
  previewPcs.add(pcId);
  frameCounts[pcId] = 0;
  fpsData[pcId] = 0;
  socket.emit("start-preview", { pcId, quality: 30, fps: 5 });
  renderPCs();
}

function stopPreview(pcId) {
  if (!previewPcs.has(pcId)) return;
  previewPcs.delete(pcId);
  delete frameCounts[pcId];
  delete fpsData[pcId];
  socket.emit("stop-preview", { pcId });
  renderPCs();
}

socket.on("preview-frame", (data) => {
  const { pcId, image } = data;
  if (!previewPcs.has(pcId)) return;
  const img = document.getElementById(`preview-${pcId}`);
  const placeholder = document.getElementById(`preview-placeholder-${pcId}`);
  if (img && placeholder) {
    img.src = image;
    img.style.display = "block";
    placeholder.style.display = "none";
    frameCounts[pcId] = (frameCounts[pcId] || 0) + 1;
  }
});

setInterval(() => {
  for (const pcId of previewPcs) {
    fpsData[pcId] = frameCounts[pcId] || 0;
    frameCounts[pcId] = 0;
    const fpsEl = document.getElementById(`preview-fps-${pcId}`);
    if (fpsEl) fpsEl.textContent = `${fpsData[pcId]} FPS`;
  }
}, 1000);

function toggleRemoteDesktop(pcId) {
  if (currentRemotePcId === pcId) {
    stopRemoteDesktop();
  } else {
    startRemoteDesktop(pcId);
  }
}

function startRemoteDesktop(pcId) {
  if (previewPcs.has(pcId)) stopPreview(pcId);
  if (currentRemotePcId && currentRemotePcId !== pcId) {
    socket.emit("stop-remote-desktop", { pcId: currentRemotePcId });
  }
  currentRemotePcId = pcId;
  document.getElementById("remote-pc-name").textContent = pcs[pcId]?.pcId || pcId;
  document.getElementById("remote-modal").classList.add("active");
  document.getElementById("screen-view").style.display = "none";
  fullFrameCount = 0;
  fullLastFps = Date.now();
  socket.emit("start-remote-desktop", { pcId });
  setupFullRemoteInput();
  const btn = document.getElementById(`btn-remote-${pcId}`);
  if (btn) btn.classList.add("active");
}

function stopRemoteDesktop() {
  if (currentRemotePcId) {
    socket.emit("stop-remote-desktop", { pcId: currentRemotePcId });
    const btn = document.getElementById(`btn-remote-${currentRemotePcId}`);
    if (btn) btn.classList.remove("active");
  }
  currentRemotePcId = null;
  document.getElementById("remote-modal").classList.remove("active");
  document.getElementById("screen-view").src = "";
  document.getElementById("screen-view").style.display = "none";
  const screenView = document.getElementById("screen-view");
  screenView.onmousemove = null;
  screenView.onclick = null;
  screenView.oncontextmenu = null;
  screenView.onmousedown = null;
  screenView.onmouseup = null;
  screenView.onwheel = null;
  document.onkeydown = null;
}

socket.on("screen-frame", (data) => {
  if (data.pcId !== currentRemotePcId) return;
  const img = document.getElementById("screen-view");
  const placeholder = document.getElementById("screen-placeholder");
  img.src = data.image;
  img.style.display = "block";
  if (placeholder) placeholder.style.display = "none";
  img.dataset.width = data.width;
  img.dataset.height = data.height;
  document.getElementById("screen-res").textContent =
    `${data.width}x${data.height}`;
  fullFrameCount++;
  const now = Date.now();
  if (now - fullLastFps >= 1000) {
    document.getElementById("fps-counter").textContent = fullFrameCount;
    fullFrameCount = 0;
    fullLastFps = now;
  }
});

socket.on("remote-desktop-started", (data) => {
  console.log("Remote desktop started for", data.pcId);
});

socket.on("remote-desktop-error", (data) => {
  showToast("Error: " + data.message, "error");
  stopRemoteDesktop();
});

function setupFullRemoteInput() {
  const screenView = document.getElementById("screen-view");
  screenView.onmousemove = (e) => {
    if (!currentRemotePcId) return;
    const rect = screenView.getBoundingClientRect();
    const scaleX = parseInt(screenView.dataset.width || 1920) / rect.width;
    const scaleY = parseInt(screenView.dataset.height || 1080) / rect.height;
    socket.emit("remote-mouse-move", {
      pcId: currentRemotePcId,
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      screenWidth: parseInt(screenView.dataset.width || 1920),
      screenHeight: parseInt(screenView.dataset.height || 1080),
    });
  };
  screenView.onclick = (e) => {
    if (!currentRemotePcId) return;
    socket.emit("remote-mouse-click", {
      pcId: currentRemotePcId,
      button: e.button === 2 ? "right" : "left",
      double: false,
    });
  };
  screenView.oncontextmenu = (e) => {
    e.preventDefault();
    if (!currentRemotePcId) return;
    socket.emit("remote-mouse-click", {
      pcId: currentRemotePcId,
      button: "right",
      double: false,
    });
  };
  screenView.onmousedown = (e) => {
    if (!currentRemotePcId) return;
    socket.emit("remote-mouse-down", {
      pcId: currentRemotePcId,
      button: e.button === 2 ? "right" : "left",
    });
  };
  screenView.onmouseup = (e) => {
    if (!currentRemotePcId) return;
    socket.emit("remote-mouse-up", {
      pcId: currentRemotePcId,
      button: e.button === 2 ? "right" : "left",
    });
  };
  screenView.onwheel = (e) => {
    e.preventDefault();
    if (!currentRemotePcId) return;
    socket.emit("remote-scroll", {
      pcId: currentRemotePcId,
      deltaX: e.deltaX,
      deltaY: e.deltaY,
    });
  };
  document.onkeydown = (e) => {
    if (!currentRemotePcId) return;
    e.preventDefault();
    socket.emit("remote-key", {
      pcId: currentRemotePcId,
      key: e.key,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
    });
  };
}

// =========================
// COMMANDS
// =========================
function sendCommand(command, pcId) {
  const targetId = pcId || currentRemotePcId;
  if (!targetId) return;
  const confirmMsg = {
    shutdown: "Are you sure you want to SHUTDOWN this PC?",
    restart: "Are you sure you want to RESTART this PC?",
    lock: "Lock this PC?",
  };
  if (command !== "lock" && !confirm(confirmMsg[command])) return;
  const eventMap = {
    shutdown: "admin-shutdown-pc",
    restart: "admin-restart-pc",
    lock: "admin-lock-pc",
  };
  socket.emit(eventMap[command], { pcId: targetId });
}

socket.on("command-success", (data) => {
  showToast(`Command sent to ${data.pcId}`, "success");
});

socket.on("command-error", (data) => {
  showToast("Command failed: " + data.message, "error");
});

// =========================
// UI CONTROLS
// =========================
function switchTab(element, tabName) {
  document
    .querySelectorAll(".nav-item")
    .forEach((el) => el.classList.remove("active"));
  element.classList.add("active");
  document
    .querySelectorAll(".tab-content")
    .forEach((el) => (el.style.display = "none"));
  document.getElementById(`tab-${tabName}`).style.display = "block";

  if (tabName === "templates") renderTemplates();
  if (tabName === "send") {
    renderSendTemplates();
    renderPcSelector();
  }
}

function toggleAutoPreview() {
  autoPreviewEnabled = !autoPreviewEnabled;
  document.getElementById("auto-preview-toggle").classList.toggle("active");
  if (autoPreviewEnabled) {
    for (const [pcId, pc] of Object.entries(pcs)) {
      if (pc.online && !previewPcs.has(pcId)) startPreview(pcId);
    }
  } else {
    for (const pcId of [...previewPcs]) stopPreview(pcId);
  }
}

function setView(mode, btnEl) {
  viewMode = mode;
  document
    .querySelectorAll(".view-btn")
    .forEach((btn) => btn.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
  const container = document.getElementById("pcs-container");
  if (mode === "compact") container.classList.add("compact");
  else container.classList.remove("compact");
}

function logout() {
  if (confirm("Are you sure you want to logout?")) {
    localStorage.removeItem("adminToken");
    window.location.href = "/login.html";
    showToast("Logged out successfully", "success");
    setTimeout(() => location.reload(), 1000);
  }
}

// =========================
// TOAST
// =========================
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<div class="toast-icon"><img class="nav-icon" src="assets/icons/message.svg" alt=""></div><div>${message}</div>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 350);
  }, 3000);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && currentRemotePcId) stopRemoteDesktop();
});

setInterval(() => {
  const uptime = Math.floor((Date.now() - serverStartTime) / 1000);
  document.getElementById("statsUptime").textContent = formatUptime(uptime);
}, 60000);
