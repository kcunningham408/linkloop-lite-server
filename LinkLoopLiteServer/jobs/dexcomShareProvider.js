/**
 * dexcomShareProvider.js
 *
 * Implements the Dexcom Share API — the same real-time feed used by the
 * Dexcom Follow app and apps like GlucoseBar / xDrip / Nightscout.
 *
 * Flow:
 *   username + password → accountId → sessionId → glucose readings (real-time, no delay)
 *
 * Reference: https://github.com/t1dtools/GlucoseBar  (DexcomShare.swift)
 *            https://github.com/gagebenne/pydexcom
 */

const axios = require('axios');
const bcrypt = require('bcryptjs');

// Hardcoded Dexcom application ID (public, used by all third-party apps)
const DEXCOM_APPLICATION_ID = 'd89443d2-327c-4a6f-89e5-496bbb0317db';

const SHARE_SERVERS = {
  us:  'https://share2.dexcom.com/ShareWebServices/Services',
  ous: 'https://shareous1.dexcom.com/ShareWebServices/Services',
};

const TREND_MAP = {
  None:             'stable',
  DoubleUp:         'rising_fast',
  SingleUp:         'rising',
  FortyFiveUp:      'rising',
  Flat:             'stable',
  FortyFiveDown:    'falling',
  SingleDown:       'falling',
  DoubleDown:       'falling_fast',
  'NOT COMPUTABLE': 'stable',
  'RATE OUT OF RANGE': 'stable',
};

const TREND_ARROW_MAP = {
  None:             '→',
  DoubleUp:         '↑↑',
  SingleUp:         '↑',
  FortyFiveUp:      '↗',
  Flat:             '→',
  FortyFiveDown:    '↘',
  SingleDown:       '↓',
  DoubleDown:       '↓↓',
  'NOT COMPUTABLE': '→',
  'RATE OUT OF RANGE': '→',
};

// ── Encrypt / decrypt password for storage ────────────────────────
// We use bcrypt hash for verification but store the raw password AES-encrypted
// so we can re-authenticate against Dexcom when the session expires.
// For simplicity we use a reversible XOR cipher keyed from JWT_SECRET.
// In production, swap for crypto.createCipheriv with AES-256-GCM.

