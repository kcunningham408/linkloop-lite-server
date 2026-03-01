const express = require('express');
const auth = require('../middleware/auth');
const CircleNote = require('../models/CircleNote');
const CareCircle = require('../models/CareCircle');
const User = require('../models/User');

const router = express.Router();

// ============================================================
// CIRCLE NOTES — Time-stamped notes from warriors or members
// Visible to the whole circle. Great for "she ate pizza" or "PE class".
// ============================================================

// @route   POST /api/notes
// @desc    Add a note to the warrior's glucose timeline
// @access  Private (warrior or active circle member)
router.post('/', auth, async (req, res) => {
  try {
    const { text, noteTime } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ message: 'Note text is required' });
    }

    const user = await User.findById(req.user.userId).select('name profileEmoji role linkedOwnerId');
    if (!user) return res.status(404).json({ message: 'User not found' });

    let ownerId;
    if (user.role === 'warrior') {
      // Warrior is adding a note to their own timeline
      ownerId = user._id;
    } else if (user.role === 'member' && user.linkedOwnerId) {
      // Member is adding a note to their warrior's timeline
      // Verify they're still an active member
      const membership = await CareCircle.findOne({
        ownerId: user.linkedOwnerId,
        memberId: req.user.userId,
        status: { $in: ['active', 'paused'] }
      });
      if (!membership) {
        return res.status(403).json({ message: 'Not an active circle member' });
      }
      ownerId = user.linkedOwnerId;
    } else {
      return res.status(403).json({ message: 'Cannot add notes without a circle' });
    }

    const note = new CircleNote({
      ownerId,
      authorId: user._id,
      authorName: user.name,
      authorEmoji: user.profileEmoji || '👤',
      text: text.trim().slice(0, 500),
      noteTime: noteTime ? new Date(noteTime) : new Date(),
    });

    await note.save();
    res.status(201).json(note);
  } catch (err) {
    console.error('Add circle note error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/notes
// @desc    Get notes for a warrior's timeline (visible to warrior + circle)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { hours = 24, limit = 50 } = req.query;
    const user = await User.findById(req.user.userId).select('role linkedOwnerId');

    let ownerId;
    if (user.role === 'warrior') {
      ownerId = user._id;
    } else if (user.role === 'member' && user.linkedOwnerId) {
      ownerId = user.linkedOwnerId;
    } else {
      return res.json([]);
    }

    const since = new Date();
    since.setHours(since.getHours() - parseInt(hours));

    const notes = await CircleNote.find({
      ownerId,
      createdAt: { $gte: since },
    })
      .sort({ noteTime: -1 })
      .limit(parseInt(limit));

    res.json(notes);
  } catch (err) {
    console.error('Get circle notes error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/notes/:id
// @desc    Delete a note (only the author or the warrior can delete)
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const note = await CircleNote.findById(req.params.id);
    if (!note) return res.status(404).json({ message: 'Note not found' });

    const isAuthor = note.authorId.toString() === req.user.userId;
    const isOwner = note.ownerId.toString() === req.user.userId;

    if (!isAuthor && !isOwner) {
      return res.status(403).json({ message: 'Not authorized to delete this note' });
    }

    await CircleNote.findByIdAndDelete(req.params.id);
    res.json({ message: 'Note deleted' });
  } catch (err) {
    console.error('Delete circle note error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
