/**
 * alertChecker.js
 * Shared helper — evaluates a glucose value for a user and creates alerts
 * if thresholds are breached.  Called by:
 *   • dexcomSync cron job (after syncing new readings)
 *   • nightscout sync route (after inserting new readings)
 *   • POST /api/alerts/check route (manual & app-triggered)
 */

const Alert           = require('../models/Alert');
const CareCircle      = require('../models/CareCircle');
const GlucoseReading  = require('../models/GlucoseReading');
const Message         = require('../models/Message');
const User            = require('../models/User');
const { sendPushToUsersFiltered } = require('./pushNotifications');

// ── Thresholds ─────────────────────────────────────────────────────
const ALERT_THRESHOLDS = {
  urgent_low: 54,
  low: 70,
  high: 250,
  urgent_high: 300,
  rapid_change: 50, // mg/dL in 15 min
};

// ── Build alert copy ───────────────────────────────────────────────
function buildAlertFromGlucose(value, userName, type) {
  const configs = {
    urgent_low: {
      severity: 'critical',
      title: `🚨 Very Low — ${userName}`,
      message: `${userName}'s glucose reading is ${value} mg/dL. You may want to check in with them.`,
    },
    low: {
      severity: 'urgent',
      title: `📉 Low Reading — ${userName}`,
      message: `${userName}'s glucose is ${value} mg/dL (below their range). You may want to check in.`,
    },
    high: {
      severity: 'warning',
      title: `📈 High Reading — ${userName}`,
      message: `${userName}'s glucose is ${value} mg/dL (above their range).`,
    },
    urgent_high: {
      severity: 'urgent',
      title: `🚨 Very High — ${userName}`,
      message: `${userName}'s glucose is ${value} mg/dL. You may want to check in with them.`,
    },
    rapid_drop: {
      severity: 'urgent',
      title: `⬇️ Dropping Fast — ${userName}`,
      message: `${userName}'s glucose is dropping quickly (now ${value} mg/dL).`,
    },
    rapid_rise: {
      severity: 'warning',
      title: `⬆️ Rising Fast — ${userName}`,
      message: `${userName}'s glucose is rising quickly (now ${value} mg/dL).`,
    },
  };
  return configs[type] || { severity: 'info', title: 'Notification', message: `Glucose reading: ${value} mg/dL` };
}

// ── Sustained high check ───────────────────────────────────────────
/**
 * Returns true if glucose has been continuously above `threshold`
 * for at least `delayMinutes` based on stored readings.
 */
async function isSustainedHigh(userId, threshold, delayMinutes) {
  if (!delayMinutes || delayMinutes <= 0) return true; // no delay = immediate

  const since = new Date(Date.now() - delayMinutes * 60 * 1000);
  const readings = await GlucoseReading.find({
    userId,
    timestamp: { $gte: since },
  }).sort({ timestamp: 1 }); // oldest first

  // Need at least 2 readings in the window to confirm sustained
  if (readings.length < 2) return false;

  // Every reading in the window must be above the threshold
  return readings.every(r => r.value > threshold);
}

// ── Main function ──────────────────────────────────────────────────
/**
 * Evaluate a glucose value and create / notify if thresholds breached.
 * @param {string} userId   The warrior's _id
 * @param {number} glucoseValue  mg/dL
 * @returns {object|null}  The created Alert doc, or null if no alert needed.
 */
