function registerDisconnectHandler(io, socket, state) {
  socket.on("disconnect", async () => {
    let shouldSave = false;

    for (const [pcId, pcData] of Object.entries(state.pcs)) {
      if (pcData.socketId === socket.id) {
        await state.pcService.markSocketOffline(socket.id);
        io.emit("pcs-update", state.pcs);
        break;
      }

      if (pcData.adminSocketId === socket.id) {
        if (pcData.socketId) io.to(pcData.socketId).emit("stop-remote-desktop");
        state.pcs[pcId].remoteDesktopActive = false;
        state.pcs[pcId].adminSocketId = null;
        shouldSave = true;
      }

      if (pcData.previewAdmins) {
        pcData.previewAdmins.delete(socket.id);
        if (pcData.previewAdmins.size === 0 && !pcData.remoteDesktopActive) {
          io.to(pcData.socketId).emit("stop-preview");
        }
      }
    }

    if (shouldSave) await state.pcService.save();
  });
}

module.exports = { registerDisconnectHandler };
