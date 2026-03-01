const express = require('express');
const auth = require('../middleware/auth');
const GlucoseReading = require('../models/GlucoseReading');
const CareCircle = require('../models/CareCircle');
const User = require('../models/User');

const router = express.Router();

// @route   POST /api/glucose
router.post('/', auth, async (req, res) => {
  try {
    const { value, trend, trendArrow, source, notes } = req.body;

    const reading = new GlucoseReading({
      userId: req.user.userId,
      value,
      trend,
      trendArrow,
      source,
      notes
    });

    await reading.save();
    res.status(201).json({ message: 'Reading saved', reading });
  } catch (err) {
    console.error('Add glucose error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/glucose
router.get('/', auth, async (req, res) => {
  try {
    const { hours = 24, limit = 100 } = req.query;

    const since = new Date();
    since.setHours(since.getHours() - parseInt(hours));

    const readings = await GlucoseReading.find({
      userId: req.user.userId,
      timestamp: { $gte: since }
    })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json(readings);
  } catch (err) {
    console.error('Get glucose error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/glucose/latest
router.get('/latest', auth, async (req, res) => {
  try {
    const reading = await GlucoseReading.findOne({ userId: req.user.userId })
      .sort({ timestamp: -1 });

    if (!reading) {
      return res.status(404).json({ message: 'No readings found' });
    }
    res.json(reading);
  } catch (err) {
    console.error('Get latest glucose error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/glucose/stats
router.get('/stats', auth, async (req, res) => {
  try {
    const { hours = 24 } = req.query;

    const since = new Date();
    since.setHours(since.getHours() - parseInt(hours));

    const readings = await GlucoseReading.find({
      userId: req.user.userId,
      timestamp: { $gte: since }
    });

    if (readings.length === 0) {
      return res.json({ count: 0, average: null, timeInRange: null, high: null, low: null });
    }

    const values = readings.map(r => r.value);
    const average = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    const inRange = values.filter(v => v >= 70 && v <= 180).length;
    const timeInRange = Math.round((inRange / values.length) * 100);
    const highCount = values.filter(v => v > 180).length;
    const lowCount = values.filter(v => v < 70).length;

    res.json({
      count: readings.length,
      average,
      timeInRange,
      high: highCount,
      low: lowCount,
      min: Math.min(...values),
      max: Math.max(...values)
    });
  } catch (err) {
    console.error('Get glucose stats error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Glucose Export ──────────────────────────────────────────────────────────
// @route   GET /api/glucose/export
// @desc    Export glucose readings as CSV (for doctor visits)
// @access  Private
router.get('/export', auth, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const readings = await GlucoseReading.find({
      userId: req.user.userId,
      timestamp: { $gte: since },
    }).sort({ timestamp: 1 });

    // Build CSV
    const header = 'Date,Time,Glucose (mg/dL),Trend,Source,Notes';
    const rows = readings.map(r => {
      const d = new Date(r.timestamp);
      const date = d.toLocaleDateString('en-US');
      const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const notes = (r.notes || '').replace(/,/g, ';').replace(/\n/g, ' ');
      return `${date},${time},${r.value},${r.trend || ''},${r.source || ''},${notes}`;
    });

    const csv = [header, ...rows].join('\n');

    res.json({
      csv,
      count: readings.length,
      days: parseInt(days),
      generated: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Export glucose error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Loop Member View ────────────────────────────────────────────────────────
// Loop Members can read their linked warrior's glucose data.
// Verifies the caller has an active CareCircle entry for this owner.

// @route   GET /api/glucose/member-view/:ownerId
router.get('/member-view/:ownerId', auth, async (req, res) => {
  try {
    const { ownerId } = req.params;
    const { hours = 24, limit = 100 } = req.query;

    // Confirm caller is an active member of this warrior's circle
    const membership = await CareCircle.findOne({
      ownerId,
      memberId: req.user.userId,
      status: 'active'
    });

    if (!membership) {
      return res.status(403).json({ message: 'Not a member of this loop' });
    }

    // Check the owner's sharing preference
    if (membership.permissions && membership.permissions.viewGlucose === false) {
      return res.status(403).json({ message: 'Owner has restricted glucose sharing' });
    }

    const since = new Date();
    since.setHours(since.getHours() - parseInt(hours));

    const readings = await GlucoseReading.find({
      userId: ownerId,
      timestamp: { $gte: since }
    })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    // Compute stats inline
    const values = readings.map(r => r.value);
    const stats = values.length === 0 ? null : {
      count: values.length,
      average: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      timeInRange: Math.round((values.filter(v => v >= 70 && v <= 180).length / values.length) * 100),
      high: values.filter(v => v > 180).length,
      low: values.filter(v => v < 70).length,
      min: Math.min(...values),
      max: Math.max(...values),
    };

    // Get the warrior's actual name + activity info
    const owner = await User.findById(ownerId).select('name lastActive dexcom.lastSync dexcomShare.lastSync nightscout.lastSync');

    // Pick the most recent sync across all CGM sources
    const syncDates = [owner?.dexcom?.lastSync, owner?.dexcomShare?.lastSync, owner?.nightscout?.lastSync].filter(Boolean);
    const lastCGMSync = syncDates.length > 0 ? new Date(Math.max(...syncDates.map(d => new Date(d).getTime()))) : null;

    res.json({
      readings,
      latest: readings[0] || null,
      stats,
      ownerName: owner?.name || 'Warrior',
      lastActive: owner?.lastActive || null,
      lastCGMSync,
    });
  } catch (err) {
    console.error('Member view glucose error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
