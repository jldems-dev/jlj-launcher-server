const express = require("express");
const pcController = require("../controllers/pc.controller");
const { requireAdmin } = require("../middlewares/adminAuth");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();

router.use(asyncHandler(requireAdmin));

router.get("/", asyncHandler(pcController.list));
router.post("/", asyncHandler(pcController.create));
router.get("/:pcIp", asyncHandler(pcController.get));
router.patch("/:pcIp", asyncHandler(pcController.update));
router.delete("/:pcIp", asyncHandler(pcController.remove));

module.exports = router;
