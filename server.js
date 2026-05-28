require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, "public")));

// =========================
// SECURITY CONFIG
// =========================

const SOCKET_SECRET = process.env.SOCKET_SECRET;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const PORT = process.env.PORT;

if (!SOCKET_SECRET || !ADMIN_SECRET) {
  console.error("❌ Missing SOCKET_SECRET or ADMIN_SECRET in .env");
  process.exit(1);
}

// LOCK CORS (CHANGE THIS)
const io = new Server(server, {
  cors: {
    origin: "*", // replace with your domain in production
    methods: ["GET", "POST"],
  },
});

// =========================
// SECURITY LAYER (AUTH)
// =========================

io.use((socket, next) => { 
  console.log("HANDSHAKE HEADERS:", socket.handshake.headers);
  console.log("HANDSHAKE AUTH:", socket.handshake.auth);
  const token = socket.handshake.auth?.token;

  if (!token) return next(new Error("No token provided"));

  if (token === SOCKET_SECRET) {
    socket.role = "pc";
    return next();
  }

  if (token === ADMIN_SECRET) {
    socket.role = "admin";
    return next();
  }

  return next(new Error("Unauthorized"));
});

// =========================
// RATE LIMITING
// =========================

const rateLimit = new Map();

function checkRate(socket) {
  const now = Date.now();
  const last = rateLimit.get(socket.id) || 0;

  if (now - last < 300) return false;

  rateLimit.set(socket.id, now);
  return true;
}

// =========================
// DATA STORAGE
// =========================

const pcs = {};
const TEMPLATES_FILE = path.join(__dirname, "templates.json");

function loadTemplates() {
  try {
    if (fs.existsSync(TEMPLATES_FILE)) {
      return JSON.parse(fs.readFileSync(TEMPLATES_FILE, "utf8"));
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

let messageTemplates = loadTemplates();

// =========================
// SOCKET CONNECTION
// =========================

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id} [${socket.role}]`);

  // =========================
  // REGISTER
  // =========================

  socket.on("register-client", (data) => {
    if (!checkRate(socket)) return;

    if (socket.role === "admin") {
      socket.emit("templates-update", messageTemplates);
      socket.emit("pcs-update", pcs);
      return;
    }

    if (socket.role === "pc") {
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
  // TEMPLATE CRUD (ADMIN ONLY)
  // =========================

  socket.on("save-template", (data) => {
    if (socket.role !== "admin") return;

    const { id, title, message, type } = data;

    if (!title || !message) {
      return socket.emit("template-error", {
        message: "Title and message are required",
      });
    }

    const index = messageTemplates.findIndex((t) => t.id === id);

    if (index === -1 && messageTemplates.length >= 3) {
      return socket.emit("template-error", {
        message: "Maximum 3 templates allowed",
      });
    }

    const template = {
      id: id || Date.now(),
      title: title.trim(),
      message: message.trim(),
      type: type || "info",
    };

    if (index >= 0) {
      messageTemplates[index] = template;
    } else {
      messageTemplates.push(template);
    }

    saveTemplates(messageTemplates);

    io.emit("templates-update", messageTemplates);
  });

  socket.on("delete-template", (data) => {
    if (socket.role !== "admin") return;

    messageTemplates = messageTemplates.filter((t) => t.id !== data.id);
    saveTemplates(messageTemplates);

    io.emit("templates-update", messageTemplates);
  });

  // =========================
  // SEND MESSAGE (ADMIN ONLY)
  // =========================

  socket.on("send-template-message", (data) => {
    if (socket.role !== "admin") return;

    const template = messageTemplates.find((t) => t.id === data.templateId);

    if (!template) return;

    const targets = [];

    if (data.sendToAll) {
      for (const pc of Object.values(pcs)) {
        if (pc.online) targets.push(pc.socketId);
      }
    } else if (data.pcId && pcs[data.pcId]) {
      targets.push(pcs[data.pcId].socketId);
    }

    for (const id of targets) {
      io.to(id).emit("show-popup", {
        title: template.title,
        message: template.message,
        type: template.type,
      });
    }
  });

  // =========================
  // CUSTOM MESSAGE (ADMIN ONLY)
  // =========================

  socket.on("send-custom-message", (data) => {
    if (socket.role !== "admin") return;

    const targets = [];

    if (data.sendToAll) {
      for (const pc of Object.values(pcs)) {
        if (pc.online) targets.push(pc.socketId);
      }
    } else if (pcs[data.pcId]) {
      targets.push(pcs[data.pcId].socketId);
    }

    for (const id of targets) {
      io.to(id).emit("show-popup", data);
    }
  });

  // =========================
  // PC STATUS
  // =========================

  socket.on("pc-status", (data) => {
    if (!checkRate(socket)) return;

    const { pcId } = data;

    pcs[pcId] = {
      ...pcs[pcId],
      ...data,
      socketId: socket.id,
      online: true,
      lastSeen: Date.now(),
    };

    io.emit("pcs-update", pcs);
  });

  // =========================
  // ADMIN COMMANDS (ADMIN ONLY)
  // =========================

  const adminEvents = {
    "admin-shutdown-pc": "shutdown-pc",
    "admin-restart-pc": "restart-pc",
    "admin-lock-pc": "lock-pc",
  };

  Object.entries(adminEvents).forEach(([event, target]) => {
    socket.on(event, (data) => {
      if (socket.role !== "admin") return;

      const pc = pcs[data.pcId];
      if (!pc || !pc.online) return;

      io.to(pc.socketId).emit(target);
    });
  });

  // =========================
  // DISCONNECT
  // =========================

  socket.on("disconnect", () => {
    for (const [pcId, pc] of Object.entries(pcs)) {
      if (pc.socketId === socket.id) {
        pcs[pcId].online = false;
        pcs[pcId].lastSeen = Date.now();
        io.emit("pcs-update", pcs);
      }
    }
  });
});

// =========================
// START SERVER
// ========================= 

server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Secure server running on port ${PORT}`);
});
