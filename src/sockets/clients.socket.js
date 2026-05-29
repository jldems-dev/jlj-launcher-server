const { socketHandler } = require("../utils/asyncHandler");
const { normalizeSocketIp } = require("../utils/ip");

function registerClientHandlers(io, socket, state) {
  socketHandler(socket, "register-client", async (data = {}) => {
    if (data.type === "admin") {
      const templates = await state.templateService.listTemplates();
      socket.emit("templates-update", templates);
      socket.emit("pcs-update", state.pcs);
      return;
    }

    if (data.type === "pc") {
      const pcIp = resolvePcIp(socket, data);
      console.log(`PC registered: ${data.pcId || pcIp} (${pcIp || "no ip"})`);
      await state.pcService.upsert(pcIp, { ...data, pcIp }, socket.id);
      io.emit("pcs-update", state.pcs);
    }
  });

  socketHandler(socket, "pc-status", async (data = {}) => {
    const pcIp = resolvePcIp(socket, data);
    await state.pcService.upsert(pcIp, { ...data, pcIp }, socket.id);
    io.emit("pcs-update", state.pcs);
  });

  socketHandler(socket, "client-connected", async (data = {}) => {
    const pcIp = resolvePcIp(socket, data);
    await state.pcService.upsert(pcIp, { ...data, pcIp }, socket.id);
    io.emit("pcs-update", state.pcs);
  });
}

function resolvePcIp(socket, data = {}) {
  return (
    data.pcIp ||
    data.ip ||
    data.lastIP ||
    data.pcIpAddress ||
    normalizeSocketIp(socket.handshake.address)
  );
}

module.exports = { registerClientHandlers };
