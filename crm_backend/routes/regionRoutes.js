// backend/routes/regionRoutes.js
import express from "express";
import {
  getRegions,
  createRegion,
  updateRegion,
  deleteRegion,
} from "../controllers/regionController.js";

const router = express.Router();

router.get("/getall", getRegions);
router.post("/create", createRegion);
router.put("/:id", updateRegion);
router.delete("/:id", deleteRegion);

export default router;
