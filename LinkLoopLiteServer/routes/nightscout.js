const express = require('express');
const axios = require('axios');
const auth = require('../middleware/auth');
const User = require('../models/User');
const GlucoseReading = require('../models/GlucoseReading');
const { checkGlucoseAlert } = require('../jobs/alertChecker');

const router = express.Router();

// ── Nightscout direction → LinkLoop trend mapping ────────────────────────────
const DIRECTION_MAP = {
  DoubleUp:       { trend: 'rising_fast',  arrow: '↑↑' },
  SingleUp:       { trend: 'rising',       arrow: '↑'  },
  FortyFiveUp:    { trend: 'rising',       arrow: '↗'  },
  Flat:           { trend: 'stable',       arrow: '→'  },
  FortyFiveDown:  { trend: 'falling',      arrow: '↘'  },
  SingleDown:     { trend: 'falling',      arrow: '↓'  },
  DoubleDown:     { trend: 'falling_fast', arrow: '↓↓' },
  'NOT COMPUTABLE': { trend: 'stable',     arrow: '→'  },
  'RATE OUT OF RANGE': { trend: 'stable',  arrow: '→'  },
};

function mapDirection(direction) {
  return DIRECTION_MAP[direction] || { trend: 'stable', arrow: '→' };
}

// Normalise the user-provided URL (strip trailing slash, ensure https)
function normalizeUrl(url) {
  let u = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

// ─── Connect ─────────────────────────────────────────────────────────────────
// @route   POST /api/nightscout/connect
// @desc    Save Nightscout URL + optional API secret, verify the site is reachable
router.post('/connect', auth, async (req, res) => {
  try {
    const { url, apiSecret } = req.body;
    if (!url) return res.status(400).json({ message: 'Nightscout URL is required' });

    const nsUrl = normalizeUrl(url);

    // Verify the site is reachable by hitting the status endpoint
    const headers = {};
    if (apiSecret) headers['api-secret'] = apiSecret;

    try {
      const check = await axios.get(`${nsUrl}/api/v1/status.json`, {
        headers,
        timeout: 10000,
      });
      if (!check.data || !check.data.status) {
        return res.status(400).json({ message: 'Site responded but does not look like a Nightscout instance' });
      }
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) {
        return res.status(401).json({ message: 'Nightscout returned 401 — check your API secret' });
      }
      return res.status(400).json({ message: 'Could not reach Nightscout site. Check the URL and try again.' });
    }

    // Save to user
    await User.findByIdAndUpdate(req.user.userId, {
      'nightscout.url': nsUrl,
      'nightscout.apiSecret': apiSecret || null,
      'nightscout.connected': true,
    });

    res.json({ message: 'Nightscout connected', url: nsUrl });
  } catch (err) {
    console.error('Nightscout connect error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Status ──────────────────────────────────────────────────────────────────
// @route   GET /api/nightscout/status
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('nightscout');
    if (!user?.nightscout?.connected) {
      return res.json({ connected: false });
    }
    res.json({
      connected: true,
      url: user.nightscout.url,
      lastSync: user.nightscout.lastSync,
    });
  } catch (err) {
    console.error('Nightscout status error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Sync ────────────────────────────────────────────────────────────────────
// @route   POST /api/nightscout/sync
// @desc    Fetch latest CGM entries from the user's Nightscout and save as GlucoseReadings
router.post('/sync', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('nightscout');
    if (!user?.nightscout?.connected || !user.nightscout.url) {
      return res.status(400).json({ message: 'Nightscout is not connected' });
    }

    const nsUrl = user.nightscout.url;
    const headers = {};
    if (user.nightscout.apiSecret) headers['api-secret'] = user.nightscout.apiSecret;

    // Fetch up to 36 most recent SGV entries (~3 hours of 5-min readings)
    const { data: entries } = await axios.get(`${nsUrl}/api/v1/entries/sgv.json`, {
      headers,
      params: { count: 36 },
      timeout: 15000,
    });

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.json({ message: 'No new readings', synced: 0 });
    }

    // Find the most recent existing nightscout reading to avoid duplicates
    const lastExisting = await GlucoseReading.findOne({
      userId: req.user.userId,
      source: 'nightscout',
    }).sort({ timestamp: -1 });

    const cutoff = lastExisting ? new Date(lastExisting.timestamp).getTime() : 0;

    // Build new readings (only those newer than our last saved one)
    const newReadings = [];
    for (const entry of entries) {
      const ts = entry.dateString ? new Date(entry.dateString) : new Date(entry.date);
      if (ts.getTime() <= cutoff) continue;

      const { trend, arrow } = mapDirection(entry.direction);
      newReadings.push({
        userId: req.user.userId,
        value: entry.sgv,
        trend,
        trendArrow: arrow,
        source: 'nightscout',
        timestamp: ts,
      });
    }

    if (newReadings.length > 0) {
      await GlucoseReading.insertMany(newReadings);

      // Auto-check alerts for the latest synced reading
      const latest = newReadings.reduce((a, b) => (new Date(a.timestamp) > new Date(b.timestamp) ? a : b));
      checkGlucoseAlert(req.user.userId, latest.value).catch(err =>
        console.error('[Nightscout] Alert check failed:', err.message));
    }

    // Update lastSync timestamp
    await User.findByIdAndUpdate(req.user.userId, {
      'nightscout.lastSync': new Date(),
    });

    const latestValue = newReadings.length > 0
      ? newReadings.reduce((a, b) => (new Date(a.timestamp) > new Date(b.timestamp) ? a : b)).value
      : null;

    res.json({ message: `Synced ${newReadings.length} readings`, synced: newReadings.length, latestValue });
  } catch (err) {
    console.error('Nightscout sync error:', err);
    if (err.response?.status === 401) {
      return res.status(401).json({ message: 'Nightscout returned 401 — your API secret may have changed' });
    }
    res.status(500).json({ message: 'Could not sync from Nightscout' });
  }
});

// ─── Disconnect ──────────────────────────────────────────────────────────────
// @route   DELETE /api/nightscout/disconnect
router.delete('/disconnect', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.userId, {
      'nightscout.url': null,
      'nightscout.apiSecret': null,
      'nightscout.connected': false,
      'nightscout.lastSync': null,
    });
    res.json({ message: 'Nightscout disconnected' });
  } catch (err) {
    console.error('Nightscout disconnect error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
