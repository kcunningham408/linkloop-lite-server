const express = require('express');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const CareCircle = require('../models/CareCircle');
const User = require('../models/User');

const router = express.Router();

// @route   GET /api/circle
router.get('/', auth, async (req, res) => {
  try {
    const members = await CareCircle.find({ ownerId: req.user.userId })
      .populate('memberId', 'name email phone profileEmoji');
    res.json(members);
  } catch (err) {
    console.error('Get circle error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/circle/invite
router.post('/invite', auth, async (req, res) => {
  try {
    const { memberName, memberEmoji, relationship, permissions } = req.body;

    const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    const invitation = new CareCircle({
      ownerId: req.user.userId,
      memberId: req.user.userId,
      memberName,
      memberEmoji: memberEmoji || '👤',
      relationship,
      permissions,
      inviteCode,
      status: 'pending'
    });

    await invitation.save();

    res.status(201).json({ message: 'Invite created', inviteCode, invitation });
  } catch (err) {
    console.error('Create invite error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/circle/join
router.post('/join', auth, async (req, res) => {
  try {
    const { inviteCode } = req.body;

    const invitation = await CareCircle.findOne({
      inviteCode: inviteCode.toUpperCase(),
      status: 'pending'
    });

    if (!invitation) {
      return res.status(404).json({ message: 'Invalid or expired invite code' });
    }

    invitation.memberId = req.user.userId;
    invitation.status = 'active';
    invitation.inviteCode = null;
    await invitation.save();

    const owner = await User.findById(invitation.ownerId).select('name profileEmoji');

    res.json({
      message: 'Successfully joined Care Circle',
      owner: { name: owner.name, emoji: owner.profileEmoji }
    });
  } catch (err) {
    console.error('Join circle error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/circle/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { permissions, status } = req.body;

    const member = await CareCircle.findOne({ _id: req.params.id, ownerId: req.user.userId });
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    if (permissions) member.permissions = { ...member.permissions, ...permissions };
    if (status) member.status = status;
    await member.save();

    res.json({ message: 'Member updated', member });
  } catch (err) {
    console.error('Update circle member error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/circle/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const member = await CareCircle.findOneAndDelete({ _id: req.params.id, ownerId: req.user.userId });
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }
    res.json({ message: 'Member removed from Care Circle' });
  } catch (err) {
    console.error('Delete circle member error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
