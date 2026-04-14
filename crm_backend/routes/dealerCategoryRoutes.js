import express from "express";
import {
  createDealerCategory,
  getAllDealerCategories,
  getDealerCategoryById,
  updateDealerCategory,
  deleteDealerCategory,
} from "../controllers/dealerCategory.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/create", protect, createDealerCategory);
router.get("/getall", protect, getAllDealerCategories);
router.get("/:id", protect, getDealerCategoryById);
router.put("/:id", protect, updateDealerCategory);
router.delete("/:id", protect, deleteDealerCategory);

export default router;
