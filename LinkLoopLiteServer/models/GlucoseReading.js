const mongoose = require('mongoose');

const glucoseReadingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  value: {
    type: Number,
    required: true,
    min: 20,
    max: 600
  },
  unit: {
    type: String,
    enum: ['mg/dL', 'mmol/L'],
    default: 'mg/dL'
  },
  trend: {
    type: String,
    enum: ['rising_fast', 'rising', 'stable', 'falling', 'falling_fast'],
    default: 'stable'
  },
  trendArrow: {
    type: String,
    default: '→'
  },
  source: {
    type: String,
    enum: ['manual', 'dexcom', 'libre', 'medtronic', 'other'],
    default: 'manual'
  },
  notes: {
    type: String,
    trim: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

glucoseReadingSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('GlucoseReading', glucoseReadingSchema);
