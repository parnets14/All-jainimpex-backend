import express from 'express';
import {
  createCollection,
  getMyCollections,
  getCollectionById,
} from '../controllers/collectionController.js';
import protect from '../middleware/protect.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// Sales Executive routes - require SE authentication
router.use(protect);

// Create collection with receipt upload
router.post('/', upload.single('receipt'), createCollection);

// Get my collections
router.get('/', getMyCollections);

// Get collection by ID
router.get('/:id', getCollectionById);

export default router;
