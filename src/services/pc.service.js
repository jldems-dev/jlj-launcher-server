const { db } = require("../db");

const runtimeOnlyFields = new Set(["previewAdmins"]);

function createPcService() {
  const pcs = loadPCs();

  function getAll() {
    return pcs;
  }

  async function list() {
    return listRows().map(mapRow);
  }

  async function getByIp(pcIp) {
    const row = getRowByIp(normalizePcIp(pcIp));
    return row ? mapRow(row) : null;
  }

  async function create(data = {}) {
    const pcIp = normalizePcIp(data.pcIp);
    if (!pcIp) {
      const error = new Error("pcIp is required");
      error.statusCode = 400;
      throw error;
    }

    if (getRowByIp(pcIp)) {
      const error = new Error("PC already exists");
      error.statusCode = 409;
      throw error;
    }

    const now = Date.now();
    const pc = {
      ...pickEditableFields(data),
      pcIp,
      pcId: normalizeDisplayName(data.pcId) || pcIp,
      socketId: null,
      online: false,
      lastSeen: data.lastSeen || now,
      remoteDesktopActive: false,
      adminSocketId: null,
    };

    pcs[pcIp] = pc;
    persistPc(pcIp, pc);
    return pc;
  }

  async function save() {
    const saveMany = db.transaction((entries) => {
      for (const [pcIp, pc] of entries) {
        persistPc(pcIp, pc);
      }
    });

    saveMany(Object.entries(pcs));
  }

  async function upsert(identifier, data = {}, socketId) {
    const pcIp = resolvePcIp(data, identifier);
    if (!pcIp) {
      const error = new Error("pcIp is required to register a PC");
      error.statusCode = 400;
      throw error;
    }

    const existing = pcs[pcIp] || mapRow(getRowByIp(pcIp));
    const displayName = existing?.pcId || normalizeDisplayName(data.pcId) || pcIp;

    pcs[pcIp] = {
      ...existing,
      ...data,
      pcIp,
      pcId: displayName,
      socketId,
      online: true,
      lastSeen: Date.now(),
    };

    persistPc(pcIp, pcs[pcIp]);
    return pcs[pcIp];
  }

  async function update(pcIp, data = {}) {
    const normalizedPcIp = normalizePcIp(pcIp);
    const existing = pcs[normalizedPcIp] || mapRow(getRowByIp(normalizedPcIp));

    if (!existing) {
      const error = new Error("PC not found");
      error.statusCode = 404;
      throw error;
    }

    const updated = {
      ...existing,
      ...pickEditableFields(data),
      pcIp: normalizedPcIp,
      pcId: normalizeDisplayName(data.pcId) || existing.pcId,
      lastSeen: data.lastSeen || existing.lastSeen,
    };

    pcs[normalizedPcIp] = updated;
    persistPc(normalizedPcIp, updated);
    return updated;
  }

  async function remove(pcIp) {
    const normalizedPcIp = normalizePcIp(pcIp);
    const existing = pcs[normalizedPcIp] || mapRow(getRowByIp(normalizedPcIp));

    if (!existing) {
      const error = new Error("PC not found");
      error.statusCode = 404;
      throw error;
    }

    db.prepare("DELETE FROM pcs WHERE pc_ip = ?").run(normalizedPcIp);
    delete pcs[normalizedPcIp];
    return existing;
  }

  async function markSocketOffline(socketId) {
    let changed = false;

    for (const [pcIp, pc] of Object.entries(pcs)) {
      if (pc.socketId === socketId) {
        pc.online = false;
        pc.socketId = null;
        pc.remoteDesktopActive = false;
        pc.adminSocketId = null;
        pc.lastSeen = Date.now();
        persistPc(pcIp, pc);
        changed = true;
      }
    }

    return changed;
  }

  markAllOfflineOnStartup(pcs);

  return {
    getAll,
    list,
    getByIp,
    create,
    save,
    upsert,
    update,
    remove,
    markSocketOffline,
  };
}

function loadPCs() {
  const pcs = {};

  for (const row of listRows()) {
    const pc = mapRow(row);
    pcs[pc.pcIp] = pc;
  }

  return pcs;
}

function listRows() {
  return db
    .prepare(
      `
      SELECT pc_ip, pc_id, socket_id, online, last_seen, current_game, cpu_usage,
        ram_usage, uptime, remote_desktop_active, admin_socket_id, data_json,
        created_at, updated_at
      FROM pcs
      ORDER BY last_seen DESC, pc_id ASC
    `,
    )
    .all();
}

