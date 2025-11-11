import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  createConversation,
  getConversations,
  getConversation,
  getMessages,
  sendMessage,
  getAIResponse,
  submitIssue,
  submitReturnRequest,
  markResolved,
  createCreditNoteFromConversation
} from '../controllers/chatController.js';
import { protect } from '../../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Configure multer for image uploads
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/chat-images');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `chat-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Conversation routes
router.post('/conversations', createConversation);
router.get('/conversations', getConversations);
router.get('/conversations/:id', getConversation);
router.patch('/conversations/:id/resolve', markResolved);

// Message routes
router.get('/conversations/:id/messages', getMessages);
router.post('/conversations/:id/messages', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      // Handle multer errors
      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          success: false,
          message: `File upload error: ${err.message}`
        });
      }
      // Handle other errors (file filter, etc.)
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload failed'
      });
    }
    next();
  });
}, sendMessage);

// AI and issue submission routes
router.post('/conversations/:id/ai-response', getAIResponse);
router.post('/conversations/:id/submit-issue', submitIssue);
router.post('/conversations/:id/submit-return', submitReturnRequest);
router.post('/conversations/:id/create-credit-note', createCreditNoteFromConversation);

export default router;

