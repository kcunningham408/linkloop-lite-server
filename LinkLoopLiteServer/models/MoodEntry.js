const mongoose = require('mongoose');

const moodEntrySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  emoji: {
    type: String,
    required: true,
    default: '😊'
  },
  label: {
    type: String,
    required: true,
    enum: ['great', 'good', 'okay', 'tired', 'stressed', 'sick', 'low_energy', 'anxious'],
    default: 'good'
  },
  note: {
    type: String,
    trim: true,
    maxlength: 500
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

moodEntrySchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('MoodEntry', moodEntrySchema);
