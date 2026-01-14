import express from 'express';
import {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getDefaultTemplate
} from '../controllers/invoicePrintTemplateController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Get all templates (user's own + global)
router.get('/', getTemplates);

// Get default template
router.get('/default', getDefaultTemplate);

// Get single template
router.get('/:id', getTemplate);

// Create new template
router.post('/', createTemplate);

// Update template
router.put('/:id', updateTemplate);

// Delete template
router.delete('/:id', deleteTemplate);

export default router;
