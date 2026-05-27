import express from "express";
import {
  createDealerCategory,
  getAllDealerCategories,
  getDealerCategoryById,
  updateDealerCategory,
  deleteDealerCategory,
} from "../controllers/dealerCategory.js";
import { protect } from "../middleware/authMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

router.post("/create", protect, logActivity("Dealer Category", "Created new dealer category", "CREATE"), createDealerCategory);
router.get("/getall", protect, logActivity("Dealer Category", "Viewed dealer categories list", "READ"), getAllDealerCategories);
router.get("/:id", protect, logActivity("Dealer Category", "Viewed dealer category details", "READ"), getDealerCategoryById);
router.put("/:id", protect, logActivity("Dealer Category", "Updated dealer category", "UPDATE"), updateDealerCategory);
router.delete("/:id", protect, logActivity("Dealer Category", "Deleted dealer category", "DELETE"), deleteDealerCategory);

export default router;
