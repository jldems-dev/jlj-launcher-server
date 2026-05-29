const { socketHandler } = require("../utils/asyncHandler");

const adminCommands = [
  { event: "admin-shutdown-pc", target: "shutdown-pc" },
  { event: "admin-restart-pc", target: "restart-pc" },
  { event: "admin-lock-pc", target: "lock-pc" },
];

function registerCommandHandlers(io, socket, state) {
  adminCommands.forEach(({ event, target }) => {
    socketHandler(
      socket,
      event,
      async (data = {}) => {
        const pcData = state.pcs[data.pcId];

        if (!pcData || !pcData.online) {
          socket.emit("command-error", {
            message: "PC not found or offline",
            pcId: data.pcId,
          });
          return;
        }

        io.to(pcData.socketId).emit(target);
        socket.emit("command-success", { command: target, pcId: data.pcId });
      },
      "command-error",
    );
  });
}

module.exports = { registerCommandHandlers };
