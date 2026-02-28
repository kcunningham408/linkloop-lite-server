const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // The care circle relationship this message belongs to (1-on-1 chats)
  circleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CareCircle',
    default: null
  },
  // For group chat: the warrior (owner) whose circle this group belongs to
  groupOwnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Who sent the message
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderName: {
    type: String,
    required: true
  },
  senderEmoji: {
    type: String,
    default: '👤'
  },
  // Message content
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  // Message type for special messages
  type: {
    type: String,
    enum: ['text', 'alert', 'acknowledgment', 'system'],
    default: 'text'
  },
  // If this message references an alert
  alertId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Alert',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

messageSchema.index({ circleId: 1, createdAt: -1 });
messageSchema.index({ groupOwnerId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
