import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  addPoints,
  getPoints,
  getPointsStats,
  getPointsByBrand,
  deletePoints
} from "../controllers/pointsController.js";

const router = express.Router();

router.post("/", protect, addPoints);
router.get("/", protect, getPoints);
router.get("/stats", protect, getPointsStats);
router.get("/brand/:brandId", protect, getPointsByBrand);
router.delete("/:id", protect, deletePoints);

export default router;