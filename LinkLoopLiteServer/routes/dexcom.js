const express = require('express');
const axios = require('axios');
const auth = require('../middleware/auth');
const User = require('../models/User');
const GlucoseReading = require('../models/GlucoseReading');

const router = express.Router();

// ── Dexcom API config ──────────────────────────────────────────────
const DEXCOM_CLIENT_ID     = process.env.DEXCOM_CLIENT_ID;
const DEXCOM_CLIENT_SECRET = process.env.DEXCOM_CLIENT_SECRET;
const DEXCOM_REDIRECT_URI  = process.env.DEXCOM_REDIRECT_URI;   // e.g. https://linkloop-server.onrender.com/api/dexcom/callback
const DEXCOM_USE_SANDBOX   = process.env.DEXCOM_USE_SANDBOX === 'true';

const DEXCOM_BASE = DEXCOM_USE_SANDBOX
  ? 'https://sandbox-api.dexcom.com'
  : 'https://api.dexcom.com';

// Map Dexcom trend strings → app trend values
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

// ── Helper: refresh the access token if expired ────────────────────
async function refreshTokenIfNeeded(user) {
  if (!user.dexcom?.refreshToken) return false;

  const now = new Date();
  // Refresh 5 minutes before expiry
  if (!user.dexcom.tokenExpiry) return true; // no expiry stored yet — assume still valid
  const expiryBuffer = new Date(user.dexcom.tokenExpiry);
  expiryBuffer.setMinutes(expiryBuffer.getMinutes() - 5);

  if (now < expiryBuffer) return true; // still valid

  try {
    const response = await axios.post(`${DEXCOM_BASE}/v3/oauth2/token`, new URLSearchParams({
      client_id:     DEXCOM_CLIENT_ID,
      client_secret: DEXCOM_CLIENT_SECRET,
      refresh_token: user.dexcom.refreshToken,
      grant_type:    'refresh_token',
    }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { access_token, refresh_token, expires_in } = response.data;

    user.dexcom.accessToken  = access_token;
    user.dexcom.refreshToken = refresh_token;
    user.dexcom.tokenExpiry  = new Date(Date.now() + expires_in * 1000);
    await user.save();

    return true;
  } catch (err) {
    console.error('Dexcom token refresh failed:', err.response?.data || err.message);
    // Mark as disconnected — user will need to re-auth
    user.dexcom.connected = false;
    user.dexcom.accessToken = null;
    user.dexcom.refreshToken = null;
    await user.save();
    return false;
  }
}

// ── 1.  GET /api/dexcom/auth  ──────────────────────────────────────
// Returns the Dexcom OAuth login URL the mobile app should open
router.get('/auth', auth, async (req, res) => {
  try {
    if (!DEXCOM_CLIENT_ID || !DEXCOM_REDIRECT_URI) {
      return res.status(500).json({ message: 'Dexcom integration not configured on server' });
    }

    const state = req.user.userId.toString(); // Pass userId as state so callback knows who it is

    const authUrl =
      `${DEXCOM_BASE}/v3/oauth2/login` +
      `?client_id=${encodeURIComponent(DEXCOM_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(DEXCOM_REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent('offline_access')}` +
      `&state=${encodeURIComponent(state)}`;

    res.json({ authUrl });
  } catch (err) {
    console.error('Dexcom auth URL error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── 2.  GET /api/dexcom/callback  ──────────────────────────────────
// Dexcom redirects here after user authorizes — exchanges code for tokens
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.send(buildCallbackPage(false, 'Authorization was denied. You can close this window.'));
    }

    if (!code || !state) {
      return res.status(400).send(buildCallbackPage(false, 'Missing authorization code.'));
    }

    // Validate state is a valid MongoDB ObjectId before doing anything
    if (!/^[a-f\d]{24}$/i.test(state)) {
      return res.status(400).send(buildCallbackPage(false, 'Invalid session. Please try connecting again from the app.'));
    }

    // Exchange code for tokens
    const tokenResponse = await axios.post(`${DEXCOM_BASE}/v3/oauth2/token`, new URLSearchParams({
      client_id:     DEXCOM_CLIENT_ID,
      client_secret: DEXCOM_CLIENT_SECRET,
      code,
      grant_type:    'authorization_code',
      redirect_uri:  DEXCOM_REDIRECT_URI,
    }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // state = userId
    const user = await User.findById(state);
    if (!user) {
      return res.status(404).send(buildCallbackPage(false, 'User not found. Please try again.'));
    }

    // Save tokens
    user.dexcom = {
      accessToken:  access_token,
      refreshToken: refresh_token,
      tokenExpiry:  new Date(Date.now() + expires_in * 1000),
      connected:    true,
      lastSync:     null,
    };
    await user.save();

    // Return a nice HTML page the user can close
    res.send(buildCallbackPage(true, 'Dexcom connected successfully! You can close this window and return to LinkLoop.'));
  } catch (err) {
    console.error('Dexcom callback error:', err.response?.data || err.message);
    res.status(500).send(buildCallbackPage(false, 'Could not connect Dexcom. Please try again.'));
  }
});

// ── 3.  GET /api/dexcom/status  ────────────────────────────────────
// Returns the current Dexcom connection status for the logged-in user
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      connected:   user.dexcom?.connected || false,
      lastSync:    user.dexcom?.lastSync || null,
      hasTokens:   !!(user.dexcom?.accessToken && user.dexcom?.refreshToken),
    });
  } catch (err) {
    console.error('Dexcom status error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── 4.  POST /api/dexcom/sync  ─────────────────────────────────────
// Fetches recent EGV data from Dexcom and saves as GlucoseReadings
router.post('/sync', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || !user.dexcom?.connected) {
      return res.status(400).json({ message: 'Dexcom not connected' });
    }

    // Refresh token if needed
    const tokenValid = await refreshTokenIfNeeded(user);
    if (!tokenValid) {
      return res.status(401).json({ message: 'Dexcom session expired. Please reconnect.' });
    }

    // Determine time range — always look back 3 hours to account for Dexcom
    // Individual Access API delay (~3h vs Follow app which uses direct push).
    // Dedup logic below prevents double inserts.
    const endDate = new Date();
    let startDate;

    if (user.dexcom.lastSync) {
      startDate = new Date(user.dexcom.lastSync);
      // Roll back 3 hours to account for Dexcom API delay
      startDate.setHours(startDate.getHours() - 3);
      // Don't go more than 24 hours back
      const maxLookback = new Date(endDate);
      maxLookback.setHours(maxLookback.getHours() - 24);
      if (startDate < maxLookback) startDate = maxLookback;
    } else {
      // First sync — last 3 hours
      startDate = new Date(endDate);
      startDate.setHours(startDate.getHours() - 3);
    }

    // Dexcom v3 requires exactly YYYY-MM-DDThh:mm:ss — no Z, no milliseconds
    const formatDate = (d) => d.toISOString().slice(0, 19);

    // Fetch EGVs from Dexcom
    const egvResponse = await axios.get(`${DEXCOM_BASE}/v3/users/self/egvs`, {
      params: {
        startDate: formatDate(startDate),
        endDate:   formatDate(endDate),
      },
      headers: {
        Authorization: `Bearer ${user.dexcom.accessToken}`,
      },
      timeout: 15000, // 15-second timeout — prevents infinite spinner
    });

    const records = egvResponse.data?.records || [];

    if (records.length === 0) {
      user.dexcom.lastSync = endDate;
      await user.save();
      return res.json({ message: 'No new readings found', synced: 0 });
    }

    // Get existing readings to avoid duplicates (by timestamp + source)
    const existingTimestamps = new Set();
    const existingReadings = await GlucoseReading.find({
      userId: user._id,
      source: 'dexcom',
      timestamp: { $gte: startDate },
    }).select('timestamp');
    existingReadings.forEach(r => existingTimestamps.add(r.timestamp.toISOString()));

    // Build new readings
    const newReadings = [];
    for (const record of records) {
      // Skip out-of-range readings (value is null when status is "high" or "low")
      const value = record.value;
      if (value == null || value < 20 || value > 600) continue;

      // Dexcom returns systemTime without Z — force UTC parse
      const rawTime = record.systemTime?.endsWith('Z') ? record.systemTime : record.systemTime + 'Z';
      const timestamp = new Date(rawTime);
      if (existingTimestamps.has(timestamp.toISOString())) continue;

      const trend     = TREND_MAP[record.trend]       || 'stable';
      const trendArrow = TREND_ARROW_MAP[record.trend] || '→';

      newReadings.push({
        userId:    user._id,
        value:     Math.round(value),
        unit:      'mg/dL',
        trend,
        trendArrow,
        source:    'dexcom',
        notes:     '',
        timestamp,
      });
    }

    // Bulk insert
    let synced = 0;
    if (newReadings.length > 0) {
      await GlucoseReading.insertMany(newReadings);
      synced = newReadings.length;
    }

    // Update last sync
    user.dexcom.lastSync = endDate;
    await user.save();

    res.json({
      message: `Synced ${synced} reading${synced !== 1 ? 's' : ''} from Dexcom`,
      synced,
      total: records.length,
    });
  } catch (err) {
    console.error('Dexcom sync error:', err.response?.data || err.message);

    if (err.response?.status === 401) {
      return res.status(401).json({ message: 'Dexcom session expired. Please reconnect.' });
    }

    res.status(500).json({ message: 'Failed to sync with Dexcom' });
  }
});

