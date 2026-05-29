const { socketHandler } = require("../utils/asyncHandler");

function registerTemplateHandlers(io, socket, state) {
  socketHandler(socket, "get-templates", async () => {
    socket.emit("templates-update", await state.templateService.listTemplates());
  });

  socketHandler(socket, "save-template", async (data = {}) => {
    const result = await state.templateService.saveTemplate(data);
    const templates = await state.templateService.listTemplates();

    io.emit("templates-update", templates);
    socket.emit("template-success", {
      message: result.created ? "Template created" : "Template updated",
      template: result.template,
    });

    console.log(
      `${result.created ? "Template created" : "Template updated"}: ${result.template.title}`,
    );
  });

  socketHandler(socket, "delete-template", async (data = {}) => {
    const deleted = await state.templateService.deleteTemplate(data.id);
    const templates = await state.templateService.listTemplates();

    io.emit("templates-update", templates);
    socket.emit("template-success", { message: "Template deleted" });
    console.log(`Template deleted: ${deleted.title}`);
  });
}

module.exports = { registerTemplateHandlers };
