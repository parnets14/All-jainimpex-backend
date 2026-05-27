// routes/referenceRoutes.js
import express from "express";
import { getSchemeTypes, createSchemeType } from "../controllers/schemeTypeController.js";
import { getPaymentTerms, createPaymentTerm } from "../controllers/paymentTermController.js";
import { protect } from "../middleware/authMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// Scheme types routes
router.get("/scheme-types", protect, logActivity("Reference Data", "Viewed scheme types", "READ"), getSchemeTypes);
router.post("/scheme-types", protect, logActivity("Reference Data", "Created new scheme type", "CREATE"), createSchemeType);

// Payment terms routes
router.get("/payment-terms", protect, logActivity("Reference Data", "Viewed payment terms", "READ"), getPaymentTerms);
router.post("/payment-terms", protect, logActivity("Reference Data", "Created new payment term", "CREATE"), createPaymentTerm);

export default router;
