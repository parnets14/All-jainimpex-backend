import mongoose from "mongoose";

const chatConversationSchema = new mongoose.Schema({
  // Dealer Information
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Dealer",
    required: true
  },
  dealerName: String,
  dealerCode: String,

  // Conversation Type
  type: {
    type: String,
    enum: ["general", "complaint", "return"],
    default: "general"
  },

  // Status
  status: {
    type: String,
    enum: ["pending", "in_progress", "resolved", "closed"],
    default: "pending"
  },

  // Collected Information from AI
  collectedInfo: {
    issueType: String,
    issueDescription: String,
    invoiceNumber: String,
    orderNumber: String,
    productName: String,
    selectedProductId: String,
    selectedProductName: String,
    hasImage: {
      type: Boolean,
      default: false
    },
    orderData: mongoose.Schema.Types.Mixed, // Store order details
    invoiceData: mongoose.Schema.Types.Mixed, // Store invoice details
    products: [{
      productId: String,
      productName: String,
      productCode: String,
      quantity: Number
    }],
    expectedDeliveryDate: Date,
    actualDeliveryDate: Date,
    billingErrors: [String], // List of billing errors found
    needsLiveChat: {
      type: Boolean,
      default: false
    },
    // Additional collected fields
    [String]: mongoose.Schema.Types.Mixed
  },

  // Last message preview
  lastMessage: String,
  lastMessageAt: Date,

  // Message count
  messageCount: {
    type: Number,
    default: 0
  },

  // Resolution Information
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  resolvedAt: Date,
  resolutionNotes: String,

  // Credit Note created from this conversation
  creditNote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CreditNote"
  }
}, {
  timestamps: true
});

// Index for faster queries
chatConversationSchema.index({ dealer: 1, status: 1 });
chatConversationSchema.index({ status: 1, createdAt: -1 });

const ChatConversation = mongoose.model("ChatConversation", chatConversationSchema);

// Export schema for multi-database support
export { chatConversationSchema };

export default ChatConversation;

