const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const CareCircle = require('../models/CareCircle');
const axios = require('axios');
require('dotenv').config();

const router = express.Router();

// APNs push notification endpoint for Apple Watch sync
// POST /api/push/register-watch
router.post('/register-watch', auth, async (req, res) => {
  try {
    const { watchPushToken, hasPairedWatch } = req.body;

    if (watchPushToken) {
      await User.findByIdAndUpdate(req.user.userId, { watchPushToken });
      console.log(`[Push] Registered watch APNs token for user ${req.user.userId}`);
    } else if (hasPairedWatch === false) {
      // User has unpaired their watch - clear the token
      await User.findByIdAndUpdate(req.user.userId, { watchPushToken: null });
      console.log(`[Push] Cleared watch APNs token for user ${req.user.userId}`);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Push] Register watch token error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get watch push notification settings
// GET /api/push/settings
router.get('/settings', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('watchPushToken pushPreferences');
    res.json({
      hasWatchToken: !!user.watchPushToken,
      pushPreferences: user.pushPreferences
    });
  } catch (err) {
    console.error('[Push] Get settings error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update push notification preferences
// PUT /api/push/preferences
router.put('/preferences', auth, async (req, res) => {
  try {
    const { glucoseAlerts, acknowledgments, alertResolved, newMessages, groupMessages, dailyInsights } = req.body;
    
    await User.findByIdAndUpdate(req.user.userId, {
      pushPreferences: {
        glucoseAlerts: glucoseAlerts !== undefined ? glucoseAlerts : true,
        acknowledgments: acknowledgments !== undefined ? acknowledgments : true,
        alertResolved: alertResolved !== undefined ? alertResolved : true,
        newMessages: newMessages !== undefined ? newMessages : true,
        groupMessages: groupMessages !== undefined ? groupMessages : true,
        dailyInsights: dailyInsights !== undefined ? dailyInsights : true
      }
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('[Push] Update preferences error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
