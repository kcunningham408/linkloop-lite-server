const mongoose = require('mongoose');

const supplySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  emoji: {
    type: String,
    default: '💉'
  },
  category: {
    type: String,
    enum: ['insulin', 'test_strips', 'cgm_sensor', 'pump_supplies', 'lancets', 'glucose_tabs', 'batteries', 'alcohol_wipes', 'other'],
    default: 'other'
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    default: 'units'
  },
  daysLeft: {
    type: Number,
    default: 30,
    min: 0
  },
}, {
  timestamps: true
});

supplySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Supply', supplySchema);
