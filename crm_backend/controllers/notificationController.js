import { notificationSchema } from '../models/Notification.js';
import { dealerSchema } from '../models/Dealer.js';
import { protect } from '../middleware/authMiddleware.js';

// Helper function to get models for the current company database
const getModels = (dbConnection) => {
  return {
    Notification: dbConnection.models.Notification || 
                  dbConnection.model('Notification', notificationSchema),
    Dealer: dbConnection.models.Dealer || 
            dbConnection.model('Dealer', dealerSchema)
  };
};

// @desc    Create notification for a dealer
// @route   POST /api/notifications
// @access  Private (Admin/Staff)
export const createNotification = async (req, res) => {
  try {
    const { Notification, Dealer } = getModels(req.dbConnection);
    const { dealer, dealerId, type, title, message, orderId, orderNumber, status, priority, metadata, data } = req.body;

    // Use dealerId if provided, otherwise use dealer
    const targetDealerId = dealerId || dealer;
    
    if (!targetDealerId) {
      return res.status(400).json({
        success: false,
        message: 'Dealer ID is required'
      });
    }

    // Validate dealer exists
    const dealerExists = await Dealer.findById(targetDealerId);
    if (!dealerExists) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    // Map invoice_created type to system type (since it's not in enum)
    const notificationType = type === 'invoice_created' ? 'system' : (type || 'system');

    // Create notification
    const notification = await Notification.create({
      dealer: targetDealerId,
      type: notificationType,
      title: title || 'Notification',
      message: message || '',
      orderId: orderId || null,
      orderNumber: orderNumber || null,
      status: status || null,
      priority: priority || 'medium',
      metadata: {
        ...metadata,
        ...(data || {}), // Include data object in metadata
        originalType: type // Store original type in metadata
      }
    });

    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      notification
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating notification',
      error: error.message
    });
  }
};

// @desc    Create notification for a specific dealer (convenience endpoint)
// @route   POST /api/notifications/dealer/:dealerId
// @access  Private (Admin/Staff)
export const createDealerNotification = async (req, res) => {
  try {
    const { Notification, Dealer } = getModels(req.dbConnection);
    const { dealerId } = req.params;
    const { type, title, message, orderId, orderNumber, status, priority, metadata, data } = req.body;

    // Validate dealer exists
    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    // Map invoice_created type to system type (since it's not in enum)
    const notificationType = type === 'invoice_created' ? 'system' : (type || 'system');

    // Create notification
    const notification = await Notification.create({
      dealer: dealerId,
      type: notificationType,
      title: title || 'Notification',
      message: message || '',
      orderId: orderId || null,
      orderNumber: orderNumber || null,
      status: status || null,
      priority: priority || 'medium',
      metadata: {
        ...metadata,
        ...(data || {}), // Include data object in metadata
        originalType: type // Store original type in metadata
      }
    });

    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      notification
    });
  } catch (error) {
    console.error('Error creating dealer notification:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating notification',
      error: error.message
    });
  }
};


