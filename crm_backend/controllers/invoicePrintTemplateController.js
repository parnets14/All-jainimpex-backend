import { invoicePrintTemplateSchema } from '../models/InvoicePrintTemplate.js';

// Helper function to get models for the current company database
const getModels = (dbConnection) => {
  return {
    InvoicePrintTemplate: dbConnection.models.InvoicePrintTemplate || 
                          dbConnection.model('InvoicePrintTemplate', invoicePrintTemplateSchema)
  };
};

// Get all templates (user's own + global)
export const getTemplates = async (req, res) => {
  try {
    const { InvoicePrintTemplate } = getModels(req.dbConnection);
    const userId = req.user._id;
    
    const templates = await InvoicePrintTemplate.find({
      $or: [
        { createdBy: userId },
        { isGlobal: true }
      ]
    })
    .populate('createdBy', 'name email')
    .sort({ isDefault: -1, createdAt: -1 });
    
    res.status(200).json({
      success: true,
      templates
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch templates',
      error: error.message
    });
  }
};

// Get single template
export const getTemplate = async (req, res) => {
  try {
    const { InvoicePrintTemplate } = getModels(req.dbConnection);
    const { id } = req.params;
    const userId = req.user._id;
    
    const template = await InvoicePrintTemplate.findOne({
      _id: id,
      $or: [
        { createdBy: userId },
        { isGlobal: true }
      ]
    }).populate('createdBy', 'name email');
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }
    
    res.status(200).json({
      success: true,
      template
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch template',
      error: error.message
    });
  }
};

// Create new template
export const createTemplate = async (req, res) => {
  try {
    const { InvoicePrintTemplate } = getModels(req.dbConnection);
    const { name, description, settings, isDefault } = req.body;
    const userId = req.user._id;
    
    // If setting as default, unset other defaults for this user
    if (isDefault) {
      await InvoicePrintTemplate.updateMany(
        { createdBy: userId, isDefault: true },
        { isDefault: false }
      );
    }
    
    const template = new InvoicePrintTemplate({
      name,
      description,
      settings,
      isDefault: isDefault || false,
      isGlobal: false, // Only super admin can create global templates
      createdBy: userId
    });
    
    await template.save();
    await template.populate('createdBy', 'name email');
    
    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      template
    });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create template',
      error: error.message
    });
  }
};

// Update template
export const updateTemplate = async (req, res) => {
  try {
    const { InvoicePrintTemplate } = getModels(req.dbConnection);
    const { id } = req.params;
    const { name, description, settings, isDefault } = req.body;
    const userId = req.user._id;
    
    const template = await InvoicePrintTemplate.findOne({
      _id: id,
      createdBy: userId
    });
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found or you do not have permission to edit it'
      });
    }
    
    // If setting as default, unset other defaults for this user
    if (isDefault && !template.isDefault) {
      await InvoicePrintTemplate.updateMany(
        { createdBy: userId, isDefault: true, _id: { $ne: id } },
        { isDefault: false }
      );
    }
    
    template.name = name || template.name;
    template.description = description !== undefined ? description : template.description;
    template.settings = settings || template.settings;
    template.isDefault = isDefault !== undefined ? isDefault : template.isDefault;
    
    await template.save();
    await template.populate('createdBy', 'name email');
    
    res.status(200).json({
      success: true,
      message: 'Template updated successfully',
      template
    });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update template',
      error: error.message
    });
  }
};

// Delete template
export const deleteTemplate = async (req, res) => {
  try {
    const { InvoicePrintTemplate } = getModels(req.dbConnection);
    const { id } = req.params;
    const userId = req.user._id;
    
    const template = await InvoicePrintTemplate.findOne({
      _id: id,
      createdBy: userId
    });
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found or you do not have permission to delete it'
      });
    }
    
    await template.deleteOne();
    
    res.status(200).json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete template',
      error: error.message
    });
  }
};

// Get default template for user
export const getDefaultTemplate = async (req, res) => {
  try {
    const { InvoicePrintTemplate } = getModels(req.dbConnection);
    const userId = req.user._id;
    
    // First try to find user's default template
    let template = await InvoicePrintTemplate.findOne({
      createdBy: userId,
      isDefault: true
    }).populate('createdBy', 'name email');
    
    // If no user default, try global default
    if (!template) {
      template = await InvoicePrintTemplate.findOne({
        isGlobal: true,
        isDefault: true
      }).populate('createdBy', 'name email');
    }
    
    // If still no template, return default settings
    if (!template) {
      return res.status(200).json({
        success: true,
        template: null,
        defaultSettings: {
          showSerialNumber: true,
          showProductCode: true,
          showProductName: true,
          showDescription: false,
          showHSNCode: true,
          showCategory: false,
          showSubcategory: false,
          showBrand: false,
          showUnit: true,
          showAlternateUnit: false,
          showQuantity: true,
          showRate: true,
          showAmount: true,
          showDiscount: true,
          showGST: true,
          showTotal: true,
          showProductType: false,
          showSalesType: false,
          showCompanyLogo: true,
          showCompanyDetails: true,
          showInvoiceNumber: true,
          showInvoiceDate: true,
          showDueDate: true,
          showCustomerInfo: true,
          showCustomerGST: true,
          showBankDetails: true,
          showTermsAndConditions: true,
          showSignature: true,
          showPointsEarned: true,
          showSchemes: true,
          fontSize: 'medium',
          orientation: 'portrait',
          showProductImages: false,
          compactMode: false
        }
      });
    }
    
    res.status(200).json({
      success: true,
      template
    });
  } catch (error) {
    console.error('Error fetching default template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch default template',
      error: error.message
    });
  }
};

export default {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getDefaultTemplate
};
