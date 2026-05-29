const { createServer } = require("http");
const { createApp } = require("./app");
const { env } = require("./config/env");
const { createSocketServer } = require("./config/socket");
const { initializeDatabase } = require("./db");
const { createPcService } = require("./services/pc.service");
const { registerSocketHandlers } = require("./sockets");

async function start() {
  await initializeDatabase();

  const pcService = createPcService();
  const app = createApp({ pcService });
  const server = createServer(app);
  const io = createSocketServer(server);
  app.locals.io = io;

  await registerSocketHandlers(io, pcService);

  server.listen(env.port, () => {
    console.log(`Admin server running on port ${env.port}`);
    console.log(`Dashboard: http://localhost:${env.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
