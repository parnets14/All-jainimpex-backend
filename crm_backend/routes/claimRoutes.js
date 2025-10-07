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

const router = express.Router();

router
  .route("/")
  .post(protect, uploadSingle("document"), handleUploadErrors, createClaim)
  .get(protect, getClaims);

router.route("/stats/summary").get(protect, getClaimStats);

router
  .route("/:id")
  .get(protect, getClaim)
  .delete(protect, deleteClaim);

router.route("/:id/approve").put(protect, approveClaim);
router.route("/:id/payment").put(protect, updateClaimPayment);

export default router;