import express from "express";
import {
  createClaim,
  getClaims,
  getClaim,
  approveClaim,
  updateClaimPayment,
  deleteClaim,
  getClaimStats,
} from "../controllers/claimController.js";
import { protect } from "../middleware/authMiddleware.js";
import { uploadSingle, handleUploadErrors } from "../middleware/upload.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

router
  .route("/")
  .post(protect, uploadSingle("document"), handleUploadErrors, logActivity("Claims", "Created new claim", "CREATE"), createClaim)
  .get(protect, logActivity("Claims", "Viewed claims list", "READ"), getClaims);

router.route("/stats/summary").get(protect, logActivity("Claims", "Viewed claim statistics", "READ"), getClaimStats);

router
  .route("/:id")
  .get(protect, logActivity("Claims", "Viewed claim details", "READ"), getClaim)
  .delete(protect, logActivity("Claims", "Deleted claim", "DELETE"), deleteClaim);

router.route("/:id/approve").put(protect, logActivity("Claims", "Approved claim", "UPDATE"), approveClaim);
router.route("/:id/payment").put(protect, logActivity("Claims", "Updated claim payment", "UPDATE"), updateClaimPayment);

export default router;
