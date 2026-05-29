function getPcService(req) {
  return req.app.locals.pcService;
}

function emitPcUpdate(req) {
  const io = req.app.locals.io;
  const pcService = getPcService(req);
  if (io && pcService) io.emit("pcs-update", pcService.getAll());
}

async function list(req, res) {
  const pcs = await getPcService(req).list();
  res.json({ pcs });
}

async function get(req, res) {
  const pc = await getPcService(req).getByIp(req.params.pcIp);
  if (!pc) return res.status(404).json({ error: "PC not found" });
  res.json({ pc });
}

async function create(req, res) {
  const pc = await getPcService(req).create(req.body);
  emitPcUpdate(req);
  res.status(201).json({ pc });
}

async function update(req, res) {
  const pc = await getPcService(req).update(req.params.pcIp, req.body);
  emitPcUpdate(req);
  res.json({ pc });
}

async function remove(req, res) {
  const pcService = getPcService(req);
  const pc = pcService.getAll()[req.params.pcIp] || (await pcService.getByIp(req.params.pcIp));

  if (!pc) return res.status(404).json({ error: "PC not found" });

  if (pc.socketId && req.app.locals.io) {
    req.app.locals.io.to(pc.socketId).emit("stop-preview");
    req.app.locals.io.to(pc.socketId).emit("stop-remote-desktop");
    req.app.locals.io.sockets.sockets.get(pc.socketId)?.disconnect(true);
  }

  await pcService.remove(req.params.pcIp);
  emitPcUpdate(req);
  res.json({ pc });
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
};
