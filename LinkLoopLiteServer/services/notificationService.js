const axios = require('axios');
require('dotenv').config();

// APNs credentials (stored in environment variables)
const APNS_KEY_ID = process.env.APNS_KEY_ID;
const APNS_TEAM_ID = process.env.APNS_TEAM_ID;
const APNS_KEY_PATH = process.env.APNS_KEY_PATH || './apns.p8';
const APNS_BUNDLE_ID = 'com.vibecmd.linkloop';

// Cache for JWT token
let cachedToken = null;
let tokenExpiry = 0;

async function getAPNsToken() {
  // Return cached token if still valid (tokens last ~60 mins)
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  if (!APNS_KEY_ID || !APNS_TEAM_ID) {
    console.log('[APNs] Credentials not configured - push notifications disabled');
    return null;
  }

  try {
    // Generate JWT for APNs authentication
    const jwt = require('jsonwebtoken');
    const fs = require('fs');
    
    // Read private key from file
    let privateKey;
    if (fs.existsSync(APNS_KEY_PATH)) {
      privateKey = fs.readFileSync(APNS_KEY_PATH);
    } else {
      console.log('[APNs] Private key file not found at:', APNS_KEY_PATH);
      return null;
    }

    const token = jwt.sign({}, privateKey, {
      algorithm: 'ES256',
      expiresIn: '60m',
      issuer: APNS_TEAM_ID,
      keyid: APNS_KEY_ID,
    });

    cachedToken = token;
    tokenExpiry = Date.now() + (55 * 60 * 1000); // Refresh 5 mins before expiry
    console.log('[APNs] Generated new auth token');
    return token;
  } catch (err) {
    console.error('[APNs] Failed to generate token:', err.message);
    return null;
  }
}

async function sendGlucosePushNotification(userId, glucoseValue, trend, timestamp) {
  const User = require('../models/User');
  const CareCircle = require('../models/CareCircle');

  try {
    // Find all members linked to this warrior
    const memberships = await CareCircle.find({
      ownerId: userId,
      status: 'active'
    }).populate('memberId', 'name watchPushToken pushPreferences');

    if (!memberships.length) {
      console.log(`[Push] No active members for user ${userId}`);
      return;
    }

    const authToken = await getAPNsToken();
    if (!authToken) {
      console.log('[Push] APNs not configured, skipping notification');
      return;
    }

    const trendArrow = getTrendArrow(trend);
    const pushPromises = [];

    for (const membership of memberships) {
      const member = membership.memberId;
      if (!member || !member.watchPushToken) continue;
      
      // Check if member has glucose alerts enabled
      if (member.pushPreferences && member.pushPreferences.glucoseAlerts === false) {
        console.log(`[Push] User ${member._id} has glucose alerts disabled`);
        continue;
      }

      const payload = {
        aps: {
          'content-available': 1, // Silent push - wakes the app
        },
        glucoseValue,
        glucoseTrend: trend,
        glucoseTrendArrow: trendArrow,
        glucoseTimestamp: timestamp,
        pushTime: Date.now(),
        type: 'glucose_update'
      };

      const pushPromise = sendAPNsPush(member.watchPushToken, payload);
      pushPromises.push(pushPromise);
      
      console.log(`[Push] Sending glucose push to member ${member._id} (${member.name}): ${glucoseValue} ${trendArrow}`);
    }

    await Promise.allSettled(pushPromises);
  } catch (err) {
    console.error('[Push] Error sending glucose notifications:', err);
  }
}

async function sendAPNsPush(deviceToken, payload) {
  const authToken = await getAPNsToken();
  if (!authToken) return;

  try {
    const response = await axios.post(
      `https://api.push.apple.com/3/device/${deviceToken}`,
      payload,
      {
        headers: {
          'apns-topic': `${APNS_BUNDLE_ID}.watch`,
          'apns-push-type': 'background',
          'apns-priority': '5',
          'authorization': `bearer ${authToken}`,
        },
        timeout: 10000,
      }
    );
    console.log(`[APNs] Push sent successfully`);
    return response.data;
  } catch (err) {
    if (err.response) {
      console.error(`[APNs] Push failed (${err.response.status}):`, err.response.data);
    } else {
      console.error(`[APNs] Push failed:`, err.message);
    }
    return null;
  }
}

function getTrendArrow(trend) {
  switch ((trend || '').toLowerCase()) {
    case 'rising':
    case 'risingfast':
    case 'rising_fast':
      return '↑';
    case 'risingslightly':
    case 'rising_slightly':
      return '↗';
    case 'falling':
    case 'fallingfast':
    case 'falling_fast':
      return '↓';
    case 'fallingslightly':
    case 'falling_slightly':
      return '↘';
    default:
      return '→';
  }
}

module.exports = {
  sendGlucosePushNotification,
  sendAPNsPush,
  getAPNsToken
};
