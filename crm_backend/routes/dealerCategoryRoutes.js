import express from "express";
import {
  createDealerCategory,
  getAllDealerCategories,
  getDealerCategoryById,
  updateDealerCategory,
  deleteDealerCategory,
} from "../controllers/dealerCategory.js";

const router = express.Router();

router.post("/create", createDealerCategory);
router.get("/getall", getAllDealerCategories);
router.get("/:id", getDealerCategoryById);
router.put("/:id", updateDealerCategory);
router.delete("/:id", deleteDealerCategory);

export default router;
