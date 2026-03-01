/**
 * dexcomSync.js
 * Background cron job — runs every 5 minutes, syncs all connected Dexcom users.
 */

const cron   = require('node-cron');
const axios  = require('axios');
const User   = require('../models/User');
const GlucoseReading = require('../models/GlucoseReading');
const { syncUserViaShare } = require('./dexcomShareProvider');
const { checkGlucoseAlert } = require('./alertChecker');

const DEXCOM_CLIENT_ID     = process.env.DEXCOM_CLIENT_ID;
const DEXCOM_CLIENT_SECRET = process.env.DEXCOM_CLIENT_SECRET;
const DEXCOM_USE_SANDBOX   = process.env.DEXCOM_USE_SANDBOX === 'true';

const DEXCOM_BASE = DEXCOM_USE_SANDBOX
  ? 'https://sandbox-api.dexcom.com'
  : 'https://api.dexcom.com';

// Dexcom v3 requires exactly YYYY-MM-DDThh:mm:ss — no Z, no milliseconds
const formatDate = (d) => d.toISOString().slice(0, 19);

const TREND_MAP = {
  doubleUp:       'rising_fast',
  singleUp:       'rising',
  fortyFiveUp:    'rising',
  flat:           'stable',
  fortyFiveDown:  'falling',
  singleDown:     'falling',
  doubleDown:     'falling_fast',
  none:           'stable',
  notComputable:  'stable',
  rateOutOfRange: 'stable',
  unknown:        'stable',
};

const TREND_ARROW_MAP = {
  doubleUp:       '↑↑',
  singleUp:       '↑',
  fortyFiveUp:    '↗',
  flat:           '→',
  fortyFiveDown:  '↘',
  singleDown:     '↓',
  doubleDown:     '↓↓',
  none:           '→',
  notComputable:  '→',
  rateOutOfRange: '→',
  unknown:        '→',
};

