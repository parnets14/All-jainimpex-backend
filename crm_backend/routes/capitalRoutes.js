import express from 'express';
import { 
  getAllCapitals, 
  createCapital, 
  updateCapital, 
  deleteCapital 
} from '../controllers/capitalController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getAllCapitals)
  .post(createCapital);

router.route('/:id')
  .put(updateCapital)
  .delete(deleteCapital);

export default router;
