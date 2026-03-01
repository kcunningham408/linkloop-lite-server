/**
 * dailyJobs.js
 * Scheduled tasks that run once per day:
 *   1. Supply countdown — decrement daysLeft, push when low
 *   2. Daily glucose summary — recap to circle members
 */

const cron = require('node-cron');
const User = require('../models/User');
const Supply = require('../models/Supply');
const GlucoseReading = require('../models/GlucoseReading');
const CareCircle = require('../models/CareCircle');
const { sendPushToUsers } = require('./pushNotifications');

// ── Supply countdown — runs daily at 8 AM UTC ─────────────────────
async function checkSupplyLevels() {
  console.log('[DailyJobs] Checking supply levels...');
  try {
    // Find all supplies with daysLeft > 0
    const supplies = await Supply.find({ daysLeft: { $gt: 0 } });

    for (const supply of supplies) {
      supply.daysLeft = Math.max(0, supply.daysLeft - 1);
      await supply.save();

      // Notify at 7 days, 3 days, 1 day, and 0 days
      if ([7, 3, 1, 0].includes(supply.daysLeft)) {
        const label = supply.daysLeft === 0
          ? `${supply.emoji || '📦'} ${supply.name} has run out!`
          : `${supply.emoji || '📦'} ${supply.name} — ${supply.daysLeft} day${supply.daysLeft !== 1 ? 's' : ''} left`;

        sendPushToUsers(
          [supply.userId.toString()],
          '📦 Supply Reminder',
          label,
          { type: 'supply_low', supplyId: supply._id.toString() }
        ).catch(err => console.error('[DailyJobs] Supply push error:', err.message));
      }
    }

    console.log(`[DailyJobs] Updated ${supplies.length} supply items.`);
  } catch (err) {
    console.error('[DailyJobs] Supply check error:', err.message);
  }
}

// ── Daily glucose summary — runs daily at 8 PM UTC ────────────────
async function sendDailySummaries() {
  console.log('[DailyJobs] Sending daily summaries...');
  try {
    // Find all warriors who have at least one active circle member
    const activeCircles = await CareCircle.find({ status: 'active' }).select('ownerId memberId');
    const warriorIds = [...new Set(activeCircles.map(c => c.ownerId.toString()))];

    for (const warriorId of warriorIds) {
      const warrior = await User.findById(warriorId).select('name settings');
      if (!warrior) continue;

      // Get today's readings (last 24h)
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const readings = await GlucoseReading.find({
        userId: warriorId,
        timestamp: { $gte: since },
      });

      if (readings.length === 0) continue; // nothing to report

      const values = readings.map(r => r.value);
      const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      const low = warrior.settings?.lowThreshold || 70;
      const high = warrior.settings?.highThreshold || 180;
      const inRange = values.filter(v => v >= low && v <= high).length;
      const tir = Math.round((inRange / values.length) * 100);
      const lowCount = values.filter(v => v < low).length;
      const highCount = values.filter(v => v > high).length;

      const summary = `📊 ${warrior.name}'s Daily Recap: ${tir}% in range, avg ${avg} mg/dL` +
        (lowCount > 0 ? `, ${lowCount} low${lowCount > 1 ? 's' : ''}` : '') +
        (highCount > 0 ? `, ${highCount} high${highCount > 1 ? 's' : ''}` : '') +
        ` (${readings.length} readings)`;

      // Get active circle members for this warrior
      const members = activeCircles
        .filter(c => c.ownerId.toString() === warriorId && c.memberId)
        .map(c => c.memberId.toString());

      // Also send to the warrior themselves
      const notifyIds = [...new Set([warriorId, ...members])];

      sendPushToUsers(
        notifyIds,
        `📊 Daily Recap — ${warrior.name}`,
        summary,
        { type: 'daily_summary' }
      ).catch(err => console.error(`[DailyJobs] Summary push error for ${warriorId}:`, err.message));
    }

    console.log(`[DailyJobs] Sent summaries for ${warriorIds.length} warrior(s).`);
  } catch (err) {
    console.error('[DailyJobs] Daily summary error:', err.message);
  }
}

// ── Start cron jobs ────────────────────────────────────────────────
function startDailyJobs() {
  // Supply countdown — 8 AM UTC (3 AM EST / 12 AM PST)
  cron.schedule('0 8 * * *', checkSupplyLevels);
  console.log('⏱  Supply countdown cron started (daily 8 AM UTC)');

  // Daily summary — 1 AM UTC (8 PM EST / 5 PM PST)
  cron.schedule('0 1 * * *', sendDailySummaries);
  console.log('⏱  Daily summary cron started (daily 1 AM UTC / 8 PM EST)');
}

module.exports = { startDailyJobs };
