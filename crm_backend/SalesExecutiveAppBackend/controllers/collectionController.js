import { getModels } from '../utils/getModels.js';

// Create collection
export const createCollection = async (req, res) => {
  try {
    const user = req.user;
    const {
      dealerId,
      amount,
      paymentMode,
      chequeNumber,
      chequeDate,
      bankName,
      transactionId,
      referenceNumber,
      notes
    } = req.body;
    const { Dealer, Collection } = getModels(req);

    console.log('💰 Creating collection:', {
      dealerId,
      amount,
      paymentMode,
      salesExecutive: user.name
    });

    if (!dealerId || !amount || !paymentMode) {
      return res.status(400).json({
        success: false,
        message: 'Dealer, amount, and payment mode are required'
      });
    }

    const dealer = await Dealer.findById(dealerId).select('name code');
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    // Map referenceNumber to appropriate field based on payment mode
    const effectiveChequeNumber = chequeNumber || (paymentMode === 'Cheque' ? referenceNumber : null);
    const effectiveTransactionId = transactionId || (paymentMode !== 'Cash' && paymentMode !== 'Cheque' ? referenceNumber : null);

    if (paymentMode === 'Cheque' && !effectiveChequeNumber) {
      return res.status(400).json({
        success: false,
        message: 'Cheque number is required for cheque payments'
      });
    }

    const collection = new Collection({
      dealer: dealerId,
      dealerName: dealer.name,
      dealerCode: dealer.code,
      amount: parseFloat(amount),
      paymentMode,
      chequeNumber: effectiveChequeNumber,
      chequeDate,
      bankName,
      transactionId: effectiveTransactionId,
      receiptImage: req.file ? `/uploads/receipts/${req.file.filename}` : null,
      notes,
      cashSplitRequired: req.body.cashSplitRequired === 'true' || req.body.cashSplitRequired === true,
      collectedBy: user._id,
      collectedByName: user.name,
      status: 'Pending'
    });

    await collection.save();

    console.log(`✅ Collection created: ${collection.collectionNumber}`);

    res.status(201).json({
      success: true,
      message: 'Collection recorded successfully',
      collection: {
        _id: collection._id,
        collectionNumber: collection.collectionNumber,
        amount: collection.amount,
        status: collection.status
      }
    });
  } catch (error) {
    console.error('Create collection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record collection',
      error: error.message
    });
  }
};

// Get my collections
export const getMyCollections = async (req, res) => {
  try {
    const user = req.user;
    const { status, page = 1, limit = 20 } = req.query;
    const { Collection } = getModels(req);

    console.log('📋 Fetching collections for:', user.name);

    let query = { collectedBy: user._id };
    
    if (status && status !== 'all') {
      query.status = status;
    }

    const skip = (page - 1) * limit;
    const collections = await Collection.find(query)
      .populate('dealer', 'name code')
      .select('collectionNumber dealer dealerName amount paymentMode bankName collectionDate status receiptImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

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
    console.error('Get collections error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch collections',
      error: error.message
    });
  }
};

// Get collection by ID
export const getCollectionById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const { Collection } = getModels(req);

    console.log('📄 Fetching collection details:', id);

    const collection = await Collection.findById(id)
      .populate('dealer', 'name code contactPerson phone email')
      .populate('collectedBy', 'name')
      .populate('approvedBy', 'name')
      .lean();

    if (!collection) {
      return res.status(404).json({
        success: false,
        message: 'Collection not found'
      });
    }

    if (collection.collectedBy._id.toString() !== user._id.toString() && user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this collection'
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
