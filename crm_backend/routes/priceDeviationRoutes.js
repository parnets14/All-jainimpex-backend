import express from "express";
import {
  getPriceDeviationReport,
  getCreditDeviationReport,
  getPaymentDeviationReport,
  getDiscountDeviationReport
} from "../controllers/priceDeviationController.js";
import { protect } from "../middleware/authMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);

// Price Deviation Reports
router.route("/price-deviation")
  .get(logActivity("Price Deviation Report", "Viewed price deviation report", "READ"), getPriceDeviationReport);

router.route("/credit-deviation")
  .get(logActivity("Price Deviation Report", "Viewed credit deviation report", "READ"), getCreditDeviationReport);

router.route("/payment-deviation")
  .get(logActivity("Price Deviation Report", "Viewed payment deviation report", "READ"), getPaymentDeviationReport);

router.route("/discount-deviation")
  .get(logActivity("Price Deviation Report", "Viewed discount deviation report", "READ"), getDiscountDeviationReport);

export default router;
