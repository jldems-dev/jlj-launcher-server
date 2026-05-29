const { db } = require("../db");

const MAX_TEMPLATES = 3;

function mapTemplate(row) {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type,
  };
}

function validateTemplateInput(data = {}) {
  const title = String(data.title || "").trim();
  const message = String(data.message || "").trim();
  const type = String(data.type || "info").trim() || "info";

  if (!title || !message) {
    throw new Error("Title and message are required");
  }

  return { title, message, type };
}

async function listTemplates() {
  const rows = db
    .prepare("SELECT id, title, message, type FROM templates ORDER BY created_at ASC, id ASC")
    .all();

  return rows.map(mapTemplate);
}

async function getTemplateById(id) {
  const row = db
    .prepare("SELECT id, title, message, type FROM templates WHERE id = ?")
    .get(Number(id));

  return row ? mapTemplate(row) : null;
}

async function saveTemplate(data = {}) {
  const id = data.id ? Number(data.id) : Date.now();
  const input = validateTemplateInput(data);
  const existing = await getTemplateById(id);

  if (!existing) {
    const count = db.prepare("SELECT COUNT(*) AS count FROM templates").get().count;
    if (count >= MAX_TEMPLATES) {
      throw new Error("Maximum 3 templates allowed. Delete one first.");
    }
  }

  const now = Date.now();

  if (existing) {
    db.prepare(`
      UPDATE templates
      SET title = @title, message = @message, type = @type, updated_at = @now
      WHERE id = @id
    `).run({ id, ...input, now });
  } else {
    db.prepare(`
      INSERT INTO templates (id, title, message, type, created_at, updated_at)
      VALUES (@id, @title, @message, @type, @now, @now)
    `).run({ id, ...input, now });
  }

  return {
    template: { id, ...input },
    created: !existing,
  };
}

async function deleteTemplate(id) {
  const template = await getTemplateById(id);
  if (!template) {
    throw new Error("Template not found");
  }

  db.prepare("DELETE FROM templates WHERE id = ?").run(Number(id));
  return template;
}

module.exports = {
  listTemplates,
  getTemplateById,
  saveTemplate,
  deleteTemplate,
};
