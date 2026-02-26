const express = require('express');
const auth = require('../middleware/auth');
const GlucoseReading = require('../models/GlucoseReading');
const CareCircle = require('../models/CareCircle');

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

    res.json({
      readings,
      latest: readings[0] || null,
      stats,
      ownerName: membership.memberName, // the name the warrior gave when inviting
    });
  } catch (err) {
    console.error('Member view glucose error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
