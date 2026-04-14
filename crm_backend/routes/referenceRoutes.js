// routes/referenceRoutes.js
import express from "express";
import { getSchemeTypes, createSchemeType } from "../controllers/schemeTypeController.js";
import { getPaymentTerms, createPaymentTerm } from "../controllers/paymentTermController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Scheme types routes
router.route("/scheme-types")
  .get(protect, getSchemeTypes)
  .post(protect, createSchemeType);

// Payment terms routes
router.route("/payment-terms")
  .get(protect, getPaymentTerms)
  .post(protect, createPaymentTerm);

export default router;