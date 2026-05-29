const { Server } = require("socket.io");
const { env } = require("./env");
const { isIPAllowed, normalizeSocketIp } = require("../utils/ip");

function createSocketServer(server) {
  const io = new Server(server, {
    cors: {
      origin: env.corsOrigin,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const clientIp = socket.handshake.address;
    const cleanIp = normalizeSocketIp(clientIp);

    console.log("=== CONNECTION ATTEMPT ===");
    console.log("Socket ID:", socket.id);
    console.log("Client IP:", clientIp);
    console.log("Clean IP:", cleanIp);

    if (!isIPAllowed(clientIp)) {
      console.log("IP BLOCKED:", clientIp);
      return next(new Error("IP not allowed"));
    }

    console.log("IP ALLOWED:", clientIp);
    return next();
  });

  return io;
}

module.exports = { createSocketServer };
