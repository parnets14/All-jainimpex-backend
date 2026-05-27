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
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Get all templates (user's own + global)
router.get('/', logActivity("Invoice Print Template", "Viewed templates list", "READ"), getTemplates);

// Get default template
router.get('/default', logActivity("Invoice Print Template", "Viewed default template", "READ"), getDefaultTemplate);

// Get single template
router.get('/:id', logActivity("Invoice Print Template", "Viewed template details", "READ"), getTemplate);

// Create new template
router.post('/', logActivity("Invoice Print Template", "Created new template", "CREATE"), createTemplate);

// Update template
router.put('/:id', logActivity("Invoice Print Template", "Updated template", "UPDATE"), updateTemplate);

// Delete template
router.delete('/:id', logActivity("Invoice Print Template", "Deleted template", "DELETE"), deleteTemplate);

export default router;
