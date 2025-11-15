import Claim from '../../models/Claim.js';
import ClaimType from '../../models/ClaimType.js';

// Create claim (Sales Executive)
export const createExpense = async (req, res) => {
  try {
    const { type, amount, person, description } = req.body;

    console.log('💰 Creating claim:', { type, amount, person });

    // Validate claim type exists
    const claimType = await ClaimType.findById(type);
    if (!claimType) {
      return res.status(404).json({
        success: false,
        message: 'Claim type not found'
      });
    }

    // Handle document upload
    let document = null;
    if (req.file) {
      // Save web-accessible path (e.g., /uploads/expenses/document-xxx.jpg)
      const webPath = `/uploads/expenses/${req.file.filename}`;
      document = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: webPath,
        mimetype: req.file.mimetype,
        size: req.file.size
      };
    }

    const claim = new Claim({
      type,
      amount: Number(amount),
      person,
      description,
      document,
      status: 'pending', // Sales Executive claims start as pending
      paymentStatus: 'unpaid',
      createdBy: req.user._id
    });

    await claim.save();

    // Populate type for response
    await claim.populate('type', 'name description maxAmount');

    console.log(`✅ Claim created: ${claim._id}`);

    res.status(201).json({
      success: true,
      message: 'Claim submitted successfully',
      claim
    });
  } catch (error) {
    console.error('Create claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create claim',
      error: error.message
    });
  }
};

// Get my claims (Sales Executive)
export const getMyExpenses = async (req, res) => {
  try {
    const { status, paymentStatus, startDate, endDate } = req.query;
    const createdBy = req.user._id;

    console.log('💰 Fetching my claims:', req.user.name);

    let query = { createdBy };
    
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const claims = await Claim.find(query)
      .populate('type', 'name description maxAmount')
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ Found ${claims.length} claims for ${req.user.name}`);

    res.json({
      success: true,
      claims
    });
  } catch (error) {
    console.error('Get my claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch claims',
      error: error.message
    });
  }
};

// Get claim details (Sales Executive)
export const getExpenseDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const createdBy = req.user._id;

    const claim = await Claim.findOne({ _id: id, createdBy })
      .populate('type', 'name description maxAmount')
      .populate('approvedBy', 'name')
      .lean();

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }

    res.json({
      success: true,
      claim
    });
  } catch (error) {
    console.error('Get claim details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch claim details',
      error: error.message
    });
  }
};

// Get claim types (Sales Executive)
export const getExpenseTypes = async (req, res) => {
  try {
    const claimTypes = await ClaimType.find({ isActive: true })
      .select('name description maxAmount')
      .sort({ name: 1 })
      .lean();

    console.log(`✅ Found ${claimTypes.length} active claim types`);

    res.json({
      success: true,
      claimTypes
    });
  } catch (error) {
    console.error('Get claim types error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch claim types',
      error: error.message
    });
  }
};

// Get claim statistics (Sales Executive)
export const getMyExpenseStats = async (req, res) => {
  try {
    const createdBy = req.user._id;

    const stats = await Claim.aggregate([
      { $match: { createdBy } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          approvedAmount: { $sum: '$approvedAmount' }
        }
      }
    ]);

    const paymentStats = await Claim.aggregate([
      { $match: { createdBy, status: 'approved' } },
      {
        $group: {
          _id: '$paymentStatus',
          count: { $sum: 1 },
          totalAmount: { $sum: '$approvedAmount' }
        }
      }
    ]);

    const monthlyStats = await Claim.aggregate([
      {
        $match: {
          createdBy,
          createdAt: {
            $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          approvedAmount: { $sum: '$approvedAmount' }
        }
      }
    ]);

    res.json({
      success: true,
      stats: {
        byStatus: stats,
        byPaymentStatus: paymentStats,
        thisMonth: monthlyStats[0] || { count: 0, totalAmount: 0, approvedAmount: 0 }
      }
    });
  } catch (error) {
    console.error('Get claim stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
};