function encryptPassword(plaintext) {
  const key = process.env.JWT_SECRET || 'linkloop-default-key';
  let result = '';
  for (let i = 0; i < plaintext.length; i++) {
    result += String.fromCharCode(plaintext.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return Buffer.from(result, 'binary').toString('base64');
}

function decryptPassword(encrypted) {
  const key = process.env.JWT_SECRET || 'linkloop-default-key';
  const raw = Buffer.from(encrypted, 'base64').toString('binary');
  let result = '';
  for (let i = 0; i < raw.length; i++) {
    result += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

// ── Step 1: username + password → accountId ───────────────────────
async function getAccountId(username, password, region = 'us') {
  const baseUrl = SHARE_SERVERS[region] || SHARE_SERVERS.us;
  const url = `${baseUrl}/General/AuthenticatePublisherAccount`;

  const response = await axios.post(url, {
    accountName:   username,
    password:      password,
    applicationId: DEXCOM_APPLICATION_ID,
  }, {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    timeout: 15000,
  });

  // Returns a quoted UUID string: "\"xxxxxxxx-xxxx-...\""
  const accountId = response.data.replace(/"/g, '').trim();
  if (!accountId || accountId.length < 10) {
    throw new Error('Invalid accountId returned from Dexcom Share');
  }
  return accountId;
}

// ── Step 2: accountId + password → sessionId ─────────────────────
async function getSessionId(accountId, password, region = 'us') {
  const baseUrl = SHARE_SERVERS[region] || SHARE_SERVERS.us;
  const url = `${baseUrl}/General/LoginPublisherAccountById`;

  const response = await axios.post(url, {
    accountId:     accountId,
    password:      password,
    applicationId: DEXCOM_APPLICATION_ID,
  }, {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    timeout: 15000,
  });

  const sessionId = response.data.replace(/"/g, '').trim();
  if (!sessionId || sessionId.length < 10) {
    throw new Error('Invalid sessionId returned from Dexcom Share');
  }
  return sessionId;
}

// ── Step 3: sessionId → real-time glucose readings ────────────────
// minutes: how far back to look (max 1440 = 24h)
// maxCount: max readings to return (288 = 24h at 5-min intervals)
async function fetchShareReadings(sessionId, region = 'us', minutes = 180, maxCount = 36) {
  const baseUrl = SHARE_SERVERS[region] || SHARE_SERVERS.us;
  const url = `${baseUrl}/Publisher/ReadPublisherLatestGlucoseValues`;

  const response = await axios.post(url, {
    sessionId,
    minutes,
    maxCount,
  }, {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    timeout: 15000,
  });

  return response.data || [];
}

// ── Parse raw Share records into our GlucoseReading shape ─────────
function parseShareRecords(records, userId) {
  const readings = [];

  for (const record of records) {
    const value = record.Value;
    if (value == null || value < 20 || value > 600) continue;

    // WT is a .NET JSON date: "/Date(1234567890000-0800)/" — extract only the ms part
    let timestamp;
    try {
      const ms = parseInt(record.WT.replace(/.*Date\((\d+)[^)]*\).*/, '$1'), 10);
      timestamp = new Date(ms);
    } catch {
      continue;
    }

    if (isNaN(timestamp.getTime())) continue;

    readings.push({
      userId,
      value:      Math.round(value),
      unit:       'mg/dL',
      trend:      TREND_MAP[record.Trend]       || 'stable',
      trendArrow: TREND_ARROW_MAP[record.Trend] || '→',
      source:     'dexcom',
      notes:      '',
      timestamp,
    });
  }

  return readings;
}

// ── Full sync for one user via Share API ──────────────────────────
// Returns { synced: N } on success, throws on hard error.
async function syncUserViaShare(user, GlucoseReading) {
  if (!user.dexcomShare?.connected || !user.dexcomShare?.username || !user.dexcomShare?.passwordEncrypted) {
    return null; // Not configured — caller should fall back to Individual Access API
  }

  const password = decryptPassword(user.dexcomShare.passwordEncrypted);
  const region   = user.dexcomShare.region || 'us';

  // Re-authenticate if we don't have a valid sessionId
  let { accountId, sessionId } = user.dexcomShare;

  if (!accountId) {
    console.log(`[DexcomShare] Getting accountId for user ${user._id}`);
    accountId = await getAccountId(user.dexcomShare.username, password, region);
    user.dexcomShare.accountId = accountId;
  }

  if (!sessionId) {
    console.log(`[DexcomShare] Getting sessionId for user ${user._id}`);
    sessionId = await getSessionId(accountId, password, region);
    user.dexcomShare.sessionId = sessionId;
  }

  // Fetch last 24h of readings — use full day window since Share API can return empty
  // for smaller windows intermittently. maxCount=288 = 24h at 5-min intervals.
  // Dedup below prevents double inserts.
  let rawRecords;
  try {
    rawRecords = await fetchShareReadings(sessionId, region, 1440, 288);
  } catch (err) {
    const code = err.response?.data?.Code;
    // Session expired — clear and retry once
    if (code === 'SessionIdNotFound' || code === 'SessionNotValid') {
      console.log(`[DexcomShare] Session expired for user ${user._id}, re-authenticating...`);
      user.dexcomShare.sessionId = null;
      sessionId = await getSessionId(accountId, password, region);
      user.dexcomShare.sessionId = sessionId;
      rawRecords = await fetchShareReadings(sessionId, region, 1440, 288);
    } else {
      throw err;
    }
  }

  // Empty result can also mean a silently-expired session — force re-auth once
  if (!rawRecords || rawRecords.length === 0) {
    console.log(`[DexcomShare] Empty result for user ${user._id}, forcing re-auth...`);
    user.dexcomShare.sessionId = null;
    sessionId = await getSessionId(accountId, password, region);
    user.dexcomShare.sessionId = sessionId;
    await user.save();
    rawRecords = await fetchShareReadings(sessionId, region, 1440, 288);
  }

  await user.save();

  if (!rawRecords || rawRecords.length === 0) {
    user.dexcomShare.lastSync = new Date();
    await user.save();
    return { synced: 0 };
  }

  // Dedup against existing readings — use 24h window to catch anything already stored
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await GlucoseReading.find({
    userId: user._id,
    source: 'dexcom',
    timestamp: { $gte: cutoff },
  }).select('timestamp');

  // Round timestamps to nearest second for comparison (Share has ms precision, DB may not)
  const existingSet = new Set(existing.map(r => {
    const d = new Date(r.timestamp);
    d.setMilliseconds(0);
    return d.toISOString();
  }));

  const newReadings = parseShareRecords(rawRecords, user._id)
    .filter(r => {
      const rounded = new Date(r.timestamp);
      rounded.setMilliseconds(0);
      return !existingSet.has(rounded.toISOString());
    });

  if (newReadings.length > 0) {
    await GlucoseReading.insertMany(newReadings);
  }

  user.dexcomShare.lastSync = new Date();
  await user.save();

  return { synced: newReadings.length };
}

module.exports = {
  encryptPassword,
  decryptPassword,
  getAccountId,
  getSessionId,
  fetchShareReadings,
  parseShareRecords,
  syncUserViaShare,
};
