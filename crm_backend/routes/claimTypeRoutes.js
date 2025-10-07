import express from "express";
import {
  createClaimType,
  getClaimTypes,
  updateClaimType,
  deleteClaimType,
} from "../controllers/claimTypeController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.route("/").post(protect, createClaimType).get(protect, getClaimTypes);

router
  .route("/:id")
  .put(protect, updateClaimType)
  .delete(protect, deleteClaimType);

export default router;