const express = require('express');
const auth = require('../middleware/auth');
const Message = require('../models/Message');
const CareCircle = require('../models/CareCircle');
const User = require('../models/User');
const { sendPushToUsersFiltered } = require('../jobs/pushNotifications');

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

// ============================================================
// GROUP CHAT — whole Care Circle together
// (Must be above /:circleId routes so Express doesn't match "group" as a circleId)
// ============================================================

// Helper: Verify user belongs to the warrior's circle (as owner or member)
async function verifyGroupAccess(ownerId, userId) {
  if (ownerId === userId) return true;
  const membership = await CareCircle.findOne({
    ownerId,
    memberId: userId,
    status: 'active'
  });
  return !!membership;
}

// @route   GET /api/chat/group/messages
router.get('/group/messages', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select('role linkedOwnerId');

    const groupOwnerId = user.role === 'warrior' ? userId : (user.linkedOwnerId?.toString() || null);
    if (!groupOwnerId) {
      return res.status(400).json({ message: 'No care circle group found' });
    }

    const { before, limit = 50 } = req.query;
    const query = { groupOwnerId };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(messages.reverse());
  } catch (err) {
    console.error('Get group messages error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/chat/group/messages
router.post('/group/messages', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select('name profileEmoji role linkedOwnerId');

    const groupOwnerId = user.role === 'warrior' ? userId : (user.linkedOwnerId?.toString() || null);
    if (!groupOwnerId) {
      return res.status(400).json({ message: 'No care circle group found' });
    }

    const hasAccess = await verifyGroupAccess(groupOwnerId, userId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    const message = new Message({
      groupOwnerId,
      senderId: userId,
      senderName: user.name || 'Unknown',
      senderEmoji: user.profileEmoji || '👤',
      text: text.trim(),
      type: 'text'
    });

    await message.save();

    // Push notification to all other group members (respects groupMessages pref)
    const groupCircles = await CareCircle.find({ ownerId: groupOwnerId, status: 'active' }).select('memberId');
    const allGroupIds = [groupOwnerId, ...groupCircles.map(c => c.memberId.toString())];
    const pushRecipients = [...new Set(allGroupIds)].filter(id => id !== userId);
    if (pushRecipients.length > 0) {
      const pushTitle = `\uD83D\uDC65 Group: ${user.name || 'Someone'}`;
      const pushBody = text.trim().length > 100 ? text.trim().slice(0, 100) + '\u2026' : text.trim();
      sendPushToUsersFiltered(pushRecipients, pushTitle, pushBody, {
        type: 'groupMessage',
      }, 'groupMessages').catch(err => console.error('[Push] Group message error:', err));
    }

    res.status(201).json(message);
  } catch (err) {
    console.error('Send group message error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/chat/group/info
router.get('/group/info', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select('name profileEmoji role linkedOwnerId');

    const groupOwnerId = user.role === 'warrior' ? userId : (user.linkedOwnerId?.toString() || null);
    if (!groupOwnerId) {
      return res.status(400).json({ message: 'No care circle group found' });
    }

    const owner = await User.findById(groupOwnerId).select('name profileEmoji');
    const circles = await CareCircle.find({ ownerId: groupOwnerId, status: 'active' })
      .populate('memberId', 'name profileEmoji');

    const members = [
      { id: owner._id, name: owner.name, emoji: owner.profileEmoji || '👤', role: 'warrior' },
      ...circles
        .filter(c => c.memberId)
        .map(c => ({
          id: c.memberId._id,
          name: c.memberId.name || c.memberName,
          emoji: c.memberId.profileEmoji || c.memberEmoji || '👤',
          role: 'member',
          relationship: c.relationship,
        })),
    ];

    res.json({
      groupOwnerId,
      ownerName: owner.name,
      memberCount: members.length,
      members,
    });
  } catch (err) {
    console.error('Get group info error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// 1-ON-1 CHAT — per care circle relationship
// ============================================================

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

    // Push notification to the other person in the 1-on-1 chat (respects newMessages pref)
    const isOwner = circle.ownerId.toString() === req.user.userId;
    const recipientId = isOwner ? circle.memberId.toString() : circle.ownerId.toString();
    const pushTitle = `\uD83D\uDCAC ${user.name || 'Someone'}`;
    const pushBody = text.trim().length > 100 ? text.trim().slice(0, 100) + '\u2026' : text.trim();
    sendPushToUsersFiltered([recipientId], pushTitle, pushBody, {
      type: 'newMessage',
      circleId: req.params.circleId,
    }, 'newMessages').catch(err => console.error('[Push] 1-on-1 message error:', err));

    res.status(201).json(message);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
