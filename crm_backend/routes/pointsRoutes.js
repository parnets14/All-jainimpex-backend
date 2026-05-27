import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";
import {
  addPoints,
  getPoints,
  getPointsStats,
  getPointsByBrand,
  deletePoints,
  updatePoints
} from "../controllers/pointsController.js";

const router = express.Router();

router.post("/", protect, logActivity("Points Management", "Added points", "CREATE"), addPoints);
router.get("/", protect, logActivity("Points Management", "Viewed points list", "READ"), getPoints);
router.get("/stats", protect, logActivity("Points Management", "Viewed points statistics", "READ"), getPointsStats);
router.get("/brand/:brandId", protect, logActivity("Points Management", "Viewed points by brand", "READ"), getPointsByBrand);
router.put("/:id", protect, logActivity("Points Management", "Updated points", "UPDATE"), updatePoints);
router.delete("/:id", protect, logActivity("Points Management", "Deleted points", "DELETE"), deletePoints);

export default router;