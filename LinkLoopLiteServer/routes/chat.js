const express = require('express');
const auth = require('../middleware/auth');
const Message = require('../models/Message');
const CareCircle = require('../models/CareCircle');
const User = require('../models/User');

const router = express.Router();

// ============================================================
// Helper: Get all circle IDs where the user is owner OR member
// ============================================================
async function getUserCircleIds(userId) {
  const circles = await CareCircle.find({
    $or: [{ ownerId: userId }, { memberId: userId }],
    status: 'active'
  }).select('_id ownerId memberId');
  return circles;
}

// ============================================================
// Helper: Verify user belongs to this circle
// ============================================================
async function verifyCircleAccess(circleId, userId) {
  const circle = await CareCircle.findOne({
    _id: circleId,
    $or: [{ ownerId: userId }, { memberId: userId }],
    status: 'active'
  });
  return circle;
}

// @route   GET /api/chat/conversations
// @desc    Get all chat conversations (circles the user belongs to)
// @access  Private
router.get('/conversations', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get all circles where user is owner or member
    const circles = await CareCircle.find({
      $or: [{ ownerId: userId }, { memberId: userId }],
      status: 'active'
    }).populate('ownerId', 'name profileEmoji')
      .populate('memberId', 'name profileEmoji');

    // For each circle, get the last message and unread count
    const conversations = await Promise.all(circles.map(async (circle) => {
      const lastMessage = await Message.findOne({ circleId: circle._id })
        .sort({ createdAt: -1 })
        .limit(1);

      // Determine the "other person" from the user's perspective
      const isOwner = circle.ownerId._id.toString() === userId;
      const otherPerson = isOwner
        ? { name: circle.memberId.name || circle.memberName, emoji: circle.memberId.profileEmoji || circle.memberEmoji }
        : { name: circle.ownerId.name, emoji: circle.ownerId.profileEmoji || '👤' };

      return {
        circleId: circle._id,
        otherPerson,
        relationship: circle.relationship,
        lastMessage: lastMessage ? {
          text: lastMessage.text,
          senderName: lastMessage.senderName,
          type: lastMessage.type,
          createdAt: lastMessage.createdAt
        } : null
      };
    }));

    // Sort by most recent message
    conversations.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt || new Date(0);
      const bTime = b.lastMessage?.createdAt || new Date(0);
      return new Date(bTime) - new Date(aTime);
    });

    res.json(conversations);
  } catch (err) {
    console.error('Get conversations error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/chat/:circleId/messages
// @desc    Get messages for a specific care circle chat
// @access  Private
router.get('/:circleId/messages', auth, async (req, res) => {
  try {
    const circle = await verifyCircleAccess(req.params.circleId, req.user.userId);
    if (!circle) {
      return res.status(403).json({ message: 'You do not have access to this conversation' });
    }

    const { before, limit = 50 } = req.query;
    const query = { circleId: req.params.circleId };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Return in chronological order
    res.json(messages.reverse());
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/chat/:circleId/messages
// @desc    Send a message in a care circle chat
// @access  Private
router.post('/:circleId/messages', auth, async (req, res) => {
  try {
    const circle = await verifyCircleAccess(req.params.circleId, req.user.userId);
    if (!circle) {
      return res.status(403).json({ message: 'You do not have access to this conversation' });
    }

    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    const user = await User.findById(req.user.userId).select('name profileEmoji');

    const message = new Message({
      circleId: req.params.circleId,
      senderId: req.user.userId,
      senderName: user.name || 'Unknown',
      senderEmoji: user.profileEmoji || '👤',
      text: text.trim(),
      type: 'text'
    });

    await message.save();

    res.status(201).json(message);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
