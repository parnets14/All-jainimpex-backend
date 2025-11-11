import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema({
  // Reference to conversation
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ChatConversation",
    required: true
  },

  // Message content
  message: {
    type: String,
    required: true,
    trim: true
  },

  // Message type
  type: {
    type: String,
    enum: ["text", "image", "system"],
    default: "text"
  },

  // Image URL if type is image
  image: String,
  imageUrl: String,

  // Sender information
  isDealer: {
    type: Boolean,
    default: true
  },
  isAI: {
    type: Boolean,
    default: false
  },

  // Sender details (for admin messages)
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  senderName: String,

  // AI Response metadata
  aiResponse: {
    extractedInfo: mongoose.Schema.Types.Mixed,
    needsImage: Boolean,
    readyToSubmit: Boolean
  }
}, {
  timestamps: true
});

// Index for faster queries
chatMessageSchema.index({ conversation: 1, createdAt: 1 });

const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);

export default ChatMessage;