function getRowByIp(pcIp) {
  if (!pcIp) return null;

  return db
    .prepare(
      `
      SELECT pc_ip, pc_id, socket_id, online, last_seen, current_game, cpu_usage,
        ram_usage, uptime, remote_desktop_active, admin_socket_id, data_json,
        created_at, updated_at
      FROM pcs
      WHERE pc_ip = ?
    `,
    )
    .get(pcIp);
}

function mapRow(row) {
  if (!row) return null;

  const data = parseJson(row.data_json);

  return {
    ...data,
    pcIp: row.pc_ip,
    pcId: row.pc_id,
    socketId: null,
    online: false,
    lastSeen: row.last_seen,
    currentGame: row.current_game ?? data.currentGame,
    cpuUsage: row.cpu_usage ?? data.cpuUsage,
    ramUsage: row.ram_usage ?? data.ramUsage,
    uptime: row.uptime ?? data.uptime,
    remoteDesktopActive: false,
    adminSocketId: null,
  };
}

function markAllOfflineOnStartup(pcs) {
  const now = Date.now();

  db.prepare(
    `
    UPDATE pcs
    SET online = 0,
      socket_id = NULL,
      remote_desktop_active = 0,
      admin_socket_id = NULL,
      updated_at = @now
    WHERE online = 1 OR socket_id IS NOT NULL OR remote_desktop_active = 1 OR admin_socket_id IS NOT NULL
  `,
  ).run({ now });

  for (const pc of Object.values(pcs)) {
    pc.online = false;
    pc.socketId = null;
    pc.remoteDesktopActive = false;
    pc.adminSocketId = null;
  }
}

function persistPc(pcIp, pc = {}) {
  const normalizedPcIp = normalizePcIp(pcIp || pc.pcIp);
  if (!normalizedPcIp) {
    const error = new Error("pcIp is required to save a PC");
    error.statusCode = 400;
    throw error;
  }

  const existing = db.prepare("SELECT created_at FROM pcs WHERE pc_ip = ?").get(normalizedPcIp);
  const now = Date.now();
  const displayName = normalizeDisplayName(pc.pcId) || normalizedPcIp;
  const data = serializePcData({ ...pc, pcIp: normalizedPcIp, pcId: displayName });

  db.prepare(
    `
    INSERT INTO pcs (
      pc_ip, pc_id, socket_id, online, last_seen, current_game, cpu_usage, ram_usage,
      uptime, remote_desktop_active, admin_socket_id, data_json, created_at, updated_at
    )
    VALUES (
      @pcIp, @pcId, @socketId, @online, @lastSeen, @currentGame, @cpuUsage, @ramUsage,
      @uptime, @remoteDesktopActive, @adminSocketId, @dataJson, @createdAt, @updatedAt
    )
    ON CONFLICT(pc_ip) DO UPDATE SET
      pc_id = excluded.pc_id,
      socket_id = excluded.socket_id,
      online = excluded.online,
      last_seen = excluded.last_seen,
      current_game = excluded.current_game,
      cpu_usage = excluded.cpu_usage,
      ram_usage = excluded.ram_usage,
      uptime = excluded.uptime,
      remote_desktop_active = excluded.remote_desktop_active,
      admin_socket_id = excluded.admin_socket_id,
      data_json = excluded.data_json,
      updated_at = excluded.updated_at
  `,
  ).run({
    pcIp: normalizedPcIp,
    pcId: displayName,
    socketId: pc.socketId || null,
    online: pc.online ? 1 : 0,
    lastSeen: Number(pc.lastSeen || now),
    currentGame: pc.currentGame || null,
    cpuUsage: toNullableNumber(pc.cpuUsage),
    ramUsage: toNullableNumber(pc.ramUsage),
    uptime: toNullableNumber(pc.uptime),
    remoteDesktopActive: pc.remoteDesktopActive ? 1 : 0,
    adminSocketId: pc.adminSocketId || null,
    dataJson: JSON.stringify(data),
    createdAt: existing?.created_at || now,
    updatedAt: now,
  });
}

function resolvePcIp(data = {}, fallback) {
  return normalizePcIp(data.pcIp || data.ip || data.lastIP || fallback);
}

function normalizePcIp(value) {
  return String(value || "").trim();
}

function normalizeDisplayName(value) {
  return String(value || "").trim();
}

function pickEditableFields(data = {}) {
  const editable = {};

  for (const key of ["currentGame", "cpuUsage", "ramUsage", "uptime", "storage", "timestamp", "type"]) {
    if (Object.prototype.hasOwnProperty.call(data, key)) editable[key] = data[key];
  }

  return editable;
}

function serializePcData(pc) {
  const data = {};

  for (const [key, value] of Object.entries(pc)) {
    if (runtimeOnlyFields.has(key)) continue;
    if (typeof value === "function") continue;
    data[key] = value;
  }

  return data;
}

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

module.exports = { createPcService };
