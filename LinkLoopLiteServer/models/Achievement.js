const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  key: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  emoji: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['streak', 'milestone', 'consistency', 'explorer', 'community'],
    default: 'milestone'
  },
  unlockedAt: {
    type: Date,
    default: Date.now
  }
});

// One achievement per user per key
achievementSchema.index({ userId: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('Achievement', achievementSchema);
