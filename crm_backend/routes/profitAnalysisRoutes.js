import express from "express";
import { protect, requirePermission } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";
import { 
  getBillWiseProfitAnalysis, 
  getGroupedProfitAnalysis 
} from "../controllers/profitAnalysisController.js";

const router = express.Router();

// All routes are protected
router.use(protect);
router.use(attachCompanyDB);

// @route   GET /api/profit-analysis/bills
// @desc    Get bill-wise profit analysis with pagination
// @access  Private
router.get("/bills", requirePermission("reports.read"), logActivity("Profit Analysis", "Viewed bill-wise profit analysis", "READ"), getBillWiseProfitAnalysis);

// @route   GET /api/profit-analysis/grouped
// @desc    Get grouped profit analysis (dealer/supplier wise)
// @access  Private
router.get("/grouped", requirePermission("reports.read"), logActivity("Profit Analysis", "Viewed grouped profit analysis", "READ"), getGroupedProfitAnalysis);

export default router;
