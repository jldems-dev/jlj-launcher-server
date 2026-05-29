const authService = require("../services/auth.service");

async function login(req, res) {
  const token = await authService.login(req.body.password);
  res.json({ token });
}

async function logout(req, res) {
  res.json({ message: "Logged out" });
}

async function verify(req, res) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ valid: false });
  }

  const valid = await authService.verifyToken(token);
  return res.status(valid ? 200 : 401).json({ valid });
}

module.exports = { login, logout, verify };
