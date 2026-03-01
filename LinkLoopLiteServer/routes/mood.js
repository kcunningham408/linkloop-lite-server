const express = require('express');
const auth = require('../middleware/auth');
const MoodEntry = require('../models/MoodEntry');

const router = express.Router();

// ============================================================
// MOOD / QUICK NOTES — Personal wellness journal entries
// Non-medical. Just how you're feeling + optional notes.
// ============================================================

// @route   POST /api/mood
// @desc    Log a mood entry
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { emoji, label, note } = req.body;

    if (!emoji || !label) {
      return res.status(400).json({ message: 'Emoji and label are required' });
    }

    const entry = new MoodEntry({
      userId: req.user.userId,
      emoji,
      label,
      note: note?.trim() || undefined,
    });

    await entry.save();
    res.status(201).json(entry);
  } catch (err) {
    console.error('Log mood error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/mood
// @desc    Get mood entries with time filter
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { hours = 168, limit = 50 } = req.query; // default: 7 days

    const since = new Date();
    since.setHours(since.getHours() - parseInt(hours));

    const entries = await MoodEntry.find({
      userId: req.user.userId,
      timestamp: { $gte: since }
    })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json(entries);
  } catch (err) {
    console.error('Get mood entries error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/mood/stats
// @desc    Get mood frequency stats for the last N hours
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    const { hours = 168 } = req.query;

    const since = new Date();
    since.setHours(since.getHours() - parseInt(hours));

    const entries = await MoodEntry.find({
      userId: req.user.userId,
      timestamp: { $gte: since }
    }).sort({ timestamp: -1 });

    // Frequency counts
    const frequency = {};
    entries.forEach(e => {
      const key = e.label;
      if (!frequency[key]) {
        frequency[key] = { label: key, emoji: e.emoji, count: 0 };
      }
      frequency[key].count++;
    });

    // Most common mood
    const sorted = Object.values(frequency).sort((a, b) => b.count - a.count);
    const topMood = sorted[0] || null;

    // Streak: consecutive same mood
    let currentStreak = 1;
    if (entries.length >= 2) {
      for (let i = 1; i < entries.length; i++) {
        if (entries[i].label === entries[0].label) currentStreak++;
        else break;
      }
    }

    // Recent notes (last 10 entries with notes)
    const recentNotes = entries
      .filter(e => e.note)
      .slice(0, 10)
      .map(e => ({
        note: e.note,
        emoji: e.emoji,
        label: e.label,
        timestamp: e.timestamp
      }));

    res.json({
      totalEntries: entries.length,
      frequency: sorted,
      topMood,
      currentStreak: entries.length > 0 ? { label: entries[0].label, emoji: entries[0].emoji, count: currentStreak } : null,
      recentNotes,
    });
  } catch (err) {
    console.error('Mood stats error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/mood/:id
// @desc    Update a mood entry
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const { emoji, label, note } = req.body;

    const update = {};
    if (emoji) update.emoji = emoji;
    if (label) update.label = label;
    if (note !== undefined) update.note = note?.trim() || undefined;

    const entry = await MoodEntry.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { $set: update },
      { new: true }
    );

    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.json(entry);
  } catch (err) {
    console.error('Update mood error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/mood/:id
// @desc    Delete a mood entry
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const entry = await MoodEntry.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.json({ message: 'Entry deleted' });
  } catch (err) {
    console.error('Delete mood error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
