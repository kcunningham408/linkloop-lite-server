const mongoose = require('mongoose');

const acknowledgmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  userEmoji: {
    type: String,
    default: '👤'
  },
  message: {
    type: String,
    default: 'Got it, handling it!'
  },
  acknowledgedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const alertSchema = new mongoose.Schema({
  // The T1D user who this alert is about
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  // Alert details
  type: {
    type: String,
    enum: ['low', 'urgent_low', 'high', 'urgent_high', 'rapid_drop', 'rapid_rise', 'no_data'],
    required: true
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'urgent', 'critical'],
    default: 'warning'
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  // Glucose value that triggered this alert
  glucoseValue: {
    type: Number,
    default: null
  },
  glucoseUnit: {
    type: String,
    default: 'mg/dL'
  },
  // Which care circle members were notified
  notifiedMembers: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    notifiedAt: { type: Date, default: Date.now }
  }],
  // ★ THE KEY FEATURE: Acknowledgment tracking
  acknowledgments: [acknowledgmentSchema],
  // Status
  status: {
    type: String,
    enum: ['active', 'acknowledged', 'resolved', 'expired'],
    default: 'active'
  },
  // Auto-resolve after this time (e.g. 2 hours)
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  resolvedAt: {
    type: Date,
    default: null
  }
});

alertSchema.index({ userId: 1, createdAt: -1 });
alertSchema.index({ status: 1 });
alertSchema.index({ 'notifiedMembers.userId': 1 });

module.exports = mongoose.model('Alert', alertSchema);
