const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, "public")));

const io = new Server(server, {
  cors: { origin: "*" },
});

const pcs = {};
const TEMPLATES_FILE = path.join(__dirname, "templates.json");

// =========================
// TEMPLATE FILE OPERATIONS
// =========================

function loadTemplates() {
  try {
    if (fs.existsSync(TEMPLATES_FILE)) {
      const data = fs.readFileSync(TEMPLATES_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error loading templates:", err);
  }
  return [];
}

function saveTemplates(templates) {
  try {
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
    return true;
  } catch (err) {
    console.error("Error saving templates:", err);
    return false;
  }
}

// Load templates on startup
let messageTemplates = loadTemplates();

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("register-client", (data) => { 
    if (data.type === "admin") {
      socket.emit("templates-update", messageTemplates);
      socket.emit("pcs-update", pcs);
    } else if (data.type === "pc") {
      console.log(`PC registered: ${data.pcId}`);
      pcs[data.pcId] = {
        ...pcs[data.pcId],
        pcId: data.pcId,
        socketId: socket.id,
        online: true,
        lastSeen: Date.now(),
      };
      io.emit("pcs-update", pcs);
    }
  });

  // =========================
  // TEMPLATE CRUD OPERATIONS
  // =========================

  // GET - Send current templates to admin
  socket.on("get-templates", () => {
    socket.emit("templates-update", messageTemplates);
  });

  // CREATE / UPDATE
  socket.on("save-template", (data) => {
    const { id, title, message, type } = data;

    if (!title || !message) {
      socket.emit("template-error", {
        message: "Title and message are required",
      });
      return;
    }

    // Validate max 3 templates for new ones
    const existingIndex = messageTemplates.findIndex((t) => t.id === id);

    if (existingIndex === -1 && messageTemplates.length >= 3) {
      socket.emit("template-error", {
        message: "Maximum 3 templates allowed. Delete one first.",
      });
      return;
    }

    const templateData = {
      id: id || Date.now(), // Use timestamp as ID if new
      title: title.trim(),
      message: message.trim(),
      type: type || "info",
    };

    if (existingIndex >= 0) {
      // Update existing
      messageTemplates[existingIndex] = templateData;
      console.log(`✏️ Template updated: ${templateData.title}`);
    } else {
      // Create new
      messageTemplates.push(templateData);
      console.log(`➕ Template created: ${templateData.title}`);
    }

    // Save to file
    if (saveTemplates(messageTemplates)) {
      // Broadcast to all connected admins
      io.emit("templates-update", messageTemplates);
      socket.emit("template-success", {
        message: existingIndex >= 0 ? "Template updated" : "Template created",
        template: templateData,
      });
    } else {
      socket.emit("template-error", {
        message: "Failed to save template to file",
      });
    }
  });

  // DELETE
  socket.on("delete-template", (data) => {
    const { id } = data;
    const templateToDelete = messageTemplates.find((t) => t.id === id);

    if (!templateToDelete) {
      socket.emit("template-error", { message: "Template not found" });
      return;
    }

    messageTemplates = messageTemplates.filter((t) => t.id !== id);

    // Reassign IDs to keep sequential (optional - remove if you want to keep IDs)
    // messageTemplates = messageTemplates.map((t, i) => ({ ...t, id: i + 1 }));

    if (saveTemplates(messageTemplates)) {
      io.emit("templates-update", messageTemplates);
      socket.emit("template-success", { message: "Template deleted" });
      console.log(`🗑️ Template deleted: ${templateToDelete.title}`);
    } else {
      socket.emit("template-error", { message: "Failed to save after delete" });
    }
  });

  // =========================
  // SEND TEMPLATE MESSAGE
  // =========================

  socket.on("send-template-message", (data) => {
    const { templateId, pcId, sendToAll } = data;
    const template = messageTemplates.find((t) => t.id === templateId);

    if (!template) {
      socket.emit("template-error", { message: "Template not found" });
      return;
    }

    const targets = [];

    if (sendToAll) {
      for (const [pid, pcData] of Object.entries(pcs)) {
        if (pcData.online && pcData.socketId) {
          targets.push(pcData.socketId);
        }
      }
    } else if (pcId) {
      const pcData = pcs[pcId];
      if (pcData && pcData.online && pcData.socketId) {
        targets.push(pcData.socketId);
      }
    }

    if (targets.length === 0) {
      socket.emit("template-error", { message: "No target PCs available" });
      return;
    }

    for (const targetSocketId of targets) {
      io.to(targetSocketId).emit("show-popup", {
        title: template.title,
        message: template.message,
        type: template.type,
        timestamp: Date.now(),
      });
    }

    socket.emit("template-success", {
      message: `Sent "${template.title}" to ${targets.length} PC(s)`,
    });

    console.log(
      `📨 Template "${template.title}" sent to ${targets.length} PC(s)`,
    );
  });

  // =========================
  // SEND CUSTOM MESSAGE
  // =========================

  socket.on("send-custom-message", (data) => {
    const { title, message, type, pcId, sendToAll } = data;

    if (!title || !message) {
      socket.emit("template-error", { message: "Title and message required" });
      return;
    }

    const targets = [];

    if (sendToAll) {
      for (const [pid, pcData] of Object.entries(pcs)) {
        if (pcData.online && pcData.socketId) {
          targets.push(pcData.socketId);
        }
      }
    } else if (pcId) {
      const pcData = pcs[pcId];
      if (pcData && pcData.online && pcData.socketId) {
        targets.push(pcData.socketId);
      }
    }

    if (targets.length === 0) {
      socket.emit("template-error", { message: "No target PCs available" });
      return;
    }

    for (const targetSocketId of targets) {
      io.to(targetSocketId).emit("show-popup", {
        title: title.trim(),
        message: message.trim(),
        type: type || "info",
        timestamp: Date.now(),
      });
    }

    socket.emit("template-success", {
      message: `Custom message sent to ${targets.length} PC(s)`,
    });
  });

  // =========================
  // EXISTING PC MONITORING
  // =========================

  socket.on("pc-status", (data) => {
    const { pcId } = data;
    if (pcs[pcId]) {
      pcs[pcId] = {
        ...pcs[pcId],
        ...data,
        socketId: socket.id,
        lastSeen: Date.now(),
        online: true,
      };
    } else {
      pcs[pcId] = {
        ...data,
        socketId: socket.id,
        lastSeen: Date.now(),
        online: true,
      };
    }
    io.emit("pcs-update", pcs);
  });

  socket.on("client-connected", (data) => {
    const { pcId } = data;
    if (pcs[pcId]) {
      pcs[pcId].socketId = socket.id;
      pcs[pcId].online = true;
      pcs[pcId].lastSeen = Date.now();
    } else {
      pcs[pcId] = {
        pcId,
        socketId: socket.id,
        online: true,
        lastSeen: Date.now(),
        ...data,
      };
    }
    io.emit("pcs-update", pcs);
  });

  // Remote Desktop Events
  socket.on("start-remote-desktop", (data) => {
    const { pcId } = data;
    const pcData = pcs[pcId];
    if (!pcData || !pcData.online) {
      socket.emit("remote-desktop-error", {
        message: "PC not found or offline",
        pcId,
      });
      return;
    }
    pcs[pcId].adminSocketId = socket.id;
    pcs[pcId].remoteDesktopActive = true;
    io.to(pcData.socketId).emit("start-remote-desktop");
    socket.emit("remote-desktop-started", { pcId });
  });

  socket.on("stop-remote-desktop", (data) => {
    const { pcId } = data;
    const pcData = pcs[pcId];
    if (pcData && pcData.socketId) {
      io.to(pcData.socketId).emit("stop-remote-desktop");
    }
    if (pcs[pcId]) {
      pcs[pcId].remoteDesktopActive = false;
      pcs[pcId].adminSocketId = null;
    }
  });

  socket.on("screen-frame", (data) => {
    const { pcId } = data;
    const adminSocketId = pcs[pcId]?.adminSocketId;
    if (adminSocketId && pcs[pcId]?.remoteDesktopActive) {
      io.to(adminSocketId).emit("screen-frame", data);
    }
  });

  // Preview Events
  socket.on("start-preview", (data) => {
    const { pcId } = data;
    const pcData = pcs[pcId];
    if (!pcData || !pcData.online) return;

    if (!pcs[pcId].previewAdmins) pcs[pcId].previewAdmins = new Set();
    pcs[pcId].previewAdmins.add(socket.id);
    io.to(pcData.socketId).emit("start-preview", {
      quality: data.quality || 30,
      fps: data.fps || 5,
    });
  });

  socket.on("stop-preview", (data) => {
    const { pcId } = data;
    const pcData = pcs[pcId];
    if (pcData && pcData.previewAdmins) {
      pcData.previewAdmins.delete(socket.id);
      if (pcData.previewAdmins.size === 0 && !pcData.remoteDesktopActive) {
        io.to(pcData.socketId).emit("stop-preview");
      }
    }
  });

  socket.on("preview-frame", (data) => {
    const { pcId } = data;
    const pcData = pcs[pcId];
    if (!pcData || !pcData.previewAdmins) return;
    for (const adminSocketId of pcData.previewAdmins) {
      io.to(adminSocketId).emit("preview-frame", data);
    }
  });

  // Input Relay
  const inputEvents = [
    "remote-mouse-move",
    "remote-mouse-click",
    "remote-mouse-down",
    "remote-mouse-up",
    "remote-scroll",
    "remote-key",
    "remote-type",
  ];
  inputEvents.forEach((eventName) => {
    socket.on(eventName, (data) => {
      const { pcId } = data;
      const pcData = pcs[pcId];
      if (!pcData || !pcData.online || !pcData.remoteDesktopActive) return;
      const { pcId: _, ...payload } = data;
      io.to(pcData.socketId).emit(eventName, payload);
    });
  });

  // Admin Commands
  const adminCommands = [
    { event: "admin-shutdown-pc", target: "shutdown-pc" },
    { event: "admin-restart-pc", target: "restart-pc" },
    { event: "admin-lock-pc", target: "lock-pc" },
  ];
  adminCommands.forEach(({ event, target }) => {
    socket.on(event, (data) => {
      const { pcId } = data;
      const pcData = pcs[pcId];
      if (!pcData || !pcData.online) {
        socket.emit("command-error", {
          message: "PC not found or offline",
          pcId,
        });
        return;
      }
      io.to(pcData.socketId).emit(target);
      socket.emit("command-success", { command: target, pcId });
    });
  });

  // Disconnect
  socket.on("disconnect", () => {
    for (const [pcId, pcData] of Object.entries(pcs)) {
      if (pcData.socketId === socket.id) {
        pcs[pcId].online = false;
        pcs[pcId].remoteDesktopActive = false;
        pcs[pcId].adminSocketId = null;
        pcs[pcId].lastSeen = Date.now();
        io.emit("pcs-update", pcs);
        break;
      }
      if (pcData.adminSocketId === socket.id) {
        if (pcData.socketId) io.to(pcData.socketId).emit("stop-remote-desktop");
        pcs[pcId].remoteDesktopActive = false;
        pcs[pcId].adminSocketId = null;
      }
      if (pcData.previewAdmins) {
        pcData.previewAdmins.delete(socket.id);
        if (pcData.previewAdmins.size === 0 && !pcData.remoteDesktopActive) {
          io.to(pcData.socketId).emit("stop-preview");
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`✅ Admin server running on port ${PORT}`);
  console.log(`📁 Dashboard: http://localhost:${PORT}`);
  console.log(`📝 Templates loaded: ${messageTemplates.length}`);
});
