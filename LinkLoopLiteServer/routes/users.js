const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');

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

module.exports = router;
