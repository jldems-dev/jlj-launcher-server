const { socketHandler } = require("../utils/asyncHandler");

function registerRemoteDesktopHandlers(io, socket, state) {
  socketHandler(
    socket,
    "start-remote-desktop",
    async (data = {}) => {
      const pcData = state.pcs[data.pcId];

      if (!pcData || !pcData.online) {
        socket.emit("remote-desktop-error", {
          message: "PC not found or offline",
          pcId: data.pcId,
        });
        return;
      }

      pcData.adminSocketId = socket.id;
      pcData.remoteDesktopActive = true;
      await state.pcService.save();
      io.to(pcData.socketId).emit("start-remote-desktop");
      socket.emit("remote-desktop-started", { pcId: data.pcId });
    },
    "remote-desktop-error",
  );

  socketHandler(socket, "stop-remote-desktop", async (data = {}) => {
    const pcData = state.pcs[data.pcId];

    if (pcData && pcData.socketId) {
      io.to(pcData.socketId).emit("stop-remote-desktop");
    }

    if (pcData) {
      pcData.remoteDesktopActive = false;
      pcData.adminSocketId = null;
      await state.pcService.save();
    }
  });

  socketHandler(socket, "screen-frame", async (data = {}) => {
    const { pcIp, pcData } = resolvePc(state, socket, data);
    const adminSocketId = pcData?.adminSocketId;

    if (adminSocketId && pcData.remoteDesktopActive) {
      io.to(adminSocketId).emit("screen-frame", { ...data, pcId: pcIp, pcIp });
    }
  });

  socketHandler(socket, "start-preview", async (data = {}) => {
    const pcData = state.pcs[data.pcId];
    if (!pcData || !pcData.online) return;

    if (!pcData.previewAdmins) pcData.previewAdmins = new Set();
    pcData.previewAdmins.add(socket.id);

    io.to(pcData.socketId).emit("start-preview", {
      quality: data.quality || 30,
      fps: data.fps || 5,
    });
  });

  socketHandler(socket, "stop-preview", async (data = {}) => {
    const pcData = state.pcs[data.pcId];
    if (!pcData || !pcData.previewAdmins) return;

    pcData.previewAdmins.delete(socket.id);
    if (pcData.previewAdmins.size === 0 && !pcData.remoteDesktopActive) {
      io.to(pcData.socketId).emit("stop-preview");
    }
  });

  socketHandler(socket, "preview-frame", async (data = {}) => {
    const { pcIp, pcData } = resolvePc(state, socket, data);
    if (!pcData || !pcData.previewAdmins) return;

    for (const adminSocketId of pcData.previewAdmins) {
      io.to(adminSocketId).emit("preview-frame", { ...data, pcId: pcIp, pcIp });
    }
  });

  [
    "remote-mouse-move",
    "remote-mouse-click",
    "remote-mouse-down",
    "remote-mouse-up",
    "remote-scroll",
    "remote-key",
    "remote-type",
  ].forEach((eventName) => {
    socketHandler(socket, eventName, async (data = {}) => {
      const pcData = state.pcs[data.pcId];
      if (!pcData || !pcData.online || !pcData.remoteDesktopActive) return;

      const { pcId, ...payload } = data;
      io.to(pcData.socketId).emit(eventName, payload);
    });
  });
}

function resolvePc(state, socket, data = {}) {
  const directKey = data.pcIp || data.pcId;
  if (directKey && state.pcs[directKey]) {
    return { pcIp: directKey, pcData: state.pcs[directKey] };
  }

  for (const [pcIp, pcData] of Object.entries(state.pcs)) {
    if (pcData.socketId === socket.id) return { pcIp, pcData };
    if (directKey && pcData.pcId === directKey) return { pcIp, pcData };
  }

  return { pcIp: directKey, pcData: null };
}

module.exports = { registerRemoteDesktopHandlers };
