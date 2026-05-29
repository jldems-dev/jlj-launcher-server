const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const adminAuthService = require("./adminAuth.service");

async function login(password) {
  if (!password) {
    const error = new Error("Password required");
    error.statusCode = 400;
    throw error;
  }

  const adminPasswordHash = await adminAuthService.getAdminPasswordHash();
  if (!adminPasswordHash) {
    const error = new Error("Admin password is not configured");
    error.statusCode = 500;
    throw error;
  }

  const valid = await bcrypt.compare(password, adminPasswordHash);
  if (!valid) {
    const error = new Error("Invalid password");
    error.statusCode = 401;
    throw error;
  }

  return jwt.sign({ admin: true }, env.jwtSecret, { expiresIn: "24h" });
}

async function verifyToken(token) {
  try {
    jwt.verify(token, env.jwtSecret);
    return true;
  } catch {
    return false;
  }
}

async function authenticateSocket(data = {}) {
  if (data.type === "admin" && data.token && (await verifyToken(data.token))) {
    return "admin";
  }

  if (data.type === "pc" && data.token && data.token === env.pcSecret) {
    return "pc";
  }

  const error = new Error("Unauthorized");
  error.statusCode = 401;
  throw error;
}

module.exports = { login, verifyToken, authenticateSocket };