// ── 5.  POST /api/dexcom/disconnect  ───────────────────────────────
// Removes Dexcom tokens and marks as disconnected
router.post('/disconnect', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.dexcom = {
      accessToken:  null,
      refreshToken: null,
      tokenExpiry:  null,
      dexcomUserId: null,
      connected:    false,
      lastSync:     null,
    };
    await user.save();

    res.json({ message: 'Dexcom disconnected successfully' });
  } catch (err) {
    console.error('Dexcom disconnect error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Helper: build a simple HTML page for the callback redirect ─────
function buildCallbackPage(success, message) {
  const color   = success ? '#00D4AA' : '#FF6B6B';
  const icon    = success ? '✅' : '❌';
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LinkLoop — Dexcom</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #111111; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { text-align: center; background: #1C1C1E; border-radius: 16px; padding: 40px 30px; max-width: 400px; border: 1px solid #2C2C2E; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    .title { font-size: 22px; font-weight: bold; color: ${color}; margin-bottom: 12px; }
    .message { font-size: 16px; color: #A0A0A0; line-height: 1.5; }
    .brand { margin-top: 24px; font-size: 14px; color: #555; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <div class="title">${success ? 'Connected!' : 'Connection Failed'}</div>
    <div class="message">${message}</div>
    <div class="brand">∞ LinkLoop</div>
  </div>
</body>
</html>`;
}

module.exports = router;
