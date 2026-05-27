import express from "express";
import {
  getDealerPerformance,
  getDealerPerformanceById,
  createDealerPerformance,
  updateDealerPerformance,
  deleteDealerPerformance,
  generateDealerPerformance,
  getDealerPerformanceStats
} from "../controllers/dealerPerformanceController.js";
import { protect } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(protect);
router.use(attachCompanyDB);

// Get dealer performance records with filters and pagination
router.get("/", 
  requirePermission("dealer_performance_read"),
  logActivity("Dealer Performance", "Viewed dealer performance list", "READ"),
  getDealerPerformance
);

// Get dealer performance statistics
router.get("/stats", 
  requirePermission("dealer_performance_read"),
  logActivity("Dealer Performance", "Viewed dealer performance statistics", "READ"),
  getDealerPerformanceStats
);

// Get specific dealer performance record
router.get("/:id", 
  requirePermission("dealer_performance_read"),
  logActivity("Dealer Performance", "Viewed dealer performance details", "READ"),
  getDealerPerformanceById
);

// Create new dealer performance record
router.post("/", 
  requirePermission("dealer_performance_create"),
  logActivity("Dealer Performance", "Created dealer performance record", "CREATE"),
  createDealerPerformance
);

// Generate dealer performance from invoices and credit notes
router.post("/generate", 
  requirePermission("dealer_performance_create"),
  logActivity("Dealer Performance", "Generated dealer performance", "CREATE"),
  generateDealerPerformance
);

// Update dealer performance record
router.put("/:id", 
  requirePermission("dealer_performance_update"),
  logActivity("Dealer Performance", "Updated dealer performance record", "UPDATE"),
  updateDealerPerformance
);

// Delete dealer performance record (soft delete)
router.delete("/:id", 
  requirePermission("dealer_performance_delete"),
  logActivity("Dealer Performance", "Deleted dealer performance record", "DELETE"),
  deleteDealerPerformance
);

export default router;
