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
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

// Wishlist CRUD routes
router.get('/', logActivity("Purchase Wishlist", "Viewed purchase wishlists", "READ"), getPurchaseWishlists);
router.get('/:id', logActivity("Purchase Wishlist", "Viewed purchase wishlist details", "READ"), getPurchaseWishlist);
router.post('/', logActivity("Purchase Wishlist", "Created new purchase wishlist", "CREATE"), createPurchaseWishlist);
router.put('/:id', logActivity("Purchase Wishlist", "Updated purchase wishlist", "UPDATE"), updatePurchaseWishlist);
router.delete('/:id', logActivity("Purchase Wishlist", "Deleted purchase wishlist", "DELETE"), deletePurchaseWishlist);

// Wishlist item management routes
router.post('/:id/items', logActivity("Purchase Wishlist", "Added items to wishlist", "UPDATE"), addItemsToWishlist);
router.delete('/:id/items/:itemId', logActivity("Purchase Wishlist", "Removed item from wishlist", "DELETE"), removeItemFromWishlist);
router.put('/:id/items/:itemId', logActivity("Purchase Wishlist", "Updated wishlist item", "UPDATE"), updateWishlistItem);

export default router;