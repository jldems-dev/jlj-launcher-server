
    // =========================
    // STATE
    // =========================
    const socket = io();
    let pcs = {};
    let templates = [];
    let currentRemotePcId = null;
    let previewPcs = new Set();
    let autoPreviewEnabled = true;
    let viewMode = 'grid';
    let serverStartTime = Date.now();
    let fpsData = {};
    let frameCounts = {};
    let fullFrameCount = 0;
    let fullLastFps = Date.now();
    
    // Template state
    let editingTemplateId = null;
    let editMessageType = 'info';
    let customMessageType = 'info';
    let messageTarget = 'all';
    let selectedPcId = null;

    // =========================
    // SOCKET CONNECTION
    // =========================
    socket.on("connect", () => {
        console.log("✅ Connected to server");
        updateConnectionStatus(true);
        socket.emit("register-client", { type: "admin" });
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
            const template = templates.find(t => t.id === id);
            if (!template) return;
            title.textContent = "Edit Template";
            document.getElementById("templateTitleInput").value = template.title;
            document.getElementById("templateMessageInput").value = template.message;
            document.getElementById("templateCharCount").textContent = template.message.length;
            selectEditType(template.type, document.querySelector(`#editTemplatePanel button[onclick="selectEditType('${template.type}', this)"]`));
        } else {
            title.textContent = "Add Template";
            document.getElementById("templateTitleInput").value = "";
            document.getElementById("templateMessageInput").value = "";
            document.getElementById("templateCharCount").textContent = "0";
            selectEditType('info', document.querySelector('#editTemplatePanel button[onclick="selectEditType(\'info\', this)"]'));
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
        const buttons = document.querySelectorAll('#editTemplatePanel .type-btn');
        buttons.forEach(b => {
            b.classList.remove('active');
            b.style.borderColor = 'var(--border)';
            b.style.background = 'var(--bg-primary)';
            b.style.color = 'var(--text-secondary)';
        });
        btn.classList.add('active');
        btn.style.borderColor = 'white';
        btn.style.background = 'var(--bg-hover)';
        btn.style.color = 'var(--text-primary)';
    }

    function selectCustomType(type, btn) {
        customMessageType = type;
        const buttons = document.querySelectorAll('#tab-send .type-btn');
        buttons.forEach(b => {
            b.classList.remove('active');
            b.style.borderColor = 'var(--border)';
            b.style.background = 'var(--bg-primary)';
            b.style.color = 'var(--text-secondary)';
        });
        btn.classList.add('active');
        btn.style.borderColor = 'white';
        btn.style.background = 'var(--bg-hover)';
        btn.style.color = 'var(--text-primary)';
    }

    // Character counter
    document.addEventListener('DOMContentLoaded', () => {
        const textarea = document.getElementById("templateMessageInput");
        if (textarea) {
            textarea.addEventListener('input', function() {
                document.getElementById("templateCharCount").textContent = this.value.length;
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
            type: editMessageType
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
                <div style="text-align: center; padding: 60px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border);">
                    <div style="font-size: 32px; margin-bottom: 8px;">📝</div>
                    <p>No templates yet. Click "Add Template" to create one.</p>
                </div>
            `;
            btn.style.display = "flex";
            return;
        }

        container.innerHTML = templates.map(t => `
            <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; gap: 12px; align-items: flex-start; transition: var(--transition);" onmouseover="this.style.borderColor='var(--border-hover)'" onmouseout="this.style.borderColor='var(--border)'">
                <div style="width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; ${t.type === 'info' ? 'background: rgba(33,150,243,0.15);' : t.type === 'warning' ? 'background: rgba(255,152,0,0.15);' : 'background: rgba(244,67,54,0.15);'}">
                    ${t.type === 'warning' ? '⚠️' : t.type === 'error' ? '🚫' : 'ℹ️'}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">${escapeHtml(t.title)}</div>
                    <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">${escapeHtml(t.message)}</div>
                </div>
                <div style="display: flex; gap: 6px; flex-shrink: 0;">
                    <button onclick="openEditTemplate(${t.id})" title="Edit" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-hover); color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: var(--transition); font-size: 14px;" onmouseover="this.style.background='var(--bg-elevated)'" onmouseout="this.style.background='var(--bg-hover)'">✏️</button>
                    <button onclick="deleteTemplate(${t.id})" title="Delete" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-hover); color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: var(--transition); font-size: 14px;" onmouseover="this.style.background='rgba(255,50,50,0.2)';this.style.color='#ff6b6b'" onmouseout="this.style.background='var(--bg-hover)';this.style.color='var(--text-secondary)'">🗑️</button>
                </div>
            </div>
        `).join('');

        btn.style.display = templates.length >= 3 ? "none" : "flex";
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // =========================
    // SEND MESSAGE FUNCTIONS
    // =========================
    function renderSendTemplates() {
        const container = document.getElementById("sendTemplatesList");
        const noMsg = document.getElementById("noTemplatesMsg");
        
        if (templates.length === 0) {
            container.innerHTML = '';
            noMsg.style.display = 'block';
            return;
        }

        noMsg.style.display = 'none';
        container.innerHTML = templates.map(t => `
            <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; cursor: pointer; transition: var(--transition);" onmouseover="this.style.borderColor='var(--border-hover)'" onmouseout="this.style.borderColor='var(--border)'" onclick="sendTemplateMessage(${t.id})">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                    <span style="font-size: 16px;">${t.type === 'warning' ? '⚠️' : t.type === 'error' ? '🚫' : 'ℹ️'}</span>
                    <span style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${escapeHtml(t.title)}</span>
                    <span style="margin-left: auto; font-size: 10px; text-transform: uppercase; padding: 2px 8px; border-radius: 10px; ${t.type === 'info' ? 'background: rgba(33,150,243,0.15); color: #2196f3;' : t.type === 'warning' ? 'background: rgba(255,152,0,0.15); color: #ff9800;' : 'background: rgba(244,67,54,0.15); color: #f44336;'}">${t.type}</span>
                </div>
                <div style="font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 26px;">${escapeHtml(t.message)}</div>
            </div>
        `).join('');
    }

    function sendTemplateMessage(templateId) {
        const template = templates.find(t => t.id === templateId);
        if (!template) return;

        if (messageTarget === 'select' && !selectedPcId) {
            showToast("Please select a PC first", "error");
            switchTab(document.querySelector('[onclick*="send"]'), 'send');
            return;
        }

        socket.emit("send-template-message", {
            templateId,
            pcId: messageTarget === 'select' ? selectedPcId : null,
            sendToAll: messageTarget === 'all'
        });

        showToast(`"${template.title}" sent!`, "success");
    }

    function setTarget(target) {
        messageTarget = target;
        document.getElementById("targetAllBtn").classList.toggle("active", target === 'all');
        document.getElementById("targetSelectBtn").classList.toggle("active", target === 'select');
        document.getElementById("pcSelector").style.display = target === 'select' ? 'block' : 'none';
        if (target === 'all') selectedPcId = null;
    }

    function renderPcSelector() {
        const container = document.getElementById("pcSelector");
        const onlinePcs = Object.entries(pcs).filter(([_, pc]) => pc.online);
        
        if (onlinePcs.length === 0) {
            container.innerHTML = `<p style="color: var(--text-muted); font-size: 12px; padding: 8px;">No PCs online</p>`;
            return;
        }

        container.innerHTML = onlinePcs.map(([pcId, pc]) => `
            <div style="padding: 8px 12px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 13px; transition: var(--transition); ${selectedPcId === pcId ? 'background: rgba(255,255,255,0.1);' : ''}" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background='${selectedPcId === pcId ? 'rgba(255,255,255,0.1)' : 'transparent'}'" onclick="selectPc('${pcId}')">
                <div style="width: 8px; height: 8px; border-radius: 50%; background: ${selectedPcId === pcId ? '#4caf50' : 'var(--text-muted)'};"></div>
                <span>${pcId}</span>
                ${pc.currentGame ? `<span style="margin-left: auto; font-size: 11px; color: var(--text-muted);">🎮 ${pc.currentGame}</span>` : ''}
            </div>
        `).join('');
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

        if (messageTarget === 'select' && !selectedPcId) {
            showToast("Please select a PC", "error");
            return;
        }

        socket.emit("send-custom-message", {
            title,
            message,
            type: customMessageType,
            pcId: messageTarget === 'select' ? selectedPcId : null,
            sendToAll: messageTarget === 'all'
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
        const online = pcList.filter(p => p.online).length;
        
        document.getElementById("pcCountBadge").textContent = pcList.length;
        document.getElementById("statsOnline").textContent = `${online} Online`;
        document.getElementById("statsPreviewing").textContent = `${previewPcs.size} Previewing`;
        
        const uptime = Math.floor((Date.now() - serverStartTime) / 1000);
        document.getElementById("statsUptime").textContent = formatUptime(uptime);
    }

    function renderPCs() {
        const container = document.getElementById("pcs-container");
        const pcEntries = Object.entries(pcs);

        if (pcEntries.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <p>No PCs connected yet</p>
                </div>
            `;
            return;
        }

        container.innerHTML = pcEntries.map(([pcId, pc]) => {
            const isOnline = pc.online;
            const isPreviewing = previewPcs.has(pcId);
            const isFullRemote = currentRemotePcId === pcId;
            const fps = fpsData[pcId] || 0;

            return `
                <div class="pc-card ${isOnline ? '' : 'offline'}" id="card-${pcId}">
                    <div class="preview-container" onclick="handlePreviewClick('${pcId}')">
                        ${isOnline ? `
                            <img id="preview-${pcId}" class="preview-image" style="${isPreviewing ? '' : 'display:none;'}" alt="Preview"/>
                            <div id="preview-placeholder-${pcId}" class="preview-placeholder" style="${isPreviewing ? 'display:none;' : ''}">
                                <span class="preview-placeholder-icon">🖥️</span>
                                <span>${isPreviewing ? 'Loading...' : 'Click to preview'}</span>
                            </div>
                        ` : `
                            <div class="preview-placeholder">
                                <span class="preview-placeholder-icon">😴</span>
                                <span>Offline</span>
                            </div>
                        `}
                        <div class="preview-status ${isOnline ? 'online' : 'offline'}">
                            <span class="status-dot"></span>
                            ${isOnline ? 'Online' : 'Offline'}
                        </div>
                        ${isPreviewing ? `<div class="preview-fps" id="preview-fps-${pcId}">${fps} FPS</div>` : ''}
                        ${isOnline ? `
                            <div class="preview-overlay">
                                <button class="preview-btn btn-remote-big" onclick="event.stopPropagation(); startRemoteDesktop('${pcId}')">🖱️ Full Control</button>
                            </div>
                        ` : ''}
                    </div>
                    <div class="pc-info">
                        <div class="pc-header">
                            <span class="pc-name">${pcId}</span>
                            ${pc.currentGame ? `<span class="pc-game">🎮 ${pc.currentGame}</span>` : ''}
                        </div>
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
                                <div class="stat-value" style="font-size:14px;">${formatUptime(pc.uptime)}</div>
                            </div>
                        </div>
                        <div class="pc-actions">
                            ${isOnline ? `
                                <button class="btn btn-remote ${isFullRemote ? 'active' : ''}" onclick="event.stopPropagation(); toggleRemoteDesktop('${pcId}')" id="btn-remote-${pcId}">${isFullRemote ? '📡 Controlling' : '🖥️ Remote'}</button>
                                <button class="btn btn-lock" onclick="event.stopPropagation(); sendCommand('lock', '${pcId}')">🔒</button>
                                <button class="btn btn-danger" onclick="event.stopPropagation(); sendCommand('restart', '${pcId}')">🔄</button>
                                <button class="btn btn-danger" onclick="event.stopPropagation(); sendCommand('shutdown', '${pcId}')">🔴</button>
                            ` : `
                                <span style="color:var(--text-muted); font-size:12px; flex:1; text-align:center;">Last seen: ${pc.lastSeen ? new Date(pc.lastSeen).toLocaleTimeString() : 'Never'}</span>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function getUsageClass(value) {
        if (!value) return '';
        if (value > 90) return 'danger';
        if (value > 70) return 'warning';
        return '';
    }

    function formatUptime(seconds) {
        if (!seconds) return '-';
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
            img.style.display = 'block';
            placeholder.style.display = 'none';
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
        document.getElementById("remote-pc-name").textContent = pcId;
        document.getElementById("remote-modal").classList.add("active");
        document.getElementById("screen-view").style.display = "none";
        fullFrameCount = 0;
        fullLastFps = Date.now();
        socket.emit("start-remote-desktop", { pcId });
        setupFullRemoteInput();
        const btn = document.getElementById(`btn-remote-${pcId}`);
        if (btn) btn.classList.add('active');
    }

    function stopRemoteDesktop() {
        if (currentRemotePcId) {
            socket.emit("stop-remote-desktop", { pcId: currentRemotePcId });
            const btn = document.getElementById(`btn-remote-${currentRemotePcId}`);
            if (btn) btn.classList.remove('active');
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
        document.getElementById("screen-res").textContent = `${data.width}x${data.height}`;
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
            socket.emit("remote-mouse-click", { pcId: currentRemotePcId, button: e.button === 2 ? "right" : "left", double: false });
        };
        screenView.oncontextmenu = (e) => {
            e.preventDefault();
            if (!currentRemotePcId) return;
            socket.emit("remote-mouse-click", { pcId: currentRemotePcId, button: "right", double: false });
        };
        screenView.onmousedown = (e) => {
            if (!currentRemotePcId) return;
            socket.emit("remote-mouse-down", { pcId: currentRemotePcId, button: e.button === 2 ? "right" : "left" });
        };
        screenView.onmouseup = (e) => {
            if (!currentRemotePcId) return;
            socket.emit("remote-mouse-up", { pcId: currentRemotePcId, button: e.button === 2 ? "right" : "left" });
        };
        screenView.onwheel = (e) => {
            e.preventDefault();
            if (!currentRemotePcId) return;
            socket.emit("remote-scroll", { pcId: currentRemotePcId, deltaX: e.deltaX, deltaY: e.deltaY });
        };
        document.onkeydown = (e) => {
            if (!currentRemotePcId) return;
            e.preventDefault();
            socket.emit("remote-key", { pcId: currentRemotePcId, key: e.key, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey });
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
            lock: "Lock this PC?"
        };
        if (command !== "lock" && !confirm(confirmMsg[command])) return;
        const eventMap = { shutdown: "admin-shutdown-pc", restart: "admin-restart-pc", lock: "admin-lock-pc" };
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
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
        document.getElementById(`tab-${tabName}`).style.display = 'block';
        
        if (tabName === 'templates') renderTemplates();
        if (tabName === 'send') {
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

    function setView(mode) {
        viewMode = mode;
        document.querySelectorAll(".view-btn").forEach(btn => btn.classList.remove("active"));
        event.target.classList.add("active");
        const container = document.getElementById("pcs-container");
        if (mode === "compact") container.classList.add("compact");
        else container.classList.remove("compact");
    }

    function logout() {
        if (confirm("Are you sure you want to logout?")) {
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
        const icon = type === "success" ? "✓" : type === "error" ? "✕" : "ℹ";
        toast.innerHTML = `<div class="toast-icon">${icon}</div><div>${message}</div>`;
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