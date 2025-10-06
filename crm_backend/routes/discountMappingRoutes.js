import express from "express";
import {
  getDiscountMappings,
  getDiscountMapping,
  createDiscountMapping,
  updateDiscountMapping,
  deleteDiscountMapping,
  approveDiscountMapping,
  getDiscountStats
} from "../controllers/discountMappingController.js";
import { protect, requireRole } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);

router
  .route("/")
  .get(getDiscountMappings)
  .post(createDiscountMapping);

router
  .route("/stats")
  .get(getDiscountStats);

router
  .route("/:id")
  .get(getDiscountMapping)
  .put(updateDiscountMapping)
  .delete(requireRole(["super_admin", "admin"]), deleteDiscountMapping)
    

router
  .route("/:id/approve")
  .patch(requireRole(["super_admin"]), approveDiscountMapping)

  
export default router;