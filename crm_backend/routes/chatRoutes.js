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

const router = express.Router();

// All routes are protected
router.use(protect);

// Conversation routes (for web interface)
router.get('/conversations', getConversations);
router.get('/conversations/:id', getConversation);
router.patch('/conversations/:id/resolve', markResolved);

// Message routes
router.get('/conversations/:id/messages', getMessages);
router.post('/conversations/:id/messages', sendMessage);

// Credit note creation from conversation
router.post('/conversations/:id/create-credit-note', createCreditNoteFromConversation);

export default router;

