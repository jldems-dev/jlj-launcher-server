const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const databaseDir = path.join(__dirname, "..", "..", "database");
fs.mkdirSync(databaseDir, { recursive: true });

const dbPath = path.join(databaseDir, "launcher.db");
const db = new Database(dbPath);

async function initializeDatabase() {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_templates_created_at
      ON templates(created_at);

    CREATE TABLE IF NOT EXISTS admin_auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pcs (
      pc_ip TEXT PRIMARY KEY,
      pc_id TEXT NOT NULL,
      socket_id TEXT,
      online INTEGER NOT NULL DEFAULT 0,
      last_seen INTEGER NOT NULL,
      current_game TEXT,
      cpu_usage REAL,
      ram_usage REAL,
      uptime INTEGER,
      remote_desktop_active INTEGER NOT NULL DEFAULT 0,
      admin_socket_id TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pcs_online
      ON pcs(online);

    CREATE INDEX IF NOT EXISTS idx_pcs_last_seen
      ON pcs(last_seen);
  `);

  migratePcIpPrimaryKey();
}

function migratePcIpPrimaryKey() {
  const columns = db.prepare("PRAGMA table_info(pcs)").all();
  const hasPcIp = columns.some((column) => column.name === "pc_ip");

  if (hasPcIp) return;

  db.exec(`
    ALTER TABLE pcs RENAME TO pcs_legacy_pc_id;

    CREATE TABLE pcs (
      pc_ip TEXT PRIMARY KEY,
      pc_id TEXT NOT NULL,
      socket_id TEXT,
      online INTEGER NOT NULL DEFAULT 0,
      last_seen INTEGER NOT NULL,
      current_game TEXT,
      cpu_usage REAL,
      ram_usage REAL,
      uptime INTEGER,
      remote_desktop_active INTEGER NOT NULL DEFAULT 0,
      admin_socket_id TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    INSERT INTO pcs (
      pc_ip, pc_id, socket_id, online, last_seen, current_game, cpu_usage,
      ram_usage, uptime, remote_desktop_active, admin_socket_id, data_json,
      created_at, updated_at
    )
    SELECT
      COALESCE(
        NULLIF(json_extract(data_json, '$.pcIp'), ''),
        NULLIF(json_extract(data_json, '$.lastIP'), ''),
        pc_id
      ) AS pc_ip,
      pc_id,
      socket_id,
      online,
      last_seen,
      current_game,
      cpu_usage,
      ram_usage,
      uptime,
      remote_desktop_active,
      admin_socket_id,
      data_json,
      created_at,
      updated_at
    FROM pcs_legacy_pc_id;

    DROP TABLE pcs_legacy_pc_id;

    CREATE INDEX IF NOT EXISTS idx_pcs_online
      ON pcs(online);

    CREATE INDEX IF NOT EXISTS idx_pcs_last_seen
      ON pcs(last_seen);
  `);
}

module.exports = { db, dbPath, initializeDatabase };
