const templateService = require("../services/template.service");
const { registerAuthHandlers } = require("./auth.socket");
const { registerClientHandlers } = require("./clients.socket");
const { registerTemplateHandlers } = require("./templates.socket");
const { registerMessageHandlers } = require("./messages.socket");
const { registerRemoteDesktopHandlers } = require("./remoteDesktop.socket");
const { registerCommandHandlers } = require("./commands.socket");
const { registerDisconnectHandler } = require("./disconnect.socket");

async function registerSocketHandlers(io, pcService) {
  const state = {
    pcService,
    templateService,
    pcs: pcService.getAll(),
  };

  const templates = await templateService.listTemplates();
  console.log("PCs after load:", Object.keys(state.pcs));
  console.log(`Templates loaded: ${templates.length}`);

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    registerAuthHandlers(io, socket, state);
    registerClientHandlers(io, socket, state);
    registerTemplateHandlers(io, socket, state);
    registerMessageHandlers(io, socket, state);
    registerRemoteDesktopHandlers(io, socket, state);
    registerCommandHandlers(io, socket, state);
    registerDisconnectHandler(io, socket, state);
  });
}

module.exports = { registerSocketHandlers };
