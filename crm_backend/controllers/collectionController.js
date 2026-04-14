import { collectionSchema } from '../SalesExecutiveAppBackend/models/Collection.js';
import { dealerSchema } from '../models/Dealer.js';
import { userSchema } from '../models/User.js';

const getModels = (dbConnection) => {
  return {
    Collection: dbConnection.models.Collection || dbConnection.model('Collection', collectionSchema),
    Dealer: dbConnection.models.Dealer || dbConnection.model('Dealer', dealerSchema),
    User: dbConnection.models.User || dbConnection.model('User', userSchema)
  };
};

// Get all collections (Admin)
export const getAllCollections = async (req, res) => {
  try {
    const { Collection } = getModels(req.dbConnection);
    const {
      status,
      salesExecutive,
      dealer,
      paymentMode,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    console.log('📋 Fetching all collections (Admin)');

    // Build query
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (salesExecutive) {
      query.collectedBy = salesExecutive;
    }
    
    if (dealer) {
      query.dealer = dealer;
    }
    
    if (paymentMode) {
      query.paymentMode = paymentMode;
    }
    
    if (startDate || endDate) {
      query.collectionDate = {};
      if (startDate) {
        query.collectionDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.collectionDate.$lte = new Date(endDate);
      }
    }

    // Fetch collections with pagination
    const skip = (page - 1) * limit;
    const collections = await Collection.find(query)
      .populate('dealer', 'name code')
      .populate('collectedBy', 'name')
      .populate('approvedBy', 'name')
      .populate('rejectedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count
    const total = await Collection.countDocuments(query);

    console.log(`✅ Found ${collections.length} collections`);

    res.json({
      success: true,
      collections,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get all collections error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch collections',
      error: error.message
    });
  }
};

// Get collection by ID (Admin)
export const getCollectionByIdAdmin = async (req, res) => {
  try {
    const { Collection } = getModels(req.dbConnection);
    const { id } = req.params;

    console.log('📄 Fetching collection details (Admin):', id);

    const collection = await Collection.findById(id)
      .populate('dealer', 'name code contactPerson phone email')
      .populate('collectedBy', 'name email phone')
      .populate('approvedBy', 'name')
      .populate('rejectedBy', 'name')
      .lean();

    if (!collection) {
      return res.status(404).json({
        success: false,
        message: 'Collection not found'
      });
    }

    console.log(`✅ Collection found: ${collection.collectionNumber}`);

    res.json({
      success: true,
      collection
    });
  } catch (error) {
    console.error('Get collection by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch collection details',
      error: error.message
    });
  }
};

// Approve collection (Admin)
export const approveCollection = async (req, res) => {
  try {
    const { Collection } = getModels(req.dbConnection);
    const { id } = req.params;
    const user = req.user;

    console.log('✅ Approving collection:', id, 'by', user.name);

    const collection = await Collection.findById(id);

    if (!collection) {
      return res.status(404).json({
        success: false,
        message: 'Collection not found'
      });
    }

    if (collection.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Collection is already ${collection.status.toLowerCase()}`
      });
    }

    collection.status = 'Approved';
    collection.approvedBy = user._id;
    collection.approvedAt = new Date();

    await collection.save();

    console.log(`✅ Collection approved: ${collection.collectionNumber}`);

    res.json({
      success: true,
      message: 'Collection approved successfully',
      collection: {
        _id: collection._id,
        collectionNumber: collection.collectionNumber,
        status: collection.status
      }
    });
  } catch (error) {
    console.error('Approve collection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve collection',
      error: error.message
    });
  }
};

// Reject collection (Admin)
export const rejectCollection = async (req, res) => {
  try {
    const { Collection } = getModels(req.dbConnection);
    const { id } = req.params;
    const { reason } = req.body;
    const user = req.user;

    console.log('❌ Rejecting collection:', id, 'by', user.name);

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const collection = await Collection.findById(id);

    if (!collection) {
      return res.status(404).json({
        success: false,
        message: 'Collection not found'
      });
    }

    if (collection.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Collection is already ${collection.status.toLowerCase()}`
      });
    }

    collection.status = 'Rejected';
    collection.rejectedBy = user._id;
    collection.rejectedAt = new Date();
    collection.rejectionReason = reason;

    await collection.save();

    console.log(`❌ Collection rejected: ${collection.collectionNumber}`);

    res.json({
      success: true,
      message: 'Collection rejected successfully',
      collection: {
        _id: collection._id,
        collectionNumber: collection.collectionNumber,
        status: collection.status
      }
    });
  } catch (error) {
    console.error('Reject collection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject collection',
      error: error.message
    });
  }
};

// Get collection statistics (Admin)
export const getCollectionStats = async (req, res) => {
  try {
    const { Collection } = getModels(req.dbConnection);
    const { startDate, endDate } = req.query;

    console.log('📊 Fetching collection statistics');

    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.collectionDate = {};
      if (startDate) dateFilter.collectionDate.$gte = new Date(startDate);
      if (endDate) dateFilter.collectionDate.$lte = new Date(endDate);
    }

    const stats = await Collection.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const formattedStats = {
      total: 0,
      totalAmount: 0,
      pending: { count: 0, amount: 0 },
      approved: { count: 0, amount: 0 },
      rejected: { count: 0, amount: 0 }
    };

    stats.forEach(stat => {
      formattedStats.total += stat.count;
      formattedStats.totalAmount += stat.totalAmount;
      
      const status = stat._id.toLowerCase();
      formattedStats[status] = {
        count: stat.count,
        amount: stat.totalAmount
      };
    });

    console.log('✅ Collection stats calculated');

    res.json({
      success: true,
      stats: formattedStats
    });
  } catch (error) {
    console.error('Get collection stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch collection statistics',
      error: error.message
    });
  }
};
