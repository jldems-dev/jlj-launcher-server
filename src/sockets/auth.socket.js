const authService = require("../services/auth.service");
const { socketHandler } = require("../utils/asyncHandler");

function registerAuthHandlers(io, socket) {
  socketHandler(
    socket,
    "authenticate",
    async (data) => {
      socket.role = await authService.authenticateSocket(data);
      socket.emit("auth-success", { role: socket.role });
    },
    "auth-error",
  );
}

module.exports = { registerAuthHandlers };
