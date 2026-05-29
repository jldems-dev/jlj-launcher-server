const { socketHandler } = require("../utils/asyncHandler");

function getTargetSocketIds(pcs, { pcId, sendToAll }) {
  const targets = [];

  if (sendToAll) {
    for (const pcData of Object.values(pcs)) {
      if (pcData.online && pcData.socketId) targets.push(pcData.socketId);
    }
  } else if (pcId) {
    const pcData = pcs[pcId];
    if (pcData && pcData.online && pcData.socketId) targets.push(pcData.socketId);
  }

  return targets;
}

function registerMessageHandlers(io, socket, state) {
  socketHandler(socket, "send-template-message", async (data = {}) => {
    const template = await state.templateService.getTemplateById(data.templateId);
    if (!template) throw new Error("Template not found");

    const targets = getTargetSocketIds(state.pcs, data);
    if (targets.length === 0) throw new Error("No target PCs available");

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
    console.log(`Template "${template.title}" sent to ${targets.length} PC(s)`);
  });

  socketHandler(socket, "send-custom-message", async (data = {}) => {
    const title = String(data.title || "").trim();
    const message = String(data.message || "").trim();

    if (!title || !message) throw new Error("Title and message required");

    const targets = getTargetSocketIds(state.pcs, data);
    if (targets.length === 0) throw new Error("No target PCs available");

    for (const targetSocketId of targets) {
      io.to(targetSocketId).emit("show-popup", {
        title,
        message,
        type: data.type || "info",
        timestamp: Date.now(),
      });
    }

    socket.emit("template-success", {
      message: `Custom message sent to ${targets.length} PC(s)`,
    });
  });
}

module.exports = { registerMessageHandlers };
