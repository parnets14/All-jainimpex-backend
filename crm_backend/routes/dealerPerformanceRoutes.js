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

const router = express.Router();

// Apply authentication to all routes
router.use(protect);
router.use(attachCompanyDB);

// Get dealer performance records with filters and pagination
router.get("/", 
  requirePermission("dealer_performance_read"),
  getDealerPerformance
);

// Get dealer performance statistics
router.get("/stats", 
  requirePermission("dealer_performance_read"),
  getDealerPerformanceStats
);

// Get specific dealer performance record
router.get("/:id", 
  requirePermission("dealer_performance_read"),
  getDealerPerformanceById
);

// Create new dealer performance record
router.post("/", 
  requirePermission("dealer_performance_create"),
  createDealerPerformance
);

// Generate dealer performance from invoices and credit notes
router.post("/generate", 
  requirePermission("dealer_performance_create"),
  generateDealerPerformance
);

// Update dealer performance record
router.put("/:id", 
  requirePermission("dealer_performance_update"),
  updateDealerPerformance
);

// Delete dealer performance record (soft delete)
router.delete("/:id", 
  requirePermission("dealer_performance_delete"),
  deleteDealerPerformance
);

export default router;
