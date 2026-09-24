import { getCompanyConnection } from '../config/multiDatabase.js';
import { serviceChargeMasterSchema } from '../models/ServiceChargeMaster.js';
import { accountMasterSchema } from '../models/AccountMaster.js';

const getModels = (dbConnection) => ({
  ServiceChargeMaster: dbConnection.models.ServiceChargeMaster || dbConnection.model('ServiceChargeMaster', serviceChargeMasterSchema),
  AccountMaster: dbConnection.models.AccountMaster || dbConnection.model('AccountMaster', accountMasterSchema)
});

// @desc    Get all service charges
// @route   GET /api/service-charges
// @access  Private
export const getAllServiceCharges = async (req, res) => {
  try {
    const { ServiceChargeMaster } = getModels(req.dbConnection);
    
    const { activeOnly } = req.query;
    
    const filter = activeOnly === 'true' ? { isActive: true } : {};
    
    const charges = await ServiceChargeMaster.find(filter)
      .populate('accountId', 'accountName accountGroup')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name')
      .sort({ chargeName: 1 });
    
    res.json({
      success: true,
      data: charges,
      count: charges.length
    });
  } catch (error) {
    console.error('❌ Error fetching service charges:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single service charge
// @route   GET /api/service-charges/:id
// @access  Private
export const getServiceChargeById = async (req, res) => {
  try {
    const { ServiceChargeMaster } = getModels(req.dbConnection);
    
    const charge = await ServiceChargeMaster.findById(req.params.id)
      .populate('accountId', 'accountName accountGroup')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');
    
    if (!charge) {
      return res.status(404).json({
        success: false,
        message: 'Service charge not found'
      });
    }
    
    res.json({
      success: true,
      data: charge
    });
  } catch (error) {
    console.error('❌ Error fetching service charge:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create service charge
// @route   POST /api/service-charges
// @access  Private
export const createServiceCharge = async (req, res) => {
  try {
    const { ServiceChargeMaster, AccountMaster } = getModels(req.dbConnection);
    
    const { chargeName, description, sacCode, taxApplicable, taxRate, accountId } = req.body;
    
    // Validation
    if (!chargeName || chargeName.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Charge name is required'
      });
    }
    
    if (taxApplicable && (!taxRate || taxRate <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Tax rate must be greater than 0 when tax is applicable'
      });
    }
    
    // Check for duplicate name
    const existing = await ServiceChargeMaster.findOne({
      chargeName: new RegExp(`^${chargeName.trim()}$`, 'i')
    });
    
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Service charge with this name already exists'
      });
    }
    
    // Get account name if accountId provided
    let accountName = '';
    if (accountId) {
      const account = await AccountMaster.findById(accountId);
      if (account) {
        accountName = account.accountName;
      }
    }
    
    const charge = new ServiceChargeMaster({
      chargeName: chargeName.trim(),
      description: description || '',
      sacCode: sacCode || '',
      taxApplicable: taxApplicable === true,
      taxRate: taxApplicable ? (parseFloat(taxRate) || 0) : 0,
      accountId: accountId || null,
      accountName,
      createdBy: req.user._id
    });
    
    await charge.save();
    
    // Populate before sending response
    await charge.populate('accountId', 'accountName accountGroup');
    await charge.populate('createdBy', 'name');
    
    res.status(201).json({
      success: true,
      message: 'Service charge created successfully',
      data: charge
    });
  } catch (error) {
    console.error('❌ Error creating service charge:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update service charge
// @route   PUT /api/service-charges/:id
// @access  Private
export const updateServiceCharge = async (req, res) => {
  try {
    const { ServiceChargeMaster, AccountMaster } = getModels(req.dbConnection);
    
    const charge = await ServiceChargeMaster.findById(req.params.id);
    
    if (!charge) {
      return res.status(404).json({
        success: false,
        message: 'Service charge not found'
      });
    }
    
    const { chargeName, description, sacCode, taxApplicable, taxRate, accountId, isActive } = req.body;
    
    // Validation
    if (chargeName && chargeName.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Charge name cannot be empty'
      });
    }
    
    if (taxApplicable && (!taxRate || taxRate <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Tax rate must be greater than 0 when tax is applicable'
      });
    }
    
    // Check for duplicate name (excluding current record)
    if (chargeName && chargeName.trim() !== charge.chargeName) {
      const existing = await ServiceChargeMaster.findOne({
        _id: { $ne: req.params.id },
        chargeName: new RegExp(`^${chargeName.trim()}$`, 'i')
      });
      
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Service charge with this name already exists'
        });
      }
    }
    
    // Get account name if accountId provided
    if (accountId && accountId !== charge.accountId?.toString()) {
      const account = await AccountMaster.findById(accountId);
      if (account) {
        charge.accountName = account.accountName;
      }
    }
    
    // Update fields
    if (chargeName !== undefined) charge.chargeName = chargeName.trim();
    if (description !== undefined) charge.description = description;
    if (sacCode !== undefined) charge.sacCode = sacCode;
    if (taxApplicable !== undefined) charge.taxApplicable = taxApplicable;
    if (taxRate !== undefined) charge.taxRate = taxApplicable ? parseFloat(taxRate) : 0;
    if (accountId !== undefined) charge.accountId = accountId || null;
    if (isActive !== undefined) charge.isActive = isActive;
    charge.updatedBy = req.user._id;
    
    await charge.save();
    
    // Populate before sending response
    await charge.populate('accountId', 'accountName accountGroup');
    await charge.populate('updatedBy', 'name');
    
    res.json({
      success: true,
      message: 'Service charge updated successfully',
      data: charge
    });
  } catch (error) {
    console.error('❌ Error updating service charge:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete (deactivate) service charge
// @route   DELETE /api/service-charges/:id
// @access  Private
export const deleteServiceCharge = async (req, res) => {
  try {
    const { ServiceChargeMaster } = getModels(req.dbConnection);
    
    const charge = await ServiceChargeMaster.findById(req.params.id);
    
    if (!charge) {
      return res.status(404).json({
        success: false,
        message: 'Service charge not found'
      });
    }
    
    // Check if used in any invoices (optional - for now just deactivate)
    // TODO: Add check for usage in DealerInvoice/SupplierInvoice if needed
    
    // Deactivate instead of delete
    charge.isActive = false;
    charge.updatedBy = req.user._id;
    await charge.save();
    
    res.json({
      success: true,
      message: 'Service charge deactivated successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting service charge:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Toggle service charge active status
// @route   PATCH /api/service-charges/:id/toggle-status
// @access  Private
export const toggleServiceChargeStatus = async (req, res) => {
  try {
    const { ServiceChargeMaster } = getModels(req.dbConnection);
    
    const charge = await ServiceChargeMaster.findById(req.params.id);
    
    if (!charge) {
      return res.status(404).json({
        success: false,
        message: 'Service charge not found'
      });
    }
    
    charge.isActive = !charge.isActive;
    charge.updatedBy = req.user._id;
    await charge.save();
    
    res.json({
      success: true,
      message: `Service charge ${charge.isActive ? 'activated' : 'deactivated'} successfully`,
      data: charge
    });
  } catch (error) {
    console.error('❌ Error toggling service charge status:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
