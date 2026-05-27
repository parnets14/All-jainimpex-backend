import express from "express";
import {
  createClaimType,
  getClaimTypes,
  updateClaimType,
  deleteClaimType,
} from "../controllers/claimTypeController.js";
import { protect } from "../middleware/authMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

router.route("/").post(protect, logActivity("Claim Types", "Created new claim type", "CREATE"), createClaimType).get(protect, logActivity("Claim Types", "Viewed claim types list", "READ"), getClaimTypes);

router
  .route("/:id")
  .put(protect, logActivity("Claim Types", "Updated claim type", "UPDATE"), updateClaimType)
  .delete(protect, logActivity("Claim Types", "Deleted claim type", "DELETE"), deleteClaimType);

export default router;
