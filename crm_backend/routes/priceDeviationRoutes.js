import express from "express";
import {
  getPriceDeviationReport,
  getCreditDeviationReport,
  getPaymentDeviationReport,
  getDiscountDeviationReport,
  getQuantityDeviationReport,
  testConnection
} from "../controllers/priceDeviationController.js";
import { protect } from "../middleware/authMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// Test endpoint (without auth for testing)
router.route("/test-no-auth")
  .get(testConnection);

// All other routes are protected
router.use(protect);

// Price Deviation Reports
router.route("/price-deviation")
  .get(logActivity("Price Deviation Report", "Viewed price deviation report", "READ"), getPriceDeviationReport);

router.route("/quantity-deviation")
  .get(logActivity("Quantity Deviation Report", "Viewed quantity deviation report", "READ"), getQuantityDeviationReport);

router.route("/credit-deviation")
  .get(logActivity("Price Deviation Report", "Viewed credit deviation report", "READ"), getCreditDeviationReport);

router.route("/payment-deviation")
  .get(logActivity("Price Deviation Report", "Viewed payment deviation report", "READ"), getPaymentDeviationReport);

router.route("/discount-deviation")
  .get(logActivity("Discount Deviation Report", "Viewed discount deviation report", "READ"), getDiscountDeviationReport);

export default router;


