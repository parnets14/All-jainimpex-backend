import { chatConversationSchema } from '../../models/ChatConversation.js';
import { chatMessageSchema }     from '../../models/ChatMessage.js';
import { dealerSchema }          from '../../models/Dealer.js';
import { userSchema }            from '../../models/User.js';
import { salesOrderSchema }      from '../../models/SalesOrder.js';
import { dealerInvoiceSchema }   from '../../models/DealerInvoice.js';
import { notificationSchema }    from '../../models/Notification.js';
import { creditNoteSchema }      from '../../models/CreditNote.js';
import { productSchema }         from '../../models/Product.js';

const getModels = (db) => ({
  ChatConversation: db.models.ChatConversation || db.model('ChatConversation', chatConversationSchema),
  ChatMessage:      db.models.ChatMessage      || db.model('ChatMessage',      chatMessageSchema),
  Dealer:           db.models.Dealer           || db.model('Dealer',           dealerSchema),
  User:             db.models.User             || db.model('User',             userSchema),
  SalesOrder:       db.models.SalesOrder       || db.model('SalesOrder',       salesOrderSchema),
  DealerInvoice:    db.models.DealerInvoice    || db.model('DealerInvoice',    dealerInvoiceSchema),
  Notification:     db.models.Notification     || db.model('Notification',     notificationSchema),
  CreditNote:       db.models.CreditNote       || db.model('CreditNote',       creditNoteSchema),
  Product:          db.models.Product          || db.model('Product',          productSchema),
});

// @desc    Create a new chat conversation
// @route   POST /api/app/support/chat/conversations
// @access  Protected (Dealer)
export const createConversation = async (req, res) => {
  try {
    const { ChatConversation, Dealer } = getModels(req.dbConnection);
    const { type = 'general' } = req.body;
    
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    // Check if there's already an active conversation of this type
    // Only allow one active conversation per type at a time
    const existingActive = await ChatConversation.findOne({
      dealer: dealer._id,
      type: type,
      status: { $in: ['pending', 'in_progress'] }
    }).sort({ createdAt: -1 });

    if (existingActive) {
      // Return existing conversation instead of creating new one
      // This ensures only one active conversation per type
      return res.json({
        success: true,
        conversation: existingActive,
        message: 'Using existing active conversation',
        isExisting: true
      });
    }

    // Create new conversation only if no active one exists
    const conversation = await ChatConversation.create({
      dealer: dealer._id,
      dealerName: dealer.name,
      dealerCode: dealer.code,
      type,
      status: 'pending'
    });

    res.status(201).json({
      success: true,
      conversation,
      isExisting: false
    });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating conversation'
    });
  }
};

// @desc    Get chat conversations
// @route   GET /api/app/support/chat/conversations
// @access  Protected
export const getConversations = async (req, res) => {
  try {
    const { ChatConversation, Dealer } = getModels(req.dbConnection);
    const { status, type, limit = 50, page = 1 } = req.query;
    const query = {};

    // If dealer, only show their conversations
    if (req.user.role === 'dealer') {
      const dealer = await Dealer.findOne({ code: req.user.username });
      if (dealer) {
        query.dealer = dealer._id;
      }
    }

    if (status) {
      query.status = status;
    }
    if (type) {
      query.type = type;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const conversations = await ChatConversation.find(query)
      .populate('dealer', 'name code')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await ChatConversation.countDocuments(query);

    res.json({
      success: true,
      conversations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching conversations'
    });
  }
};

// @desc    Get a single conversation
// @route   GET /api/app/support/chat/conversations/:id
// @access  Protected
export const getConversation = async (req, res) => {
  try {
    const { ChatConversation, Dealer } = getModels(req.dbConnection);
    const { id } = req.params;
    const query = { _id: id };

    // If dealer, only allow access to their conversations
    if (req.user.role === 'dealer') {
      const dealer = await Dealer.findOne({ code: req.user.username });
      if (dealer) {
        query.dealer = dealer._id;
      }
    }

    const conversation = await ChatConversation.findOne(query)
      .populate('dealer', 'name code email phone address')
      .populate('resolvedBy', 'name email')
      .populate('creditNote');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching conversation'
    });
  }
};

