const { env } = require("../config/env");

function isIPAllowed(ip) {
  const cleanIp = normalizeSocketIp(ip);

  return env.allowedIps.some((allowed) => {
    if (cleanIp === allowed) return true;
    if (allowed.endsWith(".") && cleanIp.startsWith(allowed)) return true;
    return false;
  });
}

function normalizeSocketIp(ip) {
  return String(ip || "")
    .replace("::ffff:", "")
    .replace(/^::1$/, "127.0.0.1")
    .trim();
}

module.exports = { isIPAllowed, normalizeSocketIp };
