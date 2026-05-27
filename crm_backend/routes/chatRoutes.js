import express from 'express';
import {
  getConversations,
  getConversation,
  getMessages,
  sendMessage,
  markResolved,
  createCreditNoteFromConversation
} from '../app/controllers/chatController.js';
import { protect } from '../middleware/authMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Conversation routes (for web interface)
router.get('/conversations', logActivity("Chat", "Viewed conversations list", "READ"), getConversations);
router.get('/conversations/:id', logActivity("Chat", "Viewed conversation details", "READ"), getConversation);
router.patch('/conversations/:id/resolve', logActivity("Chat", "Marked conversation as resolved", "UPDATE"), markResolved);

// Message routes
router.get('/conversations/:id/messages', logActivity("Chat", "Viewed conversation messages", "READ"), getMessages);
router.post('/conversations/:id/messages', logActivity("Chat", "Sent message", "CREATE"), sendMessage);

// Credit note creation from conversation
router.post('/conversations/:id/create-credit-note', logActivity("Chat", "Created credit note from conversation", "CREATE"), createCreditNoteFromConversation);

export default router;