// @desc    Get messages for a conversation
// @route   GET /api/app/support/chat/conversations/:id/messages
// @access  Protected
export const getMessages = async (req, res) => {
  try {
    const { ChatConversation, ChatMessage, Dealer } = getModels(req.dbConnection);
    const { id } = req.params;

    // Verify conversation access
    const conversation = await ChatConversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if dealer can access this conversation
    if (req.user.role === 'dealer') {
      const dealer = await Dealer.findOne({ code: req.user.username });
      if (!dealer || conversation.dealer.toString() !== dealer._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    const messages = await ChatMessage.find({ conversation: id })
      .populate('sender', 'name email')
      .sort({ createdAt: 1 });

    res.json({
      success: true,
      messages
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching messages'
    });
  }
};

// @desc    Send a message
// @route   POST /api/app/support/chat/conversations/:id/messages
// @access  Protected
export const sendMessage = async (req, res) => {
  try {
    const { ChatConversation, ChatMessage, Dealer, Notification } = getModels(req.dbConnection);
    const { id } = req.params;
    
    // Handle both JSON and multipart/form-data requests
    // When using multer, req.body contains form fields (as strings for multipart)
    // When using JSON, req.body contains the parsed JSON object
    let message, type, imageUrl, isAI;
    
    // Ensure req.body exists (should be populated by body parser or multer)
    const body = req.body || {};
    
    if (req.file) {
      // Multipart/form-data request (with image)
      // Multer populates req.body with form fields (all as strings)
      message = body.message || '';
      type = body.type || 'image';
      isAI = body.isAI === 'true' || body.isAI === true;
      
      // Construct image URL from uploaded file
      // Use relative path since server serves /uploads statically
      imageUrl = `/uploads/chat-images/${req.file.filename}`;
    } else {
      // Regular JSON request
      message = body.message || '';
      type = body.type || 'text';
      imageUrl = body.imageUrl || body.image || null;
      isAI = body.isAI || false;
    }

    if (!message && !imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Message content or image is required'
      });
    }

    // Verify conversation access
    const conversation = await ChatConversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if dealer can access this conversation (skip for AI/system messages)
    const isDealer = req.user.role === 'dealer' && !isAI;
    if (isDealer) {
      const dealer = await Dealer.findOne({ code: req.user.username });
      if (!dealer || conversation.dealer.toString() !== dealer._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    // Create message
    const chatMessage = await ChatMessage.create({
      conversation: id,
      message: message || '',
      type: imageUrl ? 'image' : type,
      image: imageUrl,
      imageUrl: imageUrl,
      isDealer: isDealer && !isAI,
      isAI: isAI,
      sender: (isDealer && !isAI) ? undefined : (req.user ? req.user._id : undefined),
      senderName: (isDealer && !isAI) ? undefined : (req.user ? req.user.name : 'AI Assistant')
    });

    // Update conversation
    conversation.lastMessage = message || (imageUrl ? 'Image' : '');
    conversation.lastMessageAt = new Date();
    conversation.messageCount = (conversation.messageCount || 0) + 1;
    if (conversation.status === 'pending') {
      conversation.status = 'in_progress';
    }
    if (imageUrl) {
      conversation.collectedInfo = conversation.collectedInfo || {};
      conversation.collectedInfo.hasImage = true;
    }
    await conversation.save();

    // Send notification to dealer if message is from web/admin (not from dealer and not AI)
    if (!isDealer && !isAI && req.user && req.user.role !== 'dealer') {
      try {
        await Notification.create({
          dealer: conversation.dealer,
          type: 'system',
          title: 'New Reply from Support',
          message: message ? (message.length > 100 ? message.substring(0, 100) + '...' : message) : 'You received a new message from support team',
          priority: 'high',
          metadata: {
            conversationId: conversation._id.toString(),
            messageId: chatMessage._id.toString(),
            senderName: req.user.name || 'Support Team'
          }
        });
      } catch (notifError) {
        console.error('Error creating notification:', notifError);
        // Don't fail the request if notification fails
      }
    }

    res.status(201).json({
      success: true,
      message: chatMessage
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error sending message'
    });
  }
};

// @desc    Get AI response (placeholder - integrate with AI service)
// @route   POST /api/app/support/chat/conversations/:id/ai-response
// @access  Protected (Dealer)
export const getAIResponse = async (req, res) => {
  try {
    const { ChatConversation, ChatMessage, Dealer, SalesOrder, DealerInvoice } = getModels(req.dbConnection);
    const { id } = req.params;
    const { message, context = {} } = req.body;

    // Verify conversation
    const conversation = await ChatConversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if dealer can access this conversation
    if (req.user.role === 'dealer') {
      const dealer = await Dealer.findOne({ code: req.user.username });
      if (!dealer || conversation.dealer.toString() !== dealer._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    // Get recent conversation history for context
    const recentMessages = await ChatMessage.find({ conversation: id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Get dealer ID for order/invoice lookup
    const dealer = await Dealer.findOne({ code: req.user.username });
    const dealerId = dealer?._id;

    // Pass db models to AI response generator so it uses the correct company DB
    const aiMessage = await generateAIResponse(message, conversation, context, recentMessages, dealerId, { SalesOrder, DealerInvoice });

    // Save AI message
    const chatMessage = await ChatMessage.create({
      conversation: id,
      message: aiMessage.text,
      type: 'text',
      isDealer: false,
      isAI: true,
      aiResponse: aiMessage.metadata
    });

    // Update conversation last message
    conversation.lastMessage = aiMessage.text;
    conversation.lastMessageAt = new Date();
    conversation.messageCount = (conversation.messageCount || 0) + 1;
    await conversation.save();

    // Update conversation with extracted info
    if (aiMessage.metadata?.extractedInfo) {
      conversation.collectedInfo = {
        ...conversation.collectedInfo,
        ...aiMessage.metadata.extractedInfo
      };
      await conversation.save();
    }

    res.json({
      success: true,
      message: aiMessage.text,
      needsImage: aiMessage.metadata?.needsImage || false,
      readyToSubmit: aiMessage.metadata?.readyToSubmit || false,
      extractedInfo: aiMessage.metadata?.extractedInfo || {},
      needsOrderNumber: aiMessage.metadata?.needsOrderNumber || false,
      needsProductSelection: aiMessage.metadata?.needsProductSelection || false,
      products: aiMessage.metadata?.products || [],
      needsLiveChat: aiMessage.metadata?.needsLiveChat || false,
      needsOrderSelection: aiMessage.metadata?.needsOrderSelection || false,
      recentOrders: aiMessage.metadata?.recentOrders || [],
      needsInvoiceSelection: aiMessage.metadata?.needsInvoiceSelection || false,
      recentInvoices: aiMessage.metadata?.recentInvoices || [],
    });
  } catch (error) {
    console.error('Error getting AI response:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting AI response'
    });
  }
};

// Helper function to lookup order by order number
async function lookupOrder(orderNumber, dealerId, SalesOrderModel) {
  const SalesOrder = SalesOrderModel;
  if (!SalesOrder) return null;
  try {
    if (!orderNumber || !dealerId) {
      console.error('Missing orderNumber or dealerId for lookup');
      return null;
    }

    const trimmedOrderNumber = orderNumber.trim().toUpperCase();
    console.log(`🔍 Looking up order: "${trimmedOrderNumber}" for dealer: ${dealerId}`);

    // Try exact match first
    let order = await SalesOrder.findOne({
      orderNumber: trimmedOrderNumber,
      dealer: dealerId
    })
    .populate('products.product', 'itemName productCode')
    .lean();

    if (order) {
      console.log(`✅ Found order with exact match: ${order.orderNumber}`);
      return order;
    }

    // Try case-insensitive match
    order = await SalesOrder.findOne({
      $expr: {
        $eq: [
          { $toUpper: { $trim: { input: "$orderNumber" } } },
          trimmedOrderNumber
        ]
      },
      dealer: dealerId
    })
    .populate('products.product', 'itemName productCode')
    .lean();

    if (order) {
      console.log(`✅ Found order with case-insensitive match: ${order.orderNumber}`);
      return order;
    }

    // Try regex match (more flexible)
    order = await SalesOrder.findOne({
      orderNumber: { $regex: new RegExp(`^${trimmedOrderNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      dealer: dealerId
    })
    .populate('products.product', 'itemName productCode')
    .lean();

    if (order) {
      console.log(`✅ Found order with regex match: ${order.orderNumber}`);
      return order;
    }

    // Try partial match (in case user entered without dashes or with different format)
    const normalizedInput = trimmedOrderNumber.replace(/[-\s]/g, '');
    const allOrders = await SalesOrder.find({ dealer: dealerId })
      .populate('products.product', 'itemName productCode')
      .lean();

    const matchingOrder = allOrders.find(o => {
      const normalizedOrderNumber = o.orderNumber.replace(/[-\s]/g, '').toUpperCase();
      return normalizedOrderNumber === normalizedInput || 
             normalizedOrderNumber.includes(normalizedInput) ||
             normalizedInput.includes(normalizedOrderNumber);
    });

    if (matchingOrder) {
      console.log(`✅ Found order with partial match: ${matchingOrder.orderNumber}`);
      return matchingOrder;
    }

    console.log(`❌ Order not found: "${trimmedOrderNumber}"`);
    return null;
  } catch (error) {
    console.error('Error looking up order:', error);
    return null;
  }
}

// Helper function to lookup invoice by invoice number
async function lookupInvoice(invoiceNumber, dealerId, DealerInvoiceModel) {
  const DealerInvoice = DealerInvoiceModel;
  if (!DealerInvoice) return null;
  try {
    const invoice = await DealerInvoice.findOne({
      invoiceNumber: invoiceNumber.trim(),
      dealer: dealerId
    })
    .populate('items.product', 'itemName productCode')
    .populate('salesOrder')
    .lean();
    
    return invoice;
  } catch (error) {
    console.error('Error looking up invoice:', error);
    return null;
  }
}

// Helper function to check for billing errors
function checkBillingErrors(invoice, order) {
  const errors = [];
  
  if (!invoice) {
    errors.push('Invoice not found');
    return errors;
  }
  
  if (!order) {
    errors.push('Related order not found');
    return errors;
  }
  
  // Check if invoice total matches order total
  if (Math.abs(invoice.totalAmount - order.totalAmount) > 0.01) {
    errors.push(`Amount mismatch: Invoice shows ₹${invoice.totalAmount} but order shows ₹${order.totalAmount}`);
  }
  
  // Check if items match
  if (invoice.items.length !== order.products.length) {
    errors.push(`Item count mismatch: Invoice has ${invoice.items.length} items but order has ${order.products.length} items`);
  }
  
  // Check individual item prices
  invoice.items.forEach((invoiceItem, index) => {
    const orderItem = order.products[index];
    if (orderItem && Math.abs(invoiceItem.unitPrice - orderItem.unitPrice) > 0.01) {
      errors.push(`Price mismatch for ${invoiceItem.productName || invoiceItem.productCode}: Invoice shows ₹${invoiceItem.unitPrice} but order shows ₹${orderItem.unitPrice}`);
    }
  });
  
  return errors;
}

// Extract order number from message
function extractOrderNumber(message) {
  if (!message) return null;
  
  // Remove extra whitespace and normalize
  const cleanMessage = message.trim();
  
  // First, try to match full order number patterns (most specific first)
  // Pattern: SO-YYYY-NNNN (e.g., SO-2025-0039)
  const soPattern = /(SO-\d{4}-\d{4})/i;
  let match = cleanMessage.match(soPattern);
  if (match && match[1]) {
    return match[1].trim().toUpperCase();
  }
  
  // Pattern: SO-YYYY-NNN (e.g., SO-2024-001)
  const soPatternShort = /(SO-\d{4}-\d{1,4})/i;
  match = cleanMessage.match(soPatternShort);
  if (match && match[1]) {
    return match[1].trim().toUpperCase();
  }
  
  // Pattern: Any 2+ letters followed by dash and numbers (e.g., SO-2024-0001)
  const genericPattern = /\b([A-Z]{2,}-\d{4,}-\d{2,})\b/i;
  match = cleanMessage.match(genericPattern);
  if (match && match[1]) {
    return match[1].trim().toUpperCase();
  }
  
  // Pattern: SO followed by numbers without dashes (e.g., SO20250039)
  const noDashPattern = /\b(SO\d{4}\d{2,})\b/i;
  match = cleanMessage.match(noDashPattern);
  if (match && match[1]) {
    let orderNum = match[1].trim().toUpperCase();
    // Add dashes: SO20250039 -> SO-2025-0039
    orderNum = orderNum.replace(/^SO(\d{4})(\d+)$/, 'SO-$1-$2');
    return orderNum;
  }
  
  // Then try patterns with keywords
  const keywordPatterns = [
    /order[:\s#]+(SO-?\d{4}-?\d{2,})/i,
    /order\s*number[:\s#]+(SO-?\d{4}-?\d{2,})/i,
    /so[:\s#]+(\d{4}-?\d{2,})/i, // If user says "SO 2025-0039" or "so 2025-0039"
  ];
  
  for (const pattern of keywordPatterns) {
    match = cleanMessage.match(pattern);
    if (match && match[1]) {
      let orderNum = match[1].trim().toUpperCase();
      // If it doesn't start with SO, add it
      if (!orderNum.startsWith('SO')) {
        orderNum = 'SO-' + orderNum;
      }
      // Ensure proper format with dashes
      orderNum = orderNum.replace(/^SO-?/, 'SO-');
      // Ensure year and number are separated by dash
      orderNum = orderNum.replace(/^SO-(\d{4})-?(\d+)$/, 'SO-$1-$2');
      return orderNum;
    }
  }
  
  // Fallback: look for any standalone pattern that looks like an order number
  // This should match SO-2025-0039 but NOT -2025-0039
  const fallbackPattern = /\b(SO-?\d{4}-?\d{2,})\b/i;
  match = cleanMessage.match(fallbackPattern);
  if (match && match[1]) {
    let orderNum = match[1].trim().toUpperCase();
    // Normalize format - ensure it starts with SO
    if (!orderNum.startsWith('SO')) {
      orderNum = 'SO-' + orderNum;
    } else {
      orderNum = orderNum.replace(/^SO-?/, 'SO-');
    }
    // Ensure year and number are separated by dash
    orderNum = orderNum.replace(/^SO-(\d{4})-?(\d+)$/, 'SO-$1-$2');
    return orderNum;
  }
  
  return null;
}

// Detect issue type from quick select or message
function detectIssueType(message, existingIssueType) {
  if (existingIssueType) return existingIssueType;
  
  const lower = message.toLowerCase();
  
  if (lower.includes('damaged product received') || lower.includes('damage') || lower.includes('broken') || lower.includes('defect') || lower.includes('cracked')) {
    return 'damaged_product';
  }
  if (lower.includes('wrong product delivered') || lower.includes('wrong product') || lower.includes('incorrect product') || lower.includes('different product')) {
    return 'wrong_product';
  }
  if (lower.includes('missing items') || lower.includes('missing item') || lower.includes('item missing')) {
    return 'missing_items';
  }
  if (lower.includes('quality issue') || lower.includes('quality problem') || lower.includes('poor quality')) {
    return 'quality_issue';
  }
  if (lower.includes('late delivery') || lower.includes('delayed delivery') || lower.includes('delivery delay')) {
    return 'late_delivery';
  }
  if (lower.includes('billing error') || lower.includes('invoice error') || lower.includes('billing mistake')) {
    return 'billing_error';
  }
  if (lower.includes('other complaint') || lower.includes('other issue')) {
    return 'other_complaint';
  }
  
  return null;
}

// Simple AI response generator (replace with actual AI service)
async function generateAIResponse(userMessage, conversation, context, recentMessages = [], dealerId, models = {}) {
  // Use passed models (company-specific) or fall back to module-level imports
  const SalesOrder   = models.SalesOrder   || null;
  const DealerInvoice = models.DealerInvoice || null;
  const lowerMessage = userMessage.toLowerCase();
  let response = '';
  let extractedInfo = {};
  let needsImage = false;
  let readyToSubmit = false;
  let needsOrderNumber = false;
  let needsProductSelection = false;
  let products = [];
  let needsLiveChat = false;
  let needsOrderSelection = false;
  let recentOrders = [];
  let needsInvoiceSelection = false;
  let recentInvoices = [];

  // Get existing collected info from conversation
  const existingInfo = conversation.collectedInfo || {};
  
  // Detect issue type from message or existing info
  const issueType = detectIssueType(userMessage, existingInfo.issueType);
  if (issueType) {
    extractedInfo.issueType = issueType;
  }
  
  // Analyze conversation history to understand context better
  const conversationHistory = recentMessages
    .reverse() // Oldest first
    .map(msg => ({
      text: msg.message || msg.text || '',
      isDealer: msg.isDealer || false,
      isAI: msg.isAI || false
    }))
    .filter(msg => msg.text.length > 0);
  
  // Extract information from conversation history
  conversationHistory.forEach(msg => {
    if (msg.isDealer && msg.text) {
      const text = msg.text.toLowerCase();
      // Look for invoice numbers in history
      const invoicePatterns = [
        /invoice[:\s#]*([A-Z0-9-]+)/i,
        /inv[:\s#]*([A-Z0-9-]+)/i,
        /bill[:\s#]*([A-Z0-9-]+)/i,
        /([A-Z]{2,}\d{4,})/i,
      ];
      for (const pattern of invoicePatterns) {
        const match = msg.text.match(pattern);
        if (match && match[1] && !extractedInfo.invoiceNumber) {
          extractedInfo.invoiceNumber = match[1].trim();
        }
      }
    }
  });
  
  // Extract invoice number (multiple patterns)
  const invoicePatterns = [
    /invoice[:\s#]*([A-Z0-9-]+)/i,
    /inv[:\s#]*([A-Z0-9-]+)/i,
    /bill[:\s#]*([A-Z0-9-]+)/i,
    /([A-Z]{2,}\d{4,})/i, // Pattern like INV2024001
  ];
  
  let invoiceMatch = null;
  for (const pattern of invoicePatterns) {
    invoiceMatch = userMessage.match(pattern);
    if (invoiceMatch) break;
  }
  
  if (invoiceMatch && invoiceMatch[1]) {
    extractedInfo.invoiceNumber = invoiceMatch[1].trim();
  } else if (existingInfo.invoiceNumber) {
    extractedInfo.invoiceNumber = existingInfo.invoiceNumber;
  }

  // Extract order number - try current message first, then conversation history
  let orderNumber = extractOrderNumber(userMessage);
  
  // If not found in current message, check conversation history
  if (!orderNumber) {
    for (const msg of conversationHistory) {
      if (msg.isDealer && msg.text) {
        orderNumber = extractOrderNumber(msg.text);
        if (orderNumber) break;
      }
    }
  }
  
  // Use existing if still not found
  if (!orderNumber && existingInfo.orderNumber) {
    orderNumber = existingInfo.orderNumber;
  }
  
  if (orderNumber) {
    extractedInfo.orderNumber = orderNumber;
  }

  // Extract product name or selected product
  const productMatch = userMessage.match(/product[:\s]+([^,\.\n]+)/i);
  if (productMatch && productMatch[1]) {
    extractedInfo.productName = productMatch[1].trim();
  } else if (existingInfo.productName) {
    extractedInfo.productName = existingInfo.productName;
  }
  
  // Check if user selected a product (from product selection UI)
  if (context.selectedProductId) {
    extractedInfo.selectedProductId = context.selectedProductId;
    extractedInfo.selectedProductName = context.selectedProductName;
  } else if (existingInfo.selectedProductId) {
    extractedInfo.selectedProductId = existingInfo.selectedProductId;
    extractedInfo.selectedProductName = existingInfo.selectedProductName;
  }

  // Merge with existing info
  extractedInfo = {
    ...existingInfo,
    ...extractedInfo
  };

  // Build issue description from user message
  if (userMessage && userMessage.length > 10 && !userMessage.match(/^(yes|no|ok|okay|sure|alright)$/i)) {
    extractedInfo.issueDescription = existingInfo.issueDescription 
      ? `${existingInfo.issueDescription}\n\n${userMessage}`
      : userMessage;
  } else if (existingInfo.issueDescription) {
    extractedInfo.issueDescription = existingInfo.issueDescription;
  }

  // Determine response based on conversation context and message
  const hasInvoice = !!extractedInfo.invoiceNumber;
  const hasOrderNumber = !!extractedInfo.orderNumber;
  const hasDescription = !!extractedInfo.issueDescription && extractedInfo.issueDescription.length > 20;
  const hasImage = existingInfo.hasImage || false;
  const hasSelectedProduct = !!extractedInfo.selectedProductId;

  // Handle specific issue types based on quick select or detected type
  const currentIssueType = extractedInfo.issueType || issueType;
  
  // Handle order-based issues: damaged_product, wrong_product, missing_items, quality_issue
  if (['damaged_product', 'wrong_product', 'missing_items', 'quality_issue'].includes(currentIssueType)) {
    // Check if dealer selected an order from the picker (via context.selectedOrderId)
    if (context.selectedOrderId && !extractedInfo.orderNumber) {
      extractedInfo.orderNumber = context.selectedOrderNumber || context.selectedOrderId;
      extractedInfo.selectedOrderId = context.selectedOrderId;
    }

    if (!hasOrderNumber && !extractedInfo.selectedOrderId) {
      // Fetch last 5 delivered orders for selection
      if (dealerId && SalesOrder) {
        try {
          const delivered = await SalesOrder.find({ dealer: dealerId, status: 'Delivered' })
            .sort({ orderDate: -1 })
            .limit(5)
            .populate('products.product', 'itemName productCode')
            .lean();
          if (delivered.length > 0) {
            needsOrderSelection = true;
            recentOrders = delivered.map(o => ({
              orderId: o._id.toString(),
              orderNumber: o.orderNumber,
              orderDate: o.orderDate,
              totalAmount: o.totalAmount,
              productCount: o.products?.length || 0,
            }));
            response = `I understand you have a ${currentIssueType.replace(/_/g, ' ')} issue. Please select the order it relates to:`;
          } else {
            needsOrderNumber = true;
            response = `I understand you have a ${currentIssueType.replace(/_/g, ' ')} issue. I couldn't find any delivered orders in your account. Could you please provide your order number?`;
          }
        } catch (e) {
          needsOrderNumber = true;
          response = `I understand you have a ${currentIssueType.replace(/_/g, ' ')} issue. Could you please provide your order number?`;
        }
      } else {
        needsOrderNumber = true;
        response = `I understand you have a ${currentIssueType.replace(/_/g, ' ')} issue. Could you please provide your order number?`;
      }
    } else {
      // We have an order number — look it up
      const orderRef = extractedInfo.orderNumber || extractedInfo.selectedOrderId;
      let order = null;
      if (extractedInfo.selectedOrderId) {
        // Direct ID lookup (from picker)
        try {
          order = await SalesOrder.findOne({ _id: extractedInfo.selectedOrderId, dealer: dealerId })
            .populate('products.product', 'itemName productCode')
            .lean();
        } catch (e) { /* fall through to number lookup */ }
      }
      if (!order) {
        order = await lookupOrder(orderRef, dealerId, SalesOrder);
      }

      if (!order) {
        // Order not found — show picker again
        if (dealerId && SalesOrder) {
          try {
            const delivered = await SalesOrder.find({ dealer: dealerId, status: 'Delivered' })
              .sort({ orderDate: -1 }).limit(5)
              .populate('products.product', 'itemName productCode').lean();
            if (delivered.length > 0) {
              needsOrderSelection = true;
              recentOrders = delivered.map(o => ({
                orderId: o._id.toString(),
                orderNumber: o.orderNumber,
                orderDate: o.orderDate,
                totalAmount: o.totalAmount,
                productCount: o.products?.length || 0,
              }));
              response = `I couldn't find that order. Please select from your recent delivered orders:`;
            } else {
              needsOrderNumber = true;
              response = `I couldn't find order "${orderRef}". Please double-check the order number.`;
            }
          } catch (e) {
            needsOrderNumber = true;
            response = `I couldn't find order "${orderRef}". Please double-check the order number.`;
          }
        }
      } else if (order.status !== 'Delivered') {
        response = `I found your order ${order.orderNumber}, but it shows status "${order.status}". For ${currentIssueType.replace(/_/g, ' ')} issues, the order must be delivered. Please contact us once your order is delivered.`;
      } else {
        // Order is delivered — show products for selection
        if (!hasSelectedProduct) {
          needsProductSelection = true;
          products = order.products.map(p => ({
            productId: p.product?._id?.toString() || p.product?.toString(),
            productName: p.productName || p.product?.itemName || 'Unknown Product',
            productCode: p.productCode || p.product?.productCode || '',
            quantity: p.quantity,
          }));
          extractedInfo.orderData = {
            orderNumber: order.orderNumber,
            orderDate: order.orderDate,
            deliveryDate: order.deliveryDate,
            status: order.status,
          };
          extractedInfo.orderNumber = order.orderNumber;
          response = `Great! I found your order ${order.orderNumber} (delivered). Please select which product has the issue:`;
        } else if (!hasImage) {
          needsImage = true;
          response = `Thank you for selecting "${extractedInfo.selectedProductName}". To process your ${currentIssueType.replace(/_/g, ' ')} request, please share a clear photo of the product.`;
        } else {
          response = `Perfect! I have all the information:\n• Order: ${extractedInfo.orderNumber}\n• Product: ${extractedInfo.selectedProductName}\n• Photo: Received ✓\n\nYour ${currentIssueType.replace(/_/g, ' ')} complaint has been submitted. Our team will review it and get back to you soon.`;
          readyToSubmit = true;
        }
      }
    }
  }
  // Handle late delivery
  else if (currentIssueType === 'late_delivery') {
    if (context.selectedOrderId && !extractedInfo.orderNumber) {
      extractedInfo.orderNumber = context.selectedOrderNumber || context.selectedOrderId;
      extractedInfo.selectedOrderId = context.selectedOrderId;
    }

    if (!hasOrderNumber && !extractedInfo.selectedOrderId) {
      // Fetch last 5 non-delivered orders for selection
      if (dealerId && SalesOrder) {
        try {
          const pending = await SalesOrder.find({
            dealer: dealerId,
            status: { $in: ['Pending', 'Confirmed', 'Processing', 'In Transit'] }
          })
            .sort({ orderDate: -1 })
            .limit(5)
            .lean();
          if (pending.length > 0) {
            needsOrderSelection = true;
            recentOrders = pending.map(o => ({
              orderId: o._id.toString(),
              orderNumber: o.orderNumber,
              orderDate: o.orderDate,
              totalAmount: o.totalAmount,
              status: o.status,
              productCount: o.products?.length || 0,
            }));
            response = 'I understand you have a late delivery concern. Please select the order:';
          } else {
            needsOrderNumber = true;
            response = 'I understand you have a late delivery concern. Could you please provide your order number?';
          }
        } catch (e) {
          needsOrderNumber = true;
          response = 'I understand you have a late delivery concern. Could you please provide your order number?';
        }
      } else {
        needsOrderNumber = true;
        response = 'I understand you have a late delivery concern. Could you please provide your order number?';
      }
    } else {
      const orderRef = extractedInfo.orderNumber || extractedInfo.selectedOrderId;
      let order = null;
      if (extractedInfo.selectedOrderId) {
        try {
          order = await SalesOrder.findOne({ _id: extractedInfo.selectedOrderId, dealer: dealerId }).lean();
        } catch (e) { /* fall through */ }
      }
      if (!order) order = await lookupOrder(orderRef, dealerId, SalesOrder);

      if (!order) {
        needsOrderNumber = true;
        response = `I couldn't find that order. Please provide your order number.`;
      } else {
        const expectedDate = order.deliveryDate || new Date(new Date(order.orderDate).getTime() + (order.creditDays || 7) * 24 * 60 * 60 * 1000);
        const today = new Date();
        const daysLate = Math.floor((today - expectedDate) / (1000 * 60 * 60 * 24));
        if (daysLate <= 0) {
          response = `I checked your order ${order.orderNumber}. The expected delivery date is ${expectedDate.toLocaleDateString()}, which hasn't passed yet. Your order is still within the expected timeframe.`;
        } else if (daysLate <= 3) {
          response = `I see your order ${order.orderNumber} is ${daysLate} day(s) late. This is a minor delay — it should arrive soon. Would you like to speak with our support team?`;
        } else {
          response = `I understand your concern. Your order ${order.orderNumber} is ${daysLate} days late. Would you like me to connect you with our support team for immediate assistance?`;
          if (lowerMessage.includes('no') || lowerMessage.includes('not') || lowerMessage.includes('unacceptable')) {
            needsLiveChat = true;
            extractedInfo.needsLiveChat = true;
            response = "I'm connecting you with our support team for immediate assistance.";
          }
        }
      }
    }
  }
  // Handle billing error
  else if (currentIssueType === 'billing_error') {
    if (context.selectedInvoiceId && !extractedInfo.invoiceNumber) {
      extractedInfo.invoiceNumber = context.selectedInvoiceNumber || context.selectedInvoiceId;
      extractedInfo.selectedInvoiceId = context.selectedInvoiceId;
    }

    if (!hasInvoice && !extractedInfo.selectedInvoiceId) {
      // Fetch last 5 invoices for selection
      if (dealerId && DealerInvoice) {
        try {
          const recent = await DealerInvoice.find({ dealer: dealerId })
            .sort({ invoiceDate: -1 })
            .limit(5)
            .lean();
          if (recent.length > 0) {
            needsInvoiceSelection = true;
            recentInvoices = recent.map(inv => ({
              invoiceId: inv._id.toString(),
              invoiceNumber: inv.invoiceNumber,
              invoiceDate: inv.invoiceDate,
              totalAmount: inv.totalAmount || inv.grandTotal || 0,
              paymentStatus: inv.paymentStatus || 'Unpaid',
            }));
            response = 'I can help you with a billing error. Please select the invoice you have a query about:';
          } else {
            response = 'I can help you with billing errors. Please provide your invoice number so I can check for any discrepancies.';
          }
        } catch (e) {
          response = 'I can help you with billing errors. Please provide your invoice number.';
        }
      } else {
        response = 'I can help you with billing errors. Please provide your invoice number.';
      }
    } else {
      const invoiceRef = extractedInfo.invoiceNumber || extractedInfo.selectedInvoiceId;
      let invoice = null;
      if (extractedInfo.selectedInvoiceId) {
        try {
          invoice = await DealerInvoice.findOne({ _id: extractedInfo.selectedInvoiceId, dealer: dealerId })
            .populate('items.product', 'itemName productCode')
            .populate('salesOrder')
            .lean();
        } catch (e) { /* fall through */ }
      }
      if (!invoice) invoice = await lookupInvoice(invoiceRef, dealerId, DealerInvoice);

      if (!invoice) {
        // Show picker again
        if (dealerId && DealerInvoice) {
          try {
            const recent = await DealerInvoice.find({ dealer: dealerId })
              .sort({ invoiceDate: -1 }).limit(5).lean();
            if (recent.length > 0) {
              needsInvoiceSelection = true;
              recentInvoices = recent.map(inv => ({
                invoiceId: inv._id.toString(),
                invoiceNumber: inv.invoiceNumber,
                invoiceDate: inv.invoiceDate,
                totalAmount: inv.totalAmount || inv.grandTotal || 0,
                paymentStatus: inv.paymentStatus || 'Unpaid',
              }));
              response = `I couldn't find that invoice. Please select from your recent invoices:`;
            } else {
              response = `I couldn't find invoice "${invoiceRef}". Could you please verify the invoice number?`;
            }
          } catch (e) {
            response = `I couldn't find invoice "${invoiceRef}". Could you please verify the invoice number?`;
          }
        }
      } else {
        const order = invoice.salesOrder
          ? await lookupOrder(invoice.salesOrderNumber || invoice.salesOrder?.orderNumber, dealerId, SalesOrder)
          : null;
        const errors = checkBillingErrors(invoice, order);
        if (errors.length === 0) {
          response = `I've checked invoice ${invoice.invoiceNumber} and everything looks correct. Is there a specific discrepancy you noticed?`;
          if (hasDescription && (lowerMessage.includes('wrong') || lowerMessage.includes('error') || lowerMessage.includes('mistake'))) {
            needsLiveChat = true;
            extractedInfo.needsLiveChat = true;
            response = "I understand your concern. Let me connect you with our billing team who can review this in detail.";
          }
        } else {
          extractedInfo.billingErrors = errors;
          response = `I found the following billing discrepancies in invoice ${invoice.invoiceNumber}:\n\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\nI'm forwarding this to our billing team for immediate resolution.`;
          readyToSubmit = true;
        }
      }
    }
  }
  // Handle other complaint
  else if (currentIssueType === 'other_complaint') {
    if (!hasDescription || extractedInfo.issueDescription.length < 50) {
      response = 'I understand you have a complaint. Could you please provide detailed information about the issue? The more details you share, the better I can help you.';
    } else {
      // Try to help, but if complex, escalate
      if (hasDescription && extractedInfo.issueDescription.length > 100) {
        // Check if it's something we can handle
        const canHandle = !lowerMessage.includes('legal') && !lowerMessage.includes('lawsuit') && !lowerMessage.includes('court');
        if (canHandle) {
          response = 'Thank you for the detailed information. I\'ve noted your complaint. Our support team will review it and get back to you within 24 hours. Is there anything else I can help with?';
          readyToSubmit = true;
        } else {
          needsLiveChat = true;
          extractedInfo.needsLiveChat = true;
          response = 'I understand this is a serious matter. Let me connect you with our support team immediately for proper handling of this issue.';
        }
      }
    }
  }
  // Legacy handling for old patterns (fallback)
  else if (invoiceMatch && invoiceMatch[1]) {
    extractedInfo.invoiceNumber = invoiceMatch[1].trim();
    if (!hasDescription) {
      response = `Thank you for providing invoice number ${extractedInfo.invoiceNumber}. Could you please describe the issue you're facing?`;
    } else {
      response = `Thank you! I have your invoice number (${extractedInfo.invoiceNumber}) and the issue description. Is there anything else you'd like to add?`;
    }
  } else if (hasInvoice && !hasDescription) {
    response = `I see you mentioned invoice ${extractedInfo.invoiceNumber}. Could you please describe what issue you're experiencing?`;
  } else if (hasDescription && !hasInvoice) {
    response = 'Thank you for the details. Could you please provide your invoice number so I can locate your order?';
  } else if (lowerMessage.includes('thank') || lowerMessage.includes('thanks') || lowerMessage.includes('appreciate')) {
    response = 'You\'re very welcome! Is there anything else I can help you with today?';
  } else if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
    response = 'Hello! How can I assist you today? You can tell me about any issues with your order, invoice, or products.';
  } else if (lowerMessage.includes('status') || lowerMessage.includes('track') || lowerMessage.includes('where')) {
    response = 'I can help you check the status of your order. Could you please provide your invoice number or order number?';
  } else if (lowerMessage.includes('help') || lowerMessage.includes('support')) {
    response = 'I\'m here to help! You can ask me about:\n• Order status and tracking\n• Invoice issues\n• Product returns or exchanges\n• Damaged or wrong products\n\nWhat would you like assistance with?';
  } else {
    // Generic response that encourages more information
    // Check conversation history to see if we're in the middle of a conversation
    const hasPreviousMessages = conversationHistory.length > 2; // More than just welcome messages
    
    if (!hasInvoice && !hasDescription) {
      if (hasPreviousMessages) {
        response = 'I understand. To help you better, could you please provide:\n1. Your invoice number (if available)\n2. A description of the issue\n\nThis will help me assist you more effectively.';
      } else {
        response = 'Thank you for reaching out! To help you better, could you please provide:\n1. Your invoice number (if available)\n2. A description of the issue you\'re facing\n\nThis information will help me assist you more effectively.';
      }
    } else if (hasInvoice && hasDescription) {
      response = 'Thank you for the information. Is there anything else you\'d like to add, or would you like me to submit this issue for review?';
      readyToSubmit = true;
    } else if (hasInvoice) {
      response = `I have your invoice number (${extractedInfo.invoiceNumber}). Could you please describe the issue you're experiencing in more detail?`;
    } else if (hasDescription) {
      response = 'Thank you for describing the issue. Could you please provide your invoice number so I can locate your order?';
    } else {
      response = 'I understand. Could you please provide more details about your issue? This will help me assist you better.';
    }
  }
  
  // Ensure we always have a response
  if (!response || response.trim().length === 0) {
    response = 'I understand. Could you please provide more details about your issue? If you have an invoice number or can describe the problem, that would be helpful.';
  }

  // Final check if ready to submit
  if (hasInvoice && hasDescription && (hasImage || !needsImage)) {
    readyToSubmit = true;
    if (!response.includes('submitted') && !response.includes('submit')) {
      response += '\n\nI have all the information needed. Your issue will be submitted to our support team for review.';
    }
  }

  return {
    text: response,
    metadata: {
      extractedInfo,
      needsImage,
      readyToSubmit,
      needsOrderNumber,
      needsProductSelection,
      products,
      needsLiveChat,
      needsOrderSelection,
      recentOrders,
      needsInvoiceSelection,
      recentInvoices,
    }
  };
}

// @desc    Submit issue/complaint
// @route   POST /api/app/support/chat/conversations/:id/submit-issue
// @access  Protected (Dealer)
export const submitIssue = async (req, res) => {
  try {
    const { ChatConversation, Dealer } = getModels(req.dbConnection);
    const { id } = req.params;
    const issueData = req.body;

    const conversation = await ChatConversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Update conversation with issue data
    conversation.collectedInfo = {
      ...conversation.collectedInfo,
      ...issueData
    };
    
    // If needs live chat, mark it for immediate attention
    if (issueData.needsLiveChat || conversation.collectedInfo.needsLiveChat) {
      conversation.status = 'in_progress';
      conversation.collectedInfo.needsLiveChat = true;
      // You can add a priority flag or notification here
    } else {
      conversation.status = 'in_progress';
    }
    
    await conversation.save();

    res.json({
      success: true,
      message: 'Issue submitted successfully. Our team will review it and get back to you soon.',
      conversation
    });
  } catch (error) {
    console.error('Error submitting issue:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error submitting issue'
    });
  }
};

// @desc    Submit return request
// @route   POST /api/app/support/chat/conversations/:id/submit-return
// @access  Protected (Dealer)
export const submitReturnRequest = async (req, res) => {
  try {
    const { ChatConversation, Dealer } = getModels(req.dbConnection);
    const { id } = req.params;
    const returnData = req.body;

    const conversation = await ChatConversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Update conversation with return data
    conversation.collectedInfo = {
      ...conversation.collectedInfo,
      ...returnData
    };
    conversation.type = 'return';
    conversation.status = 'in_progress';
    await conversation.save();

    res.json({
      success: true,
      message: 'Return request submitted successfully. Our team will review it and get back to you soon.',
      conversation
    });
  } catch (error) {
    console.error('Error submitting return request:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error submitting return request'
    });
  }
};

// @desc    Mark conversation as resolved
// @route   PATCH /api/app/support/chat/conversations/:id/resolve
// @access  Protected (Admin)
export const markResolved = async (req, res) => {
  try {
    const { ChatConversation, Notification } = getModels(req.dbConnection);
    const { id } = req.params;
    const { resolutionNotes } = req.body;

    const conversation = await ChatConversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    conversation.status = 'resolved';
    conversation.resolvedBy = req.user._id;
    conversation.resolvedAt = new Date();
    if (resolutionNotes) {
      conversation.resolutionNotes = resolutionNotes;
    }
    await conversation.save();

    res.json({
      success: true,
      message: 'Conversation marked as resolved',
      conversation
    });
  } catch (error) {
    console.error('Error marking conversation as resolved:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error marking conversation as resolved'
    });
  }
};

// @desc    Create credit note from conversation
// @route   POST /api/app/support/chat/conversations/:id/create-credit-note
// @access  Protected (Admin)
export const createCreditNoteFromConversation = async (req, res) => {
  try {
    const { ChatConversation, Dealer } = getModels(req.dbConnection);
    const { id } = req.params;
    const creditNoteData = req.body;

    const conversation = await ChatConversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }
    
    // Use Dealer from getModels (already destructured above)
    const dealer = await Dealer.findById(conversation.dealer);
    if (!dealer) {
      return res.status(400).json({
        success: false,
        message: 'Dealer not found for this conversation'
      });
    }

    // Import CreditNote and DealerInvoice via dbConnection
    const { creditNoteSchema }   = await import('../../models/CreditNote.js');
    const { dealerInvoiceSchema } = await import('../../models/DealerInvoice.js');
    const CreditNote    = req.dbConnection.models.CreditNote    || req.dbConnection.model('CreditNote',    creditNoteSchema);
    const DealerInvoice = req.dbConnection.models.DealerInvoice || req.dbConnection.model('DealerInvoice', dealerInvoiceSchema);

    // Validate required fields
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Ensure dealer ID exists
    const dealerId = conversation.dealer;
    if (!dealerId) {
      return res.status(400).json({
        success: false,
        message: 'Dealer information not found in conversation'
      });
    }

    // Find the invoice from conversation data
    let invoice = null;
    const invoiceNumber = conversation.collectedInfo?.invoiceNumber;
    const orderNumber = conversation.collectedInfo?.orderNumber;
    
    if (invoiceNumber) {
      // Try to find invoice by invoice number
      invoice = await DealerInvoice.findOne({
        invoiceNumber: invoiceNumber.trim(),
        dealer: dealerId
      });
    }
    
    if (!invoice && orderNumber) {
      // Try to find invoice by order number
      invoice = await DealerInvoice.findOne({
        salesOrderNumber: orderNumber.trim(),
        dealer: dealerId
      }).populate('salesOrder');
    }
    
    // If no invoice found, try to get the most recent invoice for this dealer
    if (!invoice) {
      invoice = await DealerInvoice.findOne({
        dealer: dealerId
      })
      .sort({ createdAt: -1 })
      .limit(1);
    }

    if (!invoice) {
      return res.status(400).json({
        success: false,
        message: 'No invoice found for this dealer. Please create credit note manually with invoice details.'
      });
    }

    // Calculate credit amount and remaining amount
    const creditAmount = creditNoteData.amount || creditNoteData.creditAmount || 0;
    if (creditAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Credit amount must be greater than 0'
      });
    }

    const originalInvoiceAmount = invoice.totalAmount || invoice.grandTotal || 0;
    if (originalInvoiceAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invoice amount is invalid or zero. Cannot create credit note.'
      });
    }

    const remainingAmount = Math.max(0, originalInvoiceAmount - creditAmount);

    // Validate invoice has required fields
    if (!invoice.invoiceNumber) {
      return res.status(400).json({
        success: false,
        message: 'Invoice number is missing. Cannot create credit note.'
      });
    }

    // dealerId is already set above

    // Ensure invoice ID exists
    if (!invoice._id) {
      return res.status(400).json({
        success: false,
        message: 'Invoice ID is missing. Cannot create credit note.'
      });
    }

    // Ensure user ID exists
    if (!req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'User ID is missing. Cannot create credit note.'
      });
    }

    // Create credit note with all required fields - ensure all values are valid
    const creditNoteDataToCreate = {
      dealer: dealerId,
      dealerName: conversation.dealerName || dealer.name || 'Unknown',
      dealerCode: conversation.dealerCode || dealer.code || '',
      originalInvoice: invoice._id,
      originalInvoiceNumber: invoice.invoiceNumber,
      creditNoteDate: new Date(),
      creditAmount: Number(creditAmount),
      creditReason: conversation.collectedInfo?.issueDescription || creditNoteData.creditReason || creditNoteData.reason || 'Issue from chat conversation',
      originalInvoiceAmount: Number(originalInvoiceAmount),
      remainingAmount: Number(remainingAmount),
      status: creditNoteData.status || 'Pending',
      remarks: creditNoteData.remarks || `Created from support chat conversation. Issue: ${conversation.collectedInfo?.issueDescription || 'N/A'}`,
      internalNotes: creditNoteData.internalNotes || `Conversation ID: ${conversation._id}\nIssue Type: ${conversation.type}\nOrder Number: ${orderNumber || 'N/A'}\nInvoice Number: ${invoiceNumber || invoice.invoiceNumber}`,
      createdBy: req.user._id
    };

    // Final validation - check all required fields are present and valid
    if (!creditNoteDataToCreate.dealer) {
      return res.status(400).json({
        success: false,
        message: 'Dealer is required'
      });
    }
    if (!creditNoteDataToCreate.originalInvoice) {
      return res.status(400).json({
        success: false,
        message: 'Original invoice is required'
      });
    }
    if (!creditNoteDataToCreate.originalInvoiceNumber) {
      return res.status(400).json({
        success: false,
        message: 'Original invoice number is required'
      });
    }
    if (!creditNoteDataToCreate.creditAmount || creditNoteDataToCreate.creditAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Credit amount must be greater than 0'
      });
    }
    if (!creditNoteDataToCreate.originalInvoiceAmount || creditNoteDataToCreate.originalInvoiceAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Original invoice amount must be greater than 0'
      });
    }
    if (creditNoteDataToCreate.remainingAmount === undefined || creditNoteDataToCreate.remainingAmount === null) {
      return res.status(400).json({
        success: false,
        message: 'Remaining amount is required'
      });
    }
    if (!creditNoteDataToCreate.createdBy) {
      return res.status(400).json({
        success: false,
        message: 'Created by is required'
      });
    }

    console.log('Creating credit note with validated data:', {
      dealer: creditNoteDataToCreate.dealer,
      dealerType: typeof creditNoteDataToCreate.dealer,
      originalInvoice: creditNoteDataToCreate.originalInvoice,
      originalInvoiceType: typeof creditNoteDataToCreate.originalInvoice,
      originalInvoiceNumber: creditNoteDataToCreate.originalInvoiceNumber,
      creditAmount: creditNoteDataToCreate.creditAmount,
      creditAmountType: typeof creditNoteDataToCreate.creditAmount,
      originalInvoiceAmount: creditNoteDataToCreate.originalInvoiceAmount,
      originalInvoiceAmountType: typeof creditNoteDataToCreate.originalInvoiceAmount,
      remainingAmount: creditNoteDataToCreate.remainingAmount,
      remainingAmountType: typeof creditNoteDataToCreate.remainingAmount,
      createdBy: creditNoteDataToCreate.createdBy,
      createdByType: typeof creditNoteDataToCreate.createdBy
    });

    const creditNote = await CreditNote.create(creditNoteDataToCreate);

    // Link credit note to conversation
    conversation.creditNote = creditNote._id;
    conversation.status = 'resolved';
    conversation.resolvedBy = req.user._id;
    conversation.resolvedAt = new Date();
    await conversation.save();

    res.status(201).json({
      success: true,
      message: 'Credit note created successfully from conversation',
      creditNote
    });
  } catch (error) {
    console.error('Error creating credit note from conversation:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating credit note from conversation'
    });
  }
};

