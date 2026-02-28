const express = require('express');
const auth = require('../middleware/auth');
const Alert = require('../models/Alert');
const CareCircle = require('../models/CareCircle');
const GlucoseReading = require('../models/GlucoseReading');
const Message = require('../models/Message');
const User = require('../models/User');
const { sendPushToUsersFiltered } = require('../jobs/pushNotifications');

const router = express.Router();

// ============================================================
// Alert thresholds
// ============================================================
const ALERT_THRESHOLDS = {
  urgent_low: 54,
  low: 70,
  high: 250,
  urgent_high: 300,
  rapid_change: 50 // mg/dL in 15 min
};

// ============================================================
// Helper: Build alert details from glucose value
// ============================================================
function buildAlertFromGlucose(value, userName, type) {
  const configs = {
    urgent_low: {
      severity: 'critical',
      title: `🚨 Very Low — ${userName}`,
      message: `${userName}'s glucose reading is ${value} mg/dL. You may want to check in with them.`
    },
    low: {
      severity: 'urgent',
      title: `📉 Low Reading — ${userName}`,
      message: `${userName}'s glucose is ${value} mg/dL (below their range). You may want to check in.`
    },
    high: {
      severity: 'warning',
      title: `📈 High Reading — ${userName}`,
      message: `${userName}'s glucose is ${value} mg/dL (above their range).`
    },
    urgent_high: {
      severity: 'urgent',
      title: `🚨 Very High — ${userName}`,
      message: `${userName}'s glucose is ${value} mg/dL. You may want to check in with them.`
    },
    rapid_drop: {
      severity: 'urgent',
      title: `⬇️ Dropping Fast — ${userName}`,
      message: `${userName}'s glucose is dropping quickly (now ${value} mg/dL).`
    },
    rapid_rise: {
      severity: 'warning',
      title: `⬆️ Rising Fast — ${userName}`,
      message: `${userName}'s glucose is rising quickly (now ${value} mg/dL).`
    }
  };
  return configs[type] || { severity: 'info', title: 'Notification', message: `Glucose reading: ${value} mg/dL` };
}

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

    const user = await User.findById(req.user.userId).select('name profileEmoji settings');
    const userName = user?.name || 'User';
    const low = user?.settings?.lowThreshold || ALERT_THRESHOLDS.low;
    const high = user?.settings?.highThreshold || ALERT_THRESHOLDS.high;

    // Determine alert type
    let alertType = null;
    if (glucoseValue <= ALERT_THRESHOLDS.urgent_low) alertType = 'urgent_low';
    else if (glucoseValue < low) alertType = 'low';
    else if (glucoseValue >= ALERT_THRESHOLDS.urgent_high) alertType = 'urgent_high';
    else if (glucoseValue > high) alertType = 'high';

    // Check for rapid changes (compare with previous reading)
    if (!alertType) {
      const prevReading = await GlucoseReading.findOne({
        userId: req.user.userId,
        timestamp: { $gte: new Date(Date.now() - 20 * 60 * 1000) } // last 20 min
      }).sort({ timestamp: -1 }).skip(1);

      if (prevReading) {
        const diff = glucoseValue - prevReading.value;
        if (diff <= -ALERT_THRESHOLDS.rapid_change) alertType = 'rapid_drop';
        else if (diff >= ALERT_THRESHOLDS.rapid_change) alertType = 'rapid_rise';
      }
    }

    if (!alertType) {
      return res.json({ alert: null, message: 'Glucose is in range, no alert needed' });
    }

    // Don't spam: Check if there's a recent active alert of the same type (within 30 min)
    const recentAlert = await Alert.findOne({
      userId: req.user.userId,
      type: alertType,
      status: { $in: ['active', 'acknowledged'] },
      createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) }
    });

    if (recentAlert) {
      return res.json({ alert: recentAlert, message: 'Alert already active' });
    }

    // Build the alert
    const alertConfig = buildAlertFromGlucose(glucoseValue, userName, alertType);

    // Find care circle members who should be notified
    const circleMembers = await CareCircle.find({
      ownerId: req.user.userId,
      status: 'active',
      $or: [
        { 'permissions.receiveLowAlerts': true },
        { 'permissions.receiveHighAlerts': true }
      ]
    }).populate('memberId', 'name profileEmoji');

    // Filter by alert type permissions
    const isLowType = ['low', 'urgent_low', 'rapid_drop'].includes(alertType);
    const isHighType = ['high', 'urgent_high', 'rapid_rise'].includes(alertType);
    const membersToNotify = circleMembers.filter(m => {
      if (isLowType && m.permissions.receiveLowAlerts) return true;
      if (isHighType && m.permissions.receiveHighAlerts) return true;
      // Urgent alerts go to everyone with low alerts enabled
      if (['urgent_low', 'urgent_high'].includes(alertType) && m.permissions.receiveLowAlerts) return true;
      return false;
    });

    const notifiedMembers = membersToNotify.map(m => ({
      userId: m.memberId._id,
      userName: m.memberId.name || m.memberName,
      notifiedAt: new Date()
    }));

    const alert = new Alert({
      userId: req.user.userId,
      userName,
      type: alertType,
      severity: alertConfig.severity,
      title: alertConfig.title,
      message: alertConfig.message,
      glucoseValue,
      notifiedMembers,
      status: 'active'
    });

    await alert.save();

    // Post alert message to each circle member's chat
    for (const member of membersToNotify) {
      const circle = member;
      const alertMessage = new Message({
        circleId: circle._id,
        senderId: req.user.userId,
        senderName: '🔔 LinkLoop',
        senderEmoji: '🔔',
        text: alertConfig.message,
        type: 'alert',
        alertId: alert._id
      });
      await alertMessage.save();
    }

    // Send push notifications to warrior + all notified members (respects glucoseAlerts pref)
    const memberUserIds = notifiedMembers.map(m => m.userId.toString());
    const allNotifyIds = [req.user.userId, ...memberUserIds];
    sendPushToUsersFiltered(allNotifyIds, alertConfig.title, alertConfig.message, {
      alertId: alert._id.toString(),
      type: 'alert',
      severity: alertConfig.severity,
    }, 'glucoseAlerts').catch(err => console.error('[Push] Alert notify error:', err));

    res.status(201).json({ alert, notifiedCount: notifiedMembers.length });
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