// ── Refresh token if expired ───────────────────────────────────────
async function refreshTokenIfNeeded(user) {
  if (!user.dexcom?.refreshToken) return false;
  if (!user.dexcom.tokenExpiry) return true; // no expiry stored — assume valid

  const now          = new Date();
  const expiryBuffer = new Date(user.dexcom.tokenExpiry);
  expiryBuffer.setMinutes(expiryBuffer.getMinutes() - 5);
  if (now < expiryBuffer) return true; // still valid

  try {
    const response = await axios.post(
      `${DEXCOM_BASE}/v3/oauth2/token`,
      new URLSearchParams({
        client_id:     DEXCOM_CLIENT_ID,
        client_secret: DEXCOM_CLIENT_SECRET,
        refresh_token: user.dexcom.refreshToken,
        grant_type:    'refresh_token',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    user.dexcom.accessToken  = access_token;
    user.dexcom.refreshToken = refresh_token;
    user.dexcom.tokenExpiry  = new Date(Date.now() + expires_in * 1000);
    await user.save();
    return true;
  } catch (err) {
    console.error(`[DexcomSync] Token refresh failed for user ${user._id}:`, err.response?.data || err.message);
    user.dexcom.connected    = false;
    user.dexcom.accessToken  = null;
    user.dexcom.refreshToken = null;
    await user.save();
    return false;
  }
}

// ── Sync one user ──────────────────────────────────────────────────
async function syncUser(user) {
  // ── Try Dexcom Share first (real-time, no delay) ──────────────
  if (user.dexcomShare?.connected) {
    try {
      const result = await syncUserViaShare(user, GlucoseReading);
      if (result !== null) {
        if (result.synced > 0) {
          console.log(`[DexcomShare] Synced ${result.synced} new reading(s) for user ${user._id}`);
          // Auto-check alerts for the latest reading
          if (result.latestValue) {
            checkGlucoseAlert(user._id, result.latestValue).catch(err =>
              console.error(`[DexcomShare] Alert check failed for user ${user._id}:`, err.message));
          }
        }
        return; // Share succeeded — skip Individual Access API
      }
    } catch (err) {
      console.error(`[DexcomShare] Sync failed for user ${user._id}:`, err.response?.data || err.message);
      // Fall through to Individual Access API below
    }
  }

  // ── Fall back to Individual Access API (OAuth, ~3h delay) ─────
  const tokenValid = await refreshTokenIfNeeded(user);
  if (!tokenValid) {
    console.log(`[DexcomSync] Skipping user ${user._id} — token invalid/expired`);
    return;
  }

  const endDate = new Date();
  let startDate;

  // Dexcom Individual Access API has a ~3-hour data delay vs the Follow app
  // (Follow uses direct push; the pull API lags behind). Always look back 3 hours
  // so we never miss readings. Dedup logic below prevents double inserts.
  if (user.dexcom.lastSync) {
    startDate = new Date(user.dexcom.lastSync);
    // Always roll back 3 hours to account for Dexcom API delay
    startDate.setHours(startDate.getHours() - 3);
    // Don't look back more than 24 hours
    const maxLookback = new Date(endDate);
    maxLookback.setHours(maxLookback.getHours() - 24);
    if (startDate < maxLookback) startDate = maxLookback;
  } else {
    // First auto-sync — last 3 hours
    startDate = new Date(endDate);
    startDate.setHours(startDate.getHours() - 3);
  }

  try {
    const startStr = formatDate(startDate);
    const endStr   = formatDate(endDate);
    console.log(`[DexcomSync] user ${user._id} querying ${startStr} → ${endStr}`);

    const egvResponse = await axios.get(`${DEXCOM_BASE}/v3/users/self/egvs`, {
      params: { startDate: startStr, endDate: endStr },
      headers: { Authorization: `Bearer ${user.dexcom.accessToken}` },
    });

    const records = egvResponse.data?.records || [];
    console.log(`[DexcomSync] user ${user._id} got ${records.length} record(s) from Dexcom`);
    if (records.length === 0) {
      user.dexcom.lastSync = endDate;
      await user.save();
      return;
    }

    // Dedup against existing readings
    const existingReadings = await GlucoseReading.find({
      userId: user._id,
      source: 'dexcom',
      timestamp: { $gte: startDate },
    }).select('timestamp');
    const existingTimestamps = new Set(existingReadings.map(r => r.timestamp.toISOString()));

    const newReadings = [];
    for (const record of records) {
      const value = record.value;
      if (value == null || value < 20 || value > 600) continue;

      // Dexcom returns systemTime without Z — force UTC parse
      const rawTime  = record.systemTime?.endsWith('Z') ? record.systemTime : record.systemTime + 'Z';
      const timestamp = new Date(rawTime);
      if (existingTimestamps.has(timestamp.toISOString())) continue;

      newReadings.push({
        userId:    user._id,
        value:     Math.round(value),
        unit:      'mg/dL',
        trend:     TREND_MAP[record.trend]       || 'stable',
        trendArrow: TREND_ARROW_MAP[record.trend] || '→',
        source:    'dexcom',
        notes:     '',
        timestamp,
      });
    }

    if (newReadings.length > 0) {
      await GlucoseReading.insertMany(newReadings);
      console.log(`[DexcomSync] Synced ${newReadings.length} new reading(s) for user ${user._id}`);
      // Auto-check alerts for the most recent synced reading
      const latest = newReadings.reduce((a, b) => (new Date(a.timestamp) > new Date(b.timestamp) ? a : b));
      checkGlucoseAlert(user._id, latest.value).catch(err =>
        console.error(`[DexcomSync] Alert check failed for user ${user._id}:`, err.message));
    }

    user.dexcom.lastSync = endDate;
    user.lastActive = endDate; // track overall last sync as activity
    await user.save();

  } catch (err) {
    console.error(`[DexcomSync] Sync failed for user ${user._id}:`, err.response?.data || err.message);
  }
}

// ── Main cron job — every 5 minutes ───────────────────────────────
function startDexcomSyncJob() {
  cron.schedule('*/5 * * * *', async () => {
    console.log('[DexcomSync] Running scheduled sync...');
    try {
      // Find all users with either Dexcom connection active
      const users = await User.find({
        $or: [
          { 'dexcom.connected': true },
          { 'dexcomShare.connected': true },
        ]
      });
      if (users.length === 0) {
        console.log('[DexcomSync] No connected users, skipping.');
        return;
      }
      console.log(`[DexcomSync] Syncing ${users.length} user(s)...`);
      await Promise.allSettled(users.map(syncUser));
      console.log('[DexcomSync] Scheduled sync complete.');
    } catch (err) {
      console.error('[DexcomSync] Cron job error:', err.message);
    }
  });

  console.log('⏱  Dexcom auto-sync cron job started (every 5 minutes)');
}

module.exports = { startDexcomSyncJob };
