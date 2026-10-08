import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";
import {
  addPoints,
  getPoints,
  getPointsStats,
  getPointsByBrand,
  deletePoints,
  updatePoints,
  checkSchemeCode
} from "../controllers/pointsController.js";

const router = express.Router();

// NOTE: static segments MUST stay above "/:id" or Express matches them as an id.
router.get("/check-code", protect, logActivity("Points Management", "Checked scheme code", "READ"), checkSchemeCode);

router.post("/", protect, logActivity("Points Management", "Added points", "CREATE"), addPoints);
router.get("/", protect, logActivity("Points Management", "Viewed points list", "READ"), getPoints);
router.get("/stats", protect, logActivity("Points Management", "Viewed points statistics", "READ"), getPointsStats);
router.get("/brand/:brandId", protect, logActivity("Points Management", "Viewed points by brand", "READ"), getPointsByBrand);
router.put("/:id", protect, logActivity("Points Management", "Updated points", "UPDATE"), updatePoints);
router.delete("/:id", protect, logActivity("Points Management", "Deleted points", "DELETE"), deletePoints);

export default router;