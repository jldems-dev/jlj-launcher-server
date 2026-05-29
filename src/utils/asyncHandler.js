function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function socketHandler(socket, eventName, handler, errorEvent = "template-error") {
  socket.on(eventName, async (data) => {
    try {
      await handler(data);
    } catch (error) {
      console.error(`Socket handler failed for ${eventName}:`, error);
      socket.emit(errorEvent, { message: error.message || "Unexpected socket error" });
    }
  });
}

module.exports = { asyncHandler, socketHandler };
