const express = require('express');
const auth = require('../middleware/auth');
const Alert = require('../models/Alert');
const CareCircle = require('../models/CareCircle');
const GlucoseReading = require('../models/GlucoseReading');
const Message = require('../models/Message');
const User = require('../models/User');
const { sendPushToUsersFiltered } = require('../jobs/pushNotifications');
const { checkGlucoseAlert } = require('../jobs/alertChecker');

const router = express.Router();

// @route   POST /api/alerts/check
// @desc    Check a glucose reading and create alerts if needed
//          Called after a new reading is logged
// @access  Private
router.post('/check', auth, async (req, res) => {
  try {
    const { glucoseValue } = req.body;
    if (!glucoseValue) {
      return res.status(400).json({ message: 'glucoseValue is required' });
    }

    const alert = await checkGlucoseAlert(req.user.userId, glucoseValue);

    if (!alert) {
      return res.json({ alert: null, message: 'Glucose is in range, no alert needed' });
    }

    res.status(201).json({ alert, notifiedCount: alert.notifiedMembers?.length || 0 });
  } catch (err) {
    console.error('Check alert error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/alerts
// @desc    Get alerts for the user (as T1D owner OR as care circle member)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status = 'all', limit = 20 } = req.query;

    // Alerts where user is the T1D person
    const ownAlertQuery = { userId };

    // Alerts where user was notified as a care circle member
    const notifiedAlertQuery = { 'notifiedMembers.userId': userId };

    const query = { $or: [ownAlertQuery, notifiedAlertQuery] };
    if (status !== 'all') query.status = status;

    const alerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Mark expired alerts
    const now = new Date();
    for (const alert of alerts) {
      if (alert.status === 'active' && alert.expiresAt && alert.expiresAt < now) {
        alert.status = 'expired';
        await alert.save();
      }
    }

    res.json(alerts);
  } catch (err) {
    console.error('Get alerts error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/alerts/active
// @desc    Get active (unacknowledged) alerts count
// @access  Private
router.get('/active', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const count = await Alert.countDocuments({
      $or: [{ userId }, { 'notifiedMembers.userId': userId }],
      status: 'active',
      expiresAt: { $gte: new Date() }
    });
    res.json({ activeCount: count });
  } catch (err) {
    console.error('Active alerts error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/alerts/:id
// @desc    Get a single alert with full acknowledgment details
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id)
      .populate('acknowledgments.userId', 'name profileEmoji');
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    const userId = req.user.userId;
    const isOwner = alert.userId.toString() === userId;
    const isNotified = alert.notifiedMembers.some(m => m.userId.toString() === userId);

    if (!isOwner && !isNotified) {
      return res.status(403).json({ message: 'You are not involved in this alert' });
    }

    res.json(alert);
  } catch (err) {
    console.error('Get alert error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/alerts/:id/acknowledge
// @desc    Acknowledge an alert — THE KEY FEATURE
// @access  Private
router.post('/:id/acknowledge', auth, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    // Verify user is involved (owner or notified member)
    const userId = req.user.userId;
    const isOwner = alert.userId.toString() === userId;
    const isNotified = alert.notifiedMembers.some(m => m.userId.toString() === userId);

    if (!isOwner && !isNotified) {
      return res.status(403).json({ message: 'You are not involved in this alert' });
    }

    // Check if already acknowledged by this user
    const alreadyAcked = alert.acknowledgments.some(a => a.userId.toString() === userId);
    if (alreadyAcked) {
      return res.json({ message: 'Already acknowledged', alert });
    }

    const user = await User.findById(userId).select('name profileEmoji');
    const { message = 'Got it, handling it!' } = req.body;

    // Add acknowledgment
    alert.acknowledgments.push({
      userId,
      userName: user?.name || 'Someone',
      userEmoji: user?.profileEmoji || '👤',
      message: message.slice(0, 200),
      acknowledgedAt: new Date()
    });

    // Update status — first acknowledgment changes to 'acknowledged'
    if (alert.status === 'active') {
      alert.status = 'acknowledged';
    }

    await alert.save();

    // Post acknowledgment message to relevant chats
    const circles = await CareCircle.find({
      ownerId: alert.userId,
      status: 'active',
      $or: [
        { memberId: userId },
        { ownerId: userId }
      ]
    });

    for (const circle of circles) {
      const ackMessage = new Message({
        circleId: circle._id,
        senderId: userId,
        senderName: user?.name || 'Someone',
        senderEmoji: user?.profileEmoji || '👤',
        text: `✅ ${user?.name || 'Someone'} acknowledged: "${message.slice(0, 100)}"`,
        type: 'acknowledgment',
        alertId: alert._id
      });
      await ackMessage.save();
    }

    // Push the acknowledgment to warrior + ALL circle members (not just those notified for original alert)
    const allCircles = await CareCircle.find({ ownerId: alert.userId, status: 'active' }).select('memberId');
    const allCircleMemberIds = allCircles.map(c => c.memberId.toString());
    const ackNotifyIds = [...new Set([alert.userId.toString(), ...allCircleMemberIds])].filter(id => id !== userId);
    const ackPushTitle = `✅ Alert Acknowledged`;
    const ackPushBody = `${user?.profileEmoji || ''} ${user?.name || 'Someone'}: "${message.slice(0, 80)}"`.trim();
    sendPushToUsersFiltered(ackNotifyIds, ackPushTitle, ackPushBody, {
      alertId: alert._id.toString(),
      type: 'acknowledgment',
    }, 'acknowledgments').catch(err => console.error('[Push] Ack notify error:', err));

    res.json({
      message: 'Alert acknowledged — everyone has been notified',
      alert,
      acknowledgedBy: {
        name: user?.name,
        emoji: user?.profileEmoji,
        message
      }
    });
  } catch (err) {
    console.error('Acknowledge alert error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/alerts/:id/resolve
// @desc    Resolve/close an alert
// @access  Private
router.post('/:id/resolve', auth, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    // Only the T1D owner can resolve
    if (alert.userId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Only the alert owner can resolve it' });
    }

    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    await alert.save();

    // Post resolve message to chats
    const user = await User.findById(req.user.userId).select('name profileEmoji');
    const circles = await CareCircle.find({
      ownerId: alert.userId,
      status: 'active'
    });

    for (const circle of circles) {
      const resolveMsg = new Message({
        circleId: circle._id,
        senderId: req.user.userId,
        senderName: '\u2705 Alert System',
        senderEmoji: '\u2705',
        text: `Alert resolved by ${user?.name || 'User'}: "${alert.title}"`,
        type: 'system',
        alertId: alert._id
      });
      await resolveMsg.save();
    }

    // Push "alert resolved" to all circle members (respects alertResolved pref)
    const resolveCircleMemberIds = circles.map(c => c.memberId.toString());
    const resolveNotifyIds = [...new Set(resolveCircleMemberIds)];
    if (resolveNotifyIds.length > 0) {
      const resolvePushTitle = '\u2705 Alert Resolved';
      const resolvePushBody = `${user?.name || 'User'} resolved: "${(alert.title || '').slice(0, 80)}"`;
      sendPushToUsersFiltered(resolveNotifyIds, resolvePushTitle, resolvePushBody, {
        alertId: alert._id.toString(),
        type: 'resolved',
      }, 'alertResolved').catch(err => console.error('[Push] Resolve notify error:', err));
    }

    res.json({ message: 'Alert resolved', alert });
  } catch (err) {
    console.error('Resolve alert error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