async function checkGlucoseAlert(userId, glucoseValue) {
  try {
    const user = await User.findById(userId).select('name profileEmoji settings');
    if (!user) return null;

    const userName = user.name || 'User';
    const low  = user.settings?.lowThreshold  || ALERT_THRESHOLDS.low;
    const high = user.settings?.highThreshold || ALERT_THRESHOLDS.high;

    // Determine alert type
    let alertType = null;
    if (glucoseValue <= ALERT_THRESHOLDS.urgent_low) alertType = 'urgent_low';
    else if (glucoseValue < low) alertType = 'low';
    else if (glucoseValue >= ALERT_THRESHOLDS.urgent_high) alertType = 'urgent_high';
    else if (glucoseValue > high) alertType = 'high';

    // For standard highs, check if the warrior has a delay requirement.
    // If so, only create the alert if glucose has been sustained above their threshold.
    if (alertType === 'high') {
      const warriorDelay = user.settings?.highAlertDelay || 0;
      if (warriorDelay > 0) {
        const sustained = await isSustainedHigh(userId, high, warriorDelay);
        if (!sustained) {
          // Not sustained long enough — skip this alert entirely
          alertType = null;
        }
      }
    }

    // Check for rapid changes
    if (!alertType) {
      const prevReading = await GlucoseReading.findOne({
        userId,
        timestamp: { $gte: new Date(Date.now() - 20 * 60 * 1000) },
      }).sort({ timestamp: -1 }).skip(1);

      if (prevReading) {
        const diff = glucoseValue - prevReading.value;
        if (diff <= -ALERT_THRESHOLDS.rapid_change) alertType = 'rapid_drop';
        else if (diff >= ALERT_THRESHOLDS.rapid_change) alertType = 'rapid_rise';
      }
    }

    if (!alertType) return null;

    // Anti-spam: skip if same type alert active within 30 min
    const recentAlert = await Alert.findOne({
      userId,
      type: alertType,
      status: { $in: ['active', 'acknowledged'] },
      createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) },
    });
    if (recentAlert) return recentAlert;

    // Build alert
    const alertConfig = buildAlertFromGlucose(glucoseValue, userName, alertType);

    // Find circle members to notify
    const circleMembers = await CareCircle.find({
      ownerId: userId,
      status: 'active',  // skip 'paused' members
      $or: [
        { 'permissions.receiveLowAlerts': true },
        { 'permissions.receiveHighAlerts': true },
      ],
    }).populate('memberId', 'name profileEmoji settings');

    const isLowType  = ['low', 'urgent_low', 'rapid_drop'].includes(alertType);
    const isHighType = ['high', 'urgent_high', 'rapid_rise'].includes(alertType);

    // Each member may have their own alert thresholds and high-alert delay.
    // Only notify them if the glucose value actually breaches THEIR thresholds
    // and (for highs) has been sustained long enough per THEIR delay setting.
    const membersToNotify = [];
    for (const m of circleMembers) {
      // Check permission toggles first
      if (isLowType && !m.permissions.receiveLowAlerts) continue;
      if (isHighType && !m.permissions.receiveHighAlerts) continue;
      if (['urgent_low', 'urgent_high'].includes(alertType) && !m.permissions.receiveLowAlerts) continue;

      // Now check against the member's personal thresholds
      const memberLow  = m.memberId?.settings?.lowThreshold  || ALERT_THRESHOLDS.low;
      const memberHigh = m.memberId?.settings?.highThreshold || ALERT_THRESHOLDS.high;

      // Urgent levels always notify (safety-critical)
      if (glucoseValue <= ALERT_THRESHOLDS.urgent_low) { membersToNotify.push(m); continue; }
      if (glucoseValue >= ALERT_THRESHOLDS.urgent_high) { membersToNotify.push(m); continue; }

      // Rapid changes always notify if permission is on
      if (['rapid_drop', 'rapid_rise'].includes(alertType)) { membersToNotify.push(m); continue; }

      // Standard low — immediate, check member's threshold
      if (isLowType && glucoseValue < memberLow) { membersToNotify.push(m); continue; }

      // Standard high — check member's threshold AND their personal delay
      if (isHighType && glucoseValue > memberHigh) {
        const memberDelay = m.memberId?.settings?.highAlertDelay || 0;
        if (memberDelay > 0) {
          const sustained = await isSustainedHigh(userId, memberHigh, memberDelay);
          if (!sustained) continue; // not sustained long enough for this member
        }
        membersToNotify.push(m);
        continue;
      }
    }

    const notifiedMembers = membersToNotify.map((m) => ({
      userId: m.memberId._id,
      userName: m.memberId.name || m.memberName,
      notifiedAt: new Date(),
    }));

    const alert = new Alert({
      userId,
      userName,
      type: alertType,
      severity: alertConfig.severity,
      title: alertConfig.title,
      message: alertConfig.message,
      glucoseValue,
      notifiedMembers,
      status: 'active',
    });
    await alert.save();

    // Post alert message to each member's chat
    for (const member of membersToNotify) {
      const alertMessage = new Message({
        circleId: member._id,
        senderId: userId,
        senderName: '🔔 LinkLoop',
        senderEmoji: '🔔',
        text: alertConfig.message,
        type: 'alert',
        alertId: alert._id,
      });
      await alertMessage.save();
    }

    // Push notifications (respects glucoseAlerts pref)
    const memberUserIds = notifiedMembers.map((m) => m.userId.toString());
    const allNotifyIds  = [userId.toString(), ...memberUserIds];
    sendPushToUsersFiltered(allNotifyIds, alertConfig.title, alertConfig.message, {
      alertId: alert._id.toString(),
      type: 'alert',
      severity: alertConfig.severity,
    }, 'glucoseAlerts').catch((err) => console.error('[Push] Alert notify error:', err));

    console.log(`[AlertChecker] Created ${alertType} alert for user ${userId} (${glucoseValue} mg/dL)`);
    return alert;
  } catch (err) {
    console.error(`[AlertChecker] Error for user ${userId}:`, err.message);
    return null;
  }
}

module.exports = { checkGlucoseAlert };
