const express = require("express");
const helmet = require("helmet");
const path = require("path");
const authRoutes = require("./routes/auth.routes");
const pcRoutes = require("./routes/pc.routes");
const { loginLimiter } = require("./middlewares/rateLimiter");
const { notFoundHandler, errorHandler } = require("./middlewares/errorHandler");

function createApp({ pcService } = {}) {
  const app = express();
  app.locals.pcService = pcService;

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.use("/api", loginLimiter, authRoutes);
  app.use("/api/pcs", pcRoutes);
  app.get("/health", (req, res) => res.json({ status: "ok" }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
