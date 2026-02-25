const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const GlucoseReading = require('../models/GlucoseReading');
const CareCircle = require('../models/CareCircle');
const Message = require('../models/Message');
const Alert = require('../models/Alert');
const MoodEntry = require('../models/MoodEntry');
const Supply = require('../models/Supply');
const Achievement = require('../models/Achievement');

const router = express.Router();

// @route   GET /api/users/me
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/users/me
router.put('/me', auth, async (req, res) => {
  try {
    const { name, profileEmoji, settings } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (name) user.name = name;
    if (profileEmoji) user.profileEmoji = profileEmoji;
    if (settings) user.settings = { ...user.settings, ...settings };

    await user.save();

    res.json({
      message: 'Profile updated',
      user: {
        id: user._id,
        email: user.email || null,
        phone: user.phone || null,
        name: user.name,
        role: user.role,
        profileEmoji: user.profileEmoji,
        settings: user.settings
      }
    });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/users/me
// @desc    Permanently delete user account and all associated data
router.delete('/me', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Delete all user data in parallel
    await Promise.all([
      GlucoseReading.deleteMany({ userId }),
      CareCircle.deleteMany({ $or: [{ ownerId: userId }, { members: userId }] }),
      Message.deleteMany({ $or: [{ senderId: userId }, { recipientId: userId }] }),
      Alert.deleteMany({ userId }),
      MoodEntry.deleteMany({ userId }),
      Supply.deleteMany({ userId }),
      Achievement.deleteMany({ userId }),
    ]);

    // Delete the user account itself
    await User.findByIdAndDelete(userId);

    console.log(`Account deleted for user ${userId}`);
    res.json({ message: 'Account and all associated data permanently deleted' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
