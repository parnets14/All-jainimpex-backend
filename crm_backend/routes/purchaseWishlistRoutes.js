import express from 'express';
import {
  getPurchaseWishlists,
  getPurchaseWishlist,
  createPurchaseWishlist,
  updatePurchaseWishlist,
  deletePurchaseWishlist,
  addItemsToWishlist,
  removeItemFromWishlist,
  updateWishlistItem
} from '../controllers/purchaseWishlistController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

// Wishlist CRUD routes
router.get('/', getPurchaseWishlists);
router.get('/:id', getPurchaseWishlist);
router.post('/', createPurchaseWishlist);
router.put('/:id', updatePurchaseWishlist);
router.delete('/:id', deletePurchaseWishlist);

// Wishlist item management routes
router.post('/:id/items', addItemsToWishlist);
router.delete('/:id/items/:itemId', removeItemFromWishlist);
router.put('/:id/items/:itemId', updateWishlistItem);

export default router;