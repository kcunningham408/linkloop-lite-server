const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// Normalize phone: strip non-digits, ensure 10+ digits
const normalizePhone = (phone) => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  // Store last 10 digits with +1 prefix for US
  return '+1' + digits.slice(-10);
};

// Build user response object
const userResponse = (user) => ({
  id: user._id,
  email: user.email || null,
  phone: user.phone || null,
  name: user.name,
  role: user.role,
  linkedOwnerId: user.linkedOwnerId || null,
  profileEmoji: user.profileEmoji,
  settings: user.settings,
  createdAt: user.createdAt
});

// @route   POST /api/auth/register
// @desc    Register a new user with email OR phone
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { email, phone, password, name, role } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (!email && !phone) {
      return res.status(400).json({ message: 'Email or phone number is required' });
    }

    // Normalize phone if provided
    const normalizedPhone = normalizePhone(phone);
    if (phone && !normalizedPhone) {
      return res.status(400).json({ message: 'Invalid phone number — must be at least 10 digits' });
    }

    // Check if user already exists by email or phone
    if (email) {
      const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
      if (existingEmail) {
        return res.status(400).json({ message: 'An account with this email already exists' });
      }
    }
    if (normalizedPhone) {
      const existingPhone = await User.findOne({ phone: normalizedPhone });
      if (existingPhone) {
        return res.status(400).json({ message: 'An account with this phone number already exists' });
      }
    }

    // Create new user
    const userData = {
      password,
      name: name.trim(),
      role: role || 'warrior'
    };
    if (email) userData.email = email.toLowerCase().trim();
    if (normalizedPhone) userData.phone = normalizedPhone;

    const user = new User(userData);
    await user.save();

    // Create JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: userResponse(user)
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/login
// @desc    Login user with email OR phone + password
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ message: 'Email or phone number is required' });
    }
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    // Find user by email or phone
    let user;
    if (email) {
      user = await User.findOne({ email: email.toLowerCase().trim() });
    } else {
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({ message: 'Invalid phone number' });
      }
      user = await User.findOne({ phone: normalizedPhone });
    }

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Create JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: userResponse(user)
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
