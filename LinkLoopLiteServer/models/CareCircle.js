const mongoose = require('mongoose');

const careCircleSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  memberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  memberName: {
    type: String,
    required: true
  },
  memberEmoji: {
    type: String,
    default: '👤'
  },
  relationship: {
    type: String,
    enum: ['parent', 'sibling', 'friend', 'school_nurse', 'coach', 't1d_buddy', 'other'],
    default: 'other'
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'paused'],
    default: 'pending'
  },
  permissions: {
    viewGlucose: { type: Boolean, default: true },
    receiveLowAlerts: { type: Boolean, default: true },
    receiveHighAlerts: { type: Boolean, default: false }
  },
  inviteCode: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

careCircleSchema.index({ ownerId: 1, memberId: 1 }, { unique: true });

module.exports = mongoose.model('CareCircle', careCircleSchema);
