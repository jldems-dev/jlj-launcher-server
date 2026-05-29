function notFoundHandler(req, res, next) {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "Not found" });
  }

  return next();
}

function errorHandler(error, req, res, next) {
  const status = error.statusCode || error.status || 500;
  const message = status >= 500 ? "Internal server error" : error.message;

  if (status >= 500) {
    console.error("Unhandled HTTP error:", error);
  }

  res.status(status).json({ error: message });
}

module.exports = { notFoundHandler, errorHandler };
