const { db } = require("../db");

async function getAdminPasswordHash() {
  const row = db.prepare("SELECT password_hash FROM admin_auth WHERE id = 1").get();
  return row?.password_hash || null;
}

module.exports = { getAdminPasswordHash };
