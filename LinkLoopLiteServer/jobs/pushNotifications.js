const { Expo } = require('expo-server-sdk');
const User = require('../models/User');

const expo = new Expo();

/**
 * Send push notifications to a list of user IDs.
 * Fetches their stored pushTokens, filters valid ones, and sends.
 *
 * @param {string[]} userIds     - Array of MongoDB user _id strings
 * @param {string}   title       - Notification title
 * @param {string}   body        - Notification body
 * @param {object}   data        - Extra data payload (e.g. { alertId, type })
 */
async function sendPushToUsers(userIds, title, body, data = {}) {
  if (!userIds || userIds.length === 0) return;

  try {
    const users = await User.find({
      _id: { $in: userIds },
      pushToken: { $ne: null, $exists: true }
    }).select('pushToken name');

    const tokens = users
      .map(u => u.pushToken)
      .filter(t => Expo.isExpoPushToken(t));

    if (tokens.length === 0) {
      console.log('[Push] No valid push tokens found for userIds:', userIds);
      return;
    }

    await sendPushToTokens(tokens, title, body, data);
  } catch (err) {
    console.error('[Push] sendPushToUsers error:', err);
  }
}

/**
 * Send push notifications ONLY to users who have the given preference enabled.
 * Falls back to sendPushToUsers if no category is specified.
 *
 * @param {string[]} userIds   - Array of MongoDB user _id strings
 * @param {string}   title     - Notification title
 * @param {string}   body      - Notification body
 * @param {object}   data      - Extra data payload
 * @param {string}   category  - pushPreferences key: glucoseAlerts, acknowledgments, alertResolved, newMessages, groupMessages
 */
async function sendPushToUsersFiltered(userIds, title, body, data = {}, category = null) {
  if (!userIds || userIds.length === 0) return;

  try {
    const query = {
      _id: { $in: userIds },
      pushToken: { $ne: null, $exists: true }
    };

    // If a category is provided, only send to users who have that preference ON
    if (category) {
      query[`pushPreferences.${category}`] = { $ne: false }; // default is true, so $ne: false covers both true and undefined
    }

    const users = await User.find(query).select('pushToken name');

    const tokens = users
      .map(u => u.pushToken)
      .filter(t => Expo.isExpoPushToken(t));

    if (tokens.length === 0) {
      console.log(`[Push] No valid tokens for category "${category}" among ${userIds.length} users`);
      return;
    }

    console.log(`[Push] Sending "${category || 'unfiltered'}" push to ${tokens.length}/${userIds.length} users`);
    await sendPushToTokens(tokens, title, body, data);
  } catch (err) {
    console.error('[Push] sendPushToUsersFiltered error:', err);
  }
}

/**
 * Send push notifications directly to a list of Expo push tokens.
 *
 * @param {string[]} tokens  - Array of Expo push token strings
 * @param {string}   title   - Notification title
 * @param {string}   body    - Notification body
 * @param {object}   data    - Extra data payload
 */
async function sendPushToTokens(tokens, title, body, data = {}) {
  if (!tokens || tokens.length === 0) return;

  const validTokens = tokens.filter(t => Expo.isExpoPushToken(t));
  if (validTokens.length === 0) {
    console.log('[Push] No valid Expo push tokens in list');
    return;
  }

  const messages = validTokens.map(token => ({
    to: token,
    sound: 'default',
    title,
    body,
    data,
    priority: data.priority || 'high',
    channelId: data.channelId || 'alerts',
  }));

  const chunks = expo.chunkPushNotifications(messages);
  const receipts = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      receipts.push(...ticketChunk);
      console.log(`[Push] Sent ${chunk.length} notifications`);
    } catch (err) {
      console.error('[Push] Chunk send error:', err);
    }
  }

  // Log any errors from tickets
  for (const ticket of receipts) {
    if (ticket.status === 'error') {
      console.error(`[Push] Ticket error: ${ticket.message}`);
      if (ticket.details?.error === 'DeviceNotRegistered') {
        // Could clean up stale token here in the future
        console.warn('[Push] DeviceNotRegistered — token may be stale');
      }
    }
  }
}

module.exports = { sendPushToUsers, sendPushToUsersFiltered, sendPushToTokens };
