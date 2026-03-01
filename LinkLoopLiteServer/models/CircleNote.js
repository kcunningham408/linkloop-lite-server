const mongoose = require('mongoose');

const circleNoteSchema = new mongoose.Schema({
  // The warrior whose glucose timeline this note is attached to
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Who wrote the note (member or warrior)
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  authorName: {
    type: String,
    required: true
  },
  authorEmoji: {
    type: String,
    default: '👤'
  },
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  // Optional: link to a specific time (e.g. "she ate pizza at 12:30 PM")
  noteTime: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

circleNoteSchema.index({ ownerId: 1, createdAt: -1 });

module.exports = mongoose.model('CircleNote', circleNoteSchema);
