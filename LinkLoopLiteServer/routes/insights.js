const express = require('express');
const auth = require('../middleware/auth');
const GlucoseReading = require('../models/GlucoseReading');
const MoodEntry = require('../models/MoodEntry');
const User = require('../models/User');
const Groq = require('groq-sdk');

const router = express.Router();

// ============================================================
// TIMEZONE HELPERS — Convert UTC dates to user's local time
// ============================================================
function getLocalHour(timestamp, tz) {
  try {
    const s = new Date(timestamp).toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
    return parseInt(s, 10);
  } catch {
    return new Date(timestamp).getHours();
  }
}

function formatLocalTime(timestamp, tz) {
  try {
    return new Date(timestamp).toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  } catch {
    return new Date(timestamp).toLocaleTimeString();
  }
}

function formatLocalDateTime(timestamp, tz) {
  try {
    return new Date(timestamp).toLocaleString('en-US', { timeZone: tz });
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

function getLocalDateString(timestamp, tz) {
  try {
    const d = new Date(timestamp);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    return parts; // YYYY-MM-DD format
  } catch {
    return new Date(timestamp).toISOString().split('T')[0];
  }
}

function getLocalDayOfWeek(timestamp, tz) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(new Date(timestamp));
  } catch {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[new Date(timestamp).getDay()];
  }
}

// ============================================================
// INSIGHTS ENGINE — Pattern-based glucose observations
// Personal wellness journal features. Not medical advice.
// Observes patterns in user-entered data only.
// ============================================================

function analyzeGlucosePatterns(readings, settings, tz = 'America/New_York') {
  const low = settings?.lowThreshold || 70;
  const high = settings?.highThreshold || 180;
  const insights = [];

  if (readings.length === 0) {
    return [{
      id: 'no-data',
      type: 'info',
      icon: '📊',
      title: 'Start Logging',
      summary: 'Log glucose readings to unlock AI-powered insights about your patterns.',
      priority: 0
    }];
  }

  const values = readings.map(r => r.value);
  const timestamps = readings.map(r => new Date(r.timestamp));
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const inRangeCount = values.filter(v => v >= low && v <= high).length;
  const tir = Math.round((inRangeCount / values.length) * 100);
  const lowCount = values.filter(v => v < low).length;
  const highCount = values.filter(v => v > high).length;

  // Standard deviation (variability)
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  const stdDev = Math.round(Math.sqrt(variance));

  // Coefficient of variation
  const cv = avg > 0 ? Math.round((stdDev / avg) * 100) : 0;

  // Estimated GMI (informational pattern metric, not clinical)
  const gmi = (3.31 + (0.02392 * avg)).toFixed(1);

  // ---- INSIGHT: Time in Range Summary ----
  if (tir >= 70) {
    insights.push({
      id: 'tir-great',
      type: 'success',
      icon: '🎯',
      title: 'Excellent Time in Range',
      summary: `${tir}% of your readings are in range (${low}-${high} mg/dL). You're meeting the recommended >70% target!`,
      detail: `Average: ${avg} mg/dL • Estimated GMI: ${gmi}%`,
      priority: 10
    });
  } else if (tir >= 50) {
    insights.push({
      id: 'tir-moderate',
      type: 'warning',
      icon: '🎯',
      title: 'Time in Range: Room to Improve',
      summary: `${tir}% of readings are in range. The target is >70%. You're on your way — small adjustments can make a big difference.`,
      detail: `Average: ${avg} mg/dL • Estimated GMI: ${gmi}%`,
      priority: 8
    });
  } else {
    insights.push({
      id: 'tir-low',
      type: 'alert',
      icon: '🎯',
      title: 'Time in Range Overview',
      summary: `${tir}% of your readings are in range. Patterns like these can be helpful to share with your care team.`,
      detail: `Average: ${avg} mg/dL • ${highCount} high, ${lowCount} low out of ${values.length} readings`,
      priority: 9
    });
  }

  // ---- INSIGHT: Variability ----
  if (cv > 36) {
    insights.push({
      id: 'variability-high',
      type: 'warning',
      icon: '📈',
      title: 'High Glucose Variability',
      summary: `Your glucose swings are wider than average (CV: ${cv}%). Target is <36%. This is worth noting in your journal.`,
      detail: `Standard deviation: ${stdDev} mg/dL • Range: ${Math.min(...values)}-${Math.max(...values)} mg/dL`,
      priority: 7
    });
  } else {
    insights.push({
      id: 'variability-good',
      type: 'success',
      icon: '📈',
      title: 'Stable Glucose Levels',
      summary: `Great stability! Your CV is ${cv}% (target: <36%). Consistent levels mean fewer highs and lows.`,
      detail: `Standard deviation: ${stdDev} mg/dL`,
      priority: 5
    });
  }

  // ---- INSIGHT: Low patterns ----
  if (lowCount > 0) {
    const lowReadings = readings.filter(r => r.value < low);
    const lowHours = lowReadings.map(r => getLocalHour(r.timestamp, tz));
    const mostCommonLowHour = findMostCommonHour(lowHours);
    const timeLabel = formatHour(mostCommonLowHour);

    insights.push({
      id: 'low-pattern',
      type: 'alert',
      icon: '🔻',
      title: `${lowCount} Low${lowCount > 1 ? 's' : ''} Detected`,
      summary: `You had ${lowCount} reading${lowCount > 1 ? 's' : ''} below ${low} mg/dL. ${lowCount > 1 ? `Lows most often occur around ${timeLabel}.` : ''}`,
      detail: `Lowest value: ${Math.min(...lowReadings.map(r => r.value))} mg/dL`,
      priority: 9
    });
  }

  // ---- INSIGHT: High patterns ----
  if (highCount > 0) {
    const highReadings = readings.filter(r => r.value > high);
    const highHours = highReadings.map(r => getLocalHour(r.timestamp, tz));
    const mostCommonHighHour = findMostCommonHour(highHours);
    const timeLabel = formatHour(mostCommonHighHour);

    insights.push({
      id: 'high-pattern',
      type: 'warning',
      icon: '🔺',
      title: `${highCount} High${highCount > 1 ? 's' : ''} Detected`,
      summary: `You had ${highCount} reading${highCount > 1 ? 's' : ''} above ${high} mg/dL. ${highCount > 1 ? `Highs tend to happen around ${timeLabel}.` : ''}`,
      detail: `Highest value: ${Math.max(...highReadings.map(r => r.value))} mg/dL`,
      priority: 7
    });
  }

  // ---- INSIGHT: Time-of-day patterns ----
  const morningReadings = readings.filter(r => { const h = getLocalHour(r.timestamp, tz); return h >= 5 && h < 12; });
  const afternoonReadings = readings.filter(r => { const h = getLocalHour(r.timestamp, tz); return h >= 12 && h < 18; });
  const eveningReadings = readings.filter(r => { const h = getLocalHour(r.timestamp, tz); return h >= 18 && h < 23; });
  const nightReadings = readings.filter(r => { const h = getLocalHour(r.timestamp, tz); return h >= 23 || h < 5; });

  const periods = [
    { name: 'Morning', emoji: '🌅', readings: morningReadings },
    { name: 'Afternoon', emoji: '☀️', readings: afternoonReadings },
    { name: 'Evening', emoji: '🌆', readings: eveningReadings },
    { name: 'Overnight', emoji: '🌙', readings: nightReadings }
  ].filter(p => p.readings.length >= 2);

  if (periods.length > 0) {
    const periodStats = periods.map(p => {
      const vals = p.readings.map(r => r.value);
      const pAvg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      const pTir = Math.round((vals.filter(v => v >= low && v <= high).length / vals.length) * 100);
      return { ...p, avg: pAvg, tir: pTir };
    });

    const bestPeriod = periodStats.reduce((a, b) => a.tir > b.tir ? a : b);
    const worstPeriod = periodStats.reduce((a, b) => a.tir < b.tir ? a : b);

    if (bestPeriod.tir !== worstPeriod.tir) {
      insights.push({
        id: 'time-pattern',
        type: 'info',
        icon: '🕐',
        title: 'Time-of-Day Pattern',
        summary: `Your best period is ${bestPeriod.emoji} ${bestPeriod.name} (${bestPeriod.tir}% in range, avg ${bestPeriod.avg}). ${worstPeriod.name} needs more attention (${worstPeriod.tir}% in range, avg ${worstPeriod.avg}).`,
        detail: periodStats.map(p => `${p.emoji} ${p.name}: avg ${p.avg}, ${p.tir}% TIR`).join(' • '),
        priority: 6
      });
    }
  }

  // ---- INSIGHT: Trend momentum ----
  if (readings.length >= 3) {
    const recent3 = readings.slice(0, 3);
    const allRising = recent3.every(r => r.trend === 'rising' || r.trend === 'rising_fast');
    const allFalling = recent3.every(r => r.trend === 'falling' || r.trend === 'falling_fast');

    if (allRising && recent3[0].value > high) {
      insights.push({
        id: 'trend-rising-high',
        type: 'alert',
        icon: '⬆️',
        title: 'Rising Trend Above Range',
        summary: `Your last ${recent3.length} readings show a rising trend and you're above ${high} mg/dL.`,
        priority: 9
      });
    } else if (allFalling && recent3[0].value < low + 20) {
      insights.push({
        id: 'trend-falling-low',
        type: 'alert',
        icon: '⬇️',
        title: 'Dropping Toward Low',
        summary: `Your last ${recent3.length} readings show a falling trend and you're at ${recent3[0].value} mg/dL. Keep an eye on it.`,
        priority: 10
      });
    }
  }

  // ---- INSIGHT: Logging frequency ----
  if (readings.length >= 2) {
    const firstTime = new Date(readings[readings.length - 1].timestamp);
    const lastTime = new Date(readings[0].timestamp);
    const hoursSpan = (lastTime - firstTime) / (1000 * 60 * 60);
    const readingsPerDay = hoursSpan > 0 ? Math.round((readings.length / hoursSpan) * 24) : readings.length;

    if (readingsPerDay < 4) {
      insights.push({
        id: 'logging-low',
        type: 'info',
        icon: '📝',
        title: 'Log More for Better Insights',
        summary: `You're averaging about ${readingsPerDay} reading${readingsPerDay !== 1 ? 's' : ''}/day. Logging 4+ times gives much better pattern detection.`,
        priority: 3
      });
    } else {
      insights.push({
        id: 'logging-good',
        type: 'success',
        icon: '📝',
        title: 'Great Logging Habit',
        summary: `You're averaging about ${readingsPerDay} readings/day. That's excellent for tracking patterns!`,
        priority: 2
      });
    }
  }

  // Sort by priority descending
  insights.sort((a, b) => b.priority - a.priority);

  return insights;
}

// Helper: find the most common hour in an array
function findMostCommonHour(hours) {
  const counts = {};
  hours.forEach(h => { counts[h] = (counts[h] || 0) + 1; });
  return parseInt(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
}

// Helper: format hour as readable time
function formatHour(hour) {
  if (hour === 0) return '12 AM';
  if (hour < 12) return hour + ' AM';
  if (hour === 12) return '12 PM';
  return (hour - 12) + ' PM';
}

// @route   GET /api/insights
// @desc    Get AI-powered glucose insights
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { hours = 72 } = req.query;

    const since = new Date();
    since.setHours(since.getHours() - parseInt(hours));

    const [readings, user] = await Promise.all([
      GlucoseReading.find({
        userId: req.user.userId,
        timestamp: { $gte: since }
      }).sort({ timestamp: -1 }),
      User.findById(req.user.userId).select('settings timezone')
    ]);

    const insights = analyzeGlucosePatterns(readings, user?.settings, user?.timezone || 'America/New_York');

    // Also return quick summary stats
    const values = readings.map(r => r.value);
    const summary = readings.length > 0 ? {
      readingCount: readings.length,
      hours: parseInt(hours),
      average: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      min: Math.min(...values),
      max: Math.max(...values),
      timeInRange: Math.round((values.filter(v => v >= (user?.settings?.lowThreshold || 70) && v <= (user?.settings?.highThreshold || 180)).length / values.length) * 100)
    } : null;

    res.json({ insights, summary });
  } catch (err) {
    console.error('Get insights error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// SHARED: Build glucose stats object for AI endpoints
// ============================================================
function buildGlucoseStats(readings, user, hours, tz = 'America/New_York') {
  const values = readings.map(r => r.value);
  const low = user?.settings?.lowThreshold || 70;
  const high = user?.settings?.highThreshold || 180;
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const tir = Math.round((values.filter(v => v >= low && v <= high).length / values.length) * 100);
  const lowCount = values.filter(v => v < low).length;
  const highCount = values.filter(v => v > high).length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  const stdDev = Math.round(Math.sqrt(variance));
  const cv = avg > 0 ? Math.round((stdDev / avg) * 100) : 0;

  // Time-of-day breakdown
  const periodDefs = [
    { name: 'Morning (5am-12pm)', start: 5, end: 12 },
    { name: 'Afternoon (12pm-6pm)', start: 12, end: 18 },
    { name: 'Evening (6pm-11pm)', start: 18, end: 23 },
    { name: 'Overnight (11pm-5am)', start: 23, end: 5 }
  ];
  const periodStats = periodDefs.map((p, i) => {
    const pReadings = readings.filter(r => {
      const h = getLocalHour(r.timestamp, tz);
      return i === 3 ? (h >= 23 || h < 5) : (h >= p.start && h < p.end);
    });
    if (pReadings.length === 0) return null;
    const pVals = pReadings.map(r => r.value);
    const pAvg = Math.round(pVals.reduce((a, b) => a + b, 0) / pVals.length);
    const pTir = Math.round((pVals.filter(v => v >= low && v <= high).length / pVals.length) * 100);
    return { name: p.name, avg: pAvg, tir: pTir, count: pReadings.length, text: `${p.name}: avg ${pAvg} mg/dL, ${pTir}% TIR (${pReadings.length} readings)` };
  }).filter(Boolean);

  // Recent trend direction
  const recentValues = readings.slice(0, Math.min(5, readings.length)).map(r => r.value);
  const recentTrends = readings.slice(0, Math.min(5, readings.length)).map(r => r.trend).filter(Boolean);

  // Day-over-day comparison (using user's local timezone)
  const now = new Date();
  const todayStr = getLocalDateString(now, tz);
  const todayReadings = readings.filter(r => getLocalDateString(r.timestamp, tz) === todayStr);
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday, tz);
  const yesterdayReadings = readings.filter(r => getLocalDateString(r.timestamp, tz) === yesterdayStr);

  const todayAvg = todayReadings.length > 0 ? Math.round(todayReadings.map(r => r.value).reduce((a,b) => a+b, 0) / todayReadings.length) : null;
  const yesterdayAvg = yesterdayReadings.length > 0 ? Math.round(yesterdayReadings.map(r => r.value).reduce((a,b) => a+b, 0) / yesterdayReadings.length) : null;

  // Consecutive in-range streak
  let inRangeStreak = 0;
  for (const r of readings) {
    if (r.value >= low && r.value <= high) inRangeStreak++;
    else break;
  }

  // Spikes: readings that jumped >50 mg/dL from the previous reading
  const spikes = [];
  for (let i = 0; i < readings.length - 1; i++) {
    const diff = readings[i].value - readings[i + 1].value;
    if (Math.abs(diff) >= 50) {
      spikes.push({
        from: readings[i + 1].value,
        to: readings[i].value,
        direction: diff > 0 ? 'spike' : 'drop',
        time: readings[i].timestamp
      });
    }
  }

  return {
    userName: user?.name || 'there',
    hours, readingCount: readings.length,
    avg, min, max, tir, lowCount, highCount, stdDev, cv,
    low, high, periodStats, recentValues, recentTrends,
    todayAvg, yesterdayAvg, todayCount: todayReadings.length,
    yesterdayCount: yesterdayReadings.length,
    inRangeStreak, spikes: spikes.slice(0, 5)
  };
}

// ============================================================
// Groq helper — reuse across endpoints
// ============================================================
function getGroqClient() {
  if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'PASTE_YOUR_KEY_HERE') return null;
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

// @route   GET /api/insights/ai-summary
// @desc    Get a Groq-powered natural language glucose summary
// @access  Private
router.get('/ai-summary', auth, async (req, res) => {
  try {
    const { hours = 72 } = req.query;
    const groq = getGroqClient();
    if (!groq) {
      return res.status(503).json({
        message: 'AI insights not configured',
        aiSummary: 'AI insights are not available yet. Check back soon! 🧠'
      });
    }

    const since = new Date();
    since.setHours(since.getHours() - parseInt(hours));

    const [readings, user, moodEntries] = await Promise.all([
      GlucoseReading.find({ userId: req.user.userId, timestamp: { $gte: since } }).sort({ timestamp: -1 }),
      User.findById(req.user.userId).select('settings name timezone'),
      MoodEntry.find({ userId: req.user.userId, timestamp: { $gte: since } }).sort({ timestamp: -1 }).limit(20),
    ]);

    if (readings.length === 0) {
      return res.json({ aiSummary: 'Log some glucose readings and I\'ll give you a personalized analysis! 📊' });
    }

    const tz = user?.timezone || 'America/New_York';
    const stats = buildGlucoseStats(readings, user, parseInt(hours), tz);

    // Build mood context for AI
    let moodContext = '';
    if (moodEntries.length > 0) {
      const moodLabels = { great: 'Great', good: 'Good', okay: 'Okay', tired: 'Tired', stressed: 'Stressed', sick: 'Sick', low_energy: 'Low Energy', anxious: 'Anxious' };
      const moodSummary = moodEntries.map(m => {
        const label = moodLabels[m.label] || m.label;
        const time = formatLocalDateTime(m.timestamp, tz);
        const noteStr = m.note ? ` — "${m.note}"` : '';
        return `${m.emoji} ${label} (${time})${noteStr}`;
      }).join('\n  ');

      // Mood frequency
      const freq = {};
      moodEntries.forEach(m => { freq[m.label] = (freq[m.label] || 0) + 1; });
      const topMood = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];

      moodContext = `\n\nMOOD/NOTES DATA (${moodEntries.length} entries in this period):
  ${moodSummary}
- Most frequent mood: ${topMood ? topMood[0] : 'N/A'} (${topMood ? topMood[1] : 0} times)
- IMPORTANT: Look for correlations between mood/notes and glucose patterns. If the user noted something specific (like "pizza", "stress", "bad sleep"), reference it and connect it to any glucose patterns you see around that time. This is how you get to know the user over time.`;
    }

    const prompt = `Summarize ${stats.userName}'s glucose in ONE sentence (max 20 words + 1 emoji).

DATA (${stats.hours}h): ${stats.readingCount} readings, avg ${stats.avg}, range ${stats.min}-${stats.max}, TIR ${stats.tir}%, lows ${stats.lowCount}, highs ${stats.highCount}, streak ${stats.inRangeStreak} in-range.${moodContext ? '\nMood: ' + moodContext.slice(0, 200) : ''}

RULES: One flowing sentence. No lists. No medical advice. Highlight the most notable pattern. End positive.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You write exactly ONE sentence glucose summaries (under 20 words). No advice. No lists. Just observe the most notable pattern and keep it positive.' },
        { role: 'user', content: prompt }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.8,
      max_tokens: 50,
    });

    // Hard-limit: trim to 2 sentences max
    let summary = chatCompletion.choices[0]?.message?.content || 'No summary available.';
    const sentences = summary.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > 2) {
      summary = sentences.slice(0, 2).join('').trim();
    }

    res.json({ aiSummary: summary });
  } catch (err) {
    console.error('AI summary error:', err);
    res.json({ aiSummary: 'I couldn\'t generate an AI summary right now. Your pattern-based insights above are still available! 🧠' });
  }
});

// @route   GET /api/insights/ai-trends
// @desc    Get AI-powered trend notifications & pattern alerts
// @access  Private
router.get('/ai-trends', auth, async (req, res) => {
  try {
    const { hours = 72 } = req.query;
    const groq = getGroqClient();
    if (!groq) {
      return res.status(503).json({ message: 'AI not configured', trends: [] });
    }

    const since = new Date();
    since.setHours(since.getHours() - parseInt(hours));

    const [readings, user, moodEntries] = await Promise.all([
      GlucoseReading.find({ userId: req.user.userId, timestamp: { $gte: since } }).sort({ timestamp: -1 }),
      User.findById(req.user.userId).select('settings name timezone'),
      MoodEntry.find({ userId: req.user.userId, timestamp: { $gte: since } }).sort({ timestamp: -1 }).limit(20),
    ]);

    if (readings.length < 3) {
      return res.json({
        trends: [{
          id: 'need-data', type: 'info', icon: '📊', title: 'More Data Needed',
          message: 'Log at least 3 readings so I can start spotting trends for you!',
          category: 'general'
        }]
      });
    }

    const tz = user?.timezone || 'America/New_York';
    const stats = buildGlucoseStats(readings, user, parseInt(hours), tz);

    // Build mood context for trends
    let moodContext = '';
    if (moodEntries.length > 0) {
      const moodLabels = { great: 'Great', good: 'Good', okay: 'Okay', tired: 'Tired', stressed: 'Stressed', sick: 'Sick', low_energy: 'Low Energy', anxious: 'Anxious' };
      const moodSummary = moodEntries.slice(0, 10).map(m => {
        const label = moodLabels[m.label] || m.label;
        const time = formatLocalDateTime(m.timestamp, tz);
        const noteStr = m.note ? ` — "${m.note}"` : '';
        return `${m.emoji} ${label} (${time})${noteStr}`;
      }).join('\n  ');
      moodContext = `\n\nMOOD/NOTES (${moodEntries.length} entries):\n  ${moodSummary}\n- If mood entries or notes correlate with glucose patterns (e.g. "stressed" near a spike, "sick" near erratic readings), create a trend observation about it. This helps the user see mood↔glucose connections.`;
    }

    const prompt = `Analyze this glucose journal data and return a JSON array of trend observations.

RULES:
- Return ONLY valid JSON — an array of objects, no markdown, no explanation outside the JSON
- Each object: { "type": "alert|warning|success|info|streak", "icon": "emoji", "title": "short title (5 words max)", "message": "ONE concise sentence, max 12 words", "category": "one of: trend, pattern, streak, spike, timing, comparison, stability, milestone" }
- Identify the 2 most important observations only — quality over quantity
- Keep each message to ONE short, punchy sentence
- Be specific — use actual numbers from the data
- NEVER suggest medication changes, dosing, eating, or any health actions
- Simply observe patterns — do NOT give advice
- Friendly tone, this is a personal wellness journal

DATA (last ${stats.hours}h):
- ${stats.readingCount} readings | Avg: ${stats.avg} | Range: ${stats.min}-${stats.max} mg/dL
- TIR (${stats.low}-${stats.high}): ${stats.tir}% | Lows: ${stats.lowCount} | Highs: ${stats.highCount}
- StdDev: ${stats.stdDev} | CV: ${stats.cv}%
- Periods: ${stats.periodStats.map(p => p.text).join(' | ')}
- Last 5 values: ${stats.recentValues.join(', ')}
- Trends: ${stats.recentTrends.join(', ') || 'none'}
- Today: avg ${stats.todayAvg ?? 'N/A'} (${stats.todayCount}) | Yesterday: avg ${stats.yesterdayAvg ?? 'N/A'} (${stats.yesterdayCount})
- In-range streak: ${stats.inRangeStreak}
- Rapid changes: ${stats.spikes.length > 0 ? stats.spikes.map(s => `${s.direction} ${s.from}→${s.to}`).join(', ') : 'none'}${moodContext}

Return the JSON array now:`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a glucose journal data analyst for a personal wellness app. You return ONLY valid JSON arrays of pattern observations. No medical advice. No action recommendations. Just observations.' },
        { role: 'user', content: prompt }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.4,
      max_tokens: 350,
    });

    let raw = chatCompletion.choices[0]?.message?.content || '[]';
    // Strip markdown fences if model wraps it
    raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    let trends;
    try {
      trends = JSON.parse(raw);
      if (!Array.isArray(trends)) trends = [trends];
      // Validate & sanitize each trend
      trends = trends.filter(t => t && t.title && t.message).map((t, i) => ({
        id: `ai-trend-${i}`,
        type: ['alert','warning','success','info','streak'].includes(t.type) ? t.type : 'info',
        icon: t.icon || '🔍',
        title: String(t.title).slice(0, 80),
        message: String(t.message).slice(0, 300),
        category: t.category || 'general'
      }));
    } catch (parseErr) {
      console.error('AI trends JSON parse error:', parseErr.message);
      // Fallback: return the raw text as a single trend
      trends = [{
        id: 'ai-trend-fallback', type: 'info', icon: '🧠',
        title: 'AI Pattern Analysis', message: raw.slice(0, 300),
        category: 'general'
      }];
    }

    res.json({ trends });
  } catch (err) {
    console.error('AI trends error:', err);
    res.json({ trends: [] });
  }
});

// ============================================================
// In-memory cache for motivation (per user, refreshes every visit)
// ============================================================
const motivationCache = new Map(); // key: userId → { data, ts }
const MOTIVATION_TTL = 60 * 60 * 1000; // 1 hour

// @route   GET /api/insights/daily-motivation
// @desc    Get a short T1D-positive motivational message
// @access  Private
router.get('/daily-motivation', auth, async (req, res) => {
  try {
    const now = Date.now();
    const cached = motivationCache.get(req.user.userId);

    // Return cached only if less than 1 hour old
    if (cached && (now - cached.ts) < MOTIVATION_TTL) {
      return res.json(cached.data);
    }

    // Clean expired entries
    for (const [key, val] of motivationCache) {
      if ((now - val.ts) >= MOTIVATION_TTL) motivationCache.delete(key);
    }

    const groq = getGroqClient();
    if (!groq) {
      const fallback = {
        motivation: "T1D picked the wrong one. You show up every day. 💪",
        emoji: '💪'
      };
      return res.json(fallback);
    }

    // Get user name for personalization
    const user = await User.findById(req.user.userId).select('name timezone');
    const name = user?.name || 'friend';
    const tz = user?.timezone || 'America/New_York';

    // Get a quick read on their recent data for context (optional personalization)
    const since24h = new Date();
    since24h.setHours(since24h.getHours() - 24);
    const [recentReadings, recentMoods] = await Promise.all([
      GlucoseReading.find({ userId: req.user.userId, timestamp: { $gte: since24h } }).sort({ timestamp: -1 }).limit(10),
      MoodEntry.find({ userId: req.user.userId, timestamp: { $gte: since24h } }).sort({ timestamp: -1 }).limit(5),
    ]);

    let dataContext = '';
    if (recentReadings.length > 0) {
      const vals = recentReadings.map(r => r.value);
      const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      const low = 70, high = 180;
      const tir = Math.round((vals.filter(v => v >= low && v <= high).length / vals.length) * 100);
      dataContext = `\nThe user logged ${recentReadings.length} readings in the last 24h (avg ${avg} mg/dL, ${tir}% in range). If their numbers look good, acknowledge it. If they had a tough day, be extra encouraging — remind them one tough day doesn't define their journey.`;
    }
    if (recentMoods.length > 0) {
      const moodLabels = { great: 'Great', good: 'Good', okay: 'Okay', tired: 'Tired', stressed: 'Stressed', sick: 'Sick', low_energy: 'Low Energy', anxious: 'Anxious' };
      const lastMood = recentMoods[0];
      dataContext += `\nTheir most recent mood was "${moodLabels[lastMood.label] || lastMood.label}" ${lastMood.emoji} at ${formatLocalTime(lastMood.timestamp, tz)}${lastMood.note ? ` with the note: "${lastMood.note}"` : ''}. Tailor the motivation to acknowledge how they're feeling — if they're tired or stressed, be extra compassionate.`;
    }

    const prompt = `Write ONE short motivational sentence for ${name}, who has Type 1 Diabetes.

RULES:
- MAX 15 words + 1 emoji at the end. Treat this like a text message, not a speech.
- Good examples: "T1D picked the wrong one. You're tougher than you think. 💪" or "Every bolus is proof you don't quit. Keep going, ${name}. 🌟"
- Vary tone each day: humor, warmth, pride, grit, self-compassion
- NEVER mention apps, logging, tracking, or medical advice
- Be specific to T1D life, not generic motivation${dataContext}

Return ONLY the quote, nothing else.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You write very short motivational one-liners (under 15 words) for people with Type 1 Diabetes. One sentence max. Never mention apps or tracking. No medical advice.' },
        { role: 'user', content: prompt }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 1.0,
      max_tokens: 50,
    });

    const message = chatCompletion.choices[0]?.message?.content?.trim() || 
      `${name}, T1D picked the wrong one. You've got this. 💙`;

    // Pick an emoji from the message or default
    const emojiMatch = message.match(/[\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}]/u);
    const emoji = emojiMatch ? emojiMatch[0] : '🌟';

    const result = { motivation: message, emoji };

    // Cache it for 1 hour
    motivationCache.set(req.user.userId, { data: result, ts: Date.now() });

    res.json(result);
  } catch (err) {
    console.error('Daily motivation error:', err);
    res.json({
      motivation: "Tough days don't last — tough T1D warriors do. 💛",
      emoji: '💛'
    });
  }
});

// ============================================================
// ASK LOOP — Conversational AI chat with your glucose data
// ============================================================

// In-memory conversation buffer per user (last 5 messages)
const conversationCache = new Map(); // key: userId → [{ role, content }]

// @route   POST /api/insights/ask
// @desc    Ask Loop a question about your glucose data
// @access  Private
router.post('/ask', auth, async (req, res) => {
  try {
    // Only warriors, hybrids, and admins can use Ask Loop
    const askUser = await User.findById(req.user.userId).select('role');
    if (askUser && askUser.role === 'member') {
      return res.json({
        answer: "Ask Loop is a warrior feature — it uses your glucose data to answer questions! 🧠",
        context: null
      });
    }

    const { question } = req.body;
    if (!question || question.trim().length === 0) {
      return res.json({
        answer: "Hmm, I didn't catch a question there. Try asking something like 'How are my mornings?' 🤔",
        context: null
      });
    }

    const groq = getGroqClient();
    if (!groq) {
      return res.json({
        answer: "AI isn't configured yet — but I'll be ready to chat about your glucose data soon! 🧠",
        context: null
      });
    }

    const userId = req.user.userId;

    // Gather user data context (last 72h)
    const since72h = new Date();
    since72h.setHours(since72h.getHours() - 72);
    const since24h = new Date();
    since24h.setHours(since24h.getHours() - 24);

    const [readings72h, readings24h, user, moodEntries] = await Promise.all([
      GlucoseReading.find({ userId, timestamp: { $gte: since72h } }).sort({ timestamp: -1 }),
      GlucoseReading.find({ userId, timestamp: { $gte: since24h } }).sort({ timestamp: -1 }),
      User.findById(userId).select('settings name timezone'),
      MoodEntry.find({ userId, timestamp: { $gte: since72h } }).sort({ timestamp: -1 }).limit(20),
    ]);

    const tz = user?.timezone || 'America/New_York';
    let stats72h = null;
    let stats24h = null;
    try {
      stats72h = readings72h.length > 0 ? buildGlucoseStats(readings72h, user, 72, tz) : null;
      stats24h = readings24h.length > 0 ? buildGlucoseStats(readings24h, user, 24, tz) : null;
    } catch (statsErr) {
      console.error('Ask Loop stats build error:', statsErr.message);
      // Continue with null stats — AI can still respond
    }

    // Build context string
    let dataContext = 'NO DATA AVAILABLE — the user has no glucose readings yet.';
    if (stats72h) {
      dataContext = `USER: ${stats72h.userName}

LAST 24 HOURS:
${stats24h ? `- ${stats24h.readingCount} readings | Avg: ${stats24h.avg} mg/dL | Range: ${stats24h.min}-${stats24h.max}
- TIR (${stats24h.low}-${stats24h.high}): ${stats24h.tir}% | Lows: ${stats24h.lowCount} | Highs: ${stats24h.highCount}
- StdDev: ${stats24h.stdDev} | CV: ${stats24h.cv}%
- In-range streak: ${stats24h.inRangeStreak} consecutive readings
- Spikes: ${stats24h.spikes.length > 0 ? stats24h.spikes.map(s => `${s.direction} ${s.from}→${s.to} at ${formatLocalTime(s.time, tz)}`).join(', ') : 'none'}
- Periods: ${stats24h.periodStats.map(p => p.text).join(' | ')}` : 'No readings in last 24h'}

LAST 72 HOURS:
- ${stats72h.readingCount} readings | Avg: ${stats72h.avg} mg/dL | Range: ${stats72h.min}-${stats72h.max}
- TIR: ${stats72h.tir}% | Lows: ${stats72h.lowCount} | Highs: ${stats72h.highCount}
- StdDev: ${stats72h.stdDev} | CV: ${stats72h.cv}%
- Periods: ${stats72h.periodStats.map(p => p.text).join(' | ')}
- Today avg: ${stats72h.todayAvg ?? 'N/A'} | Yesterday avg: ${stats72h.yesterdayAvg ?? 'N/A'}`;

      // Add recent readings timeline
      if (readings24h.length > 0) {
        const timeline = readings24h.slice(0, 15).map(r => {
          const t = formatLocalTime(r.timestamp, tz);
          const trend = r.trend ? ` (${r.trend})` : '';
          return `${t}: ${r.value} mg/dL${trend}`;
        }).join('\n  ');
        dataContext += `\n\nRECENT READINGS TIMELINE:\n  ${timeline}`;
      }
    }

    // Add mood context
    if (moodEntries.length > 0) {
      const moodLabels = { great: 'Great', good: 'Good', okay: 'Okay', tired: 'Tired', stressed: 'Stressed', sick: 'Sick', low_energy: 'Low Energy', anxious: 'Anxious' };
      const moodTimeline = moodEntries.slice(0, 10).map(m => {
        const t = formatLocalDateTime(m.timestamp, tz);
        const noteStr = m.note ? ` — "${m.note}"` : '';
        return `${m.emoji} ${moodLabels[m.label] || m.label} (${t})${noteStr}`;
      }).join('\n  ');
      dataContext += `\n\nMOOD ENTRIES:\n  ${moodTimeline}`;
    }

    // Get/create conversation history
    const cacheKey = userId;
    if (!conversationCache.has(cacheKey)) {
      conversationCache.set(cacheKey, []);
    }
    const history = conversationCache.get(cacheKey);

    // Build messages array
    const messages = [
      {
        role: 'system',
        content: `You are "Loop" — the friendly AI wellness companion inside LinkLoop, a personal glucose journal app for people with Type 1 Diabetes. Users can ask you questions about their glucose data and you answer using the real data provided below.

PERSONALITY:
- Warm, knowledgeable, encouraging — like a smart friend who really understands T1D
- Conversational but very concise — aim for 1-2 sentences per response
- Use specific numbers from their data when relevant
- Remember context from previous messages in this conversation

ABSOLUTE RULES:
- NEVER give medical advice, suggest medication changes, or recommend specific dosages
- NEVER tell them to eat, snack, correct, or take any specific health action
- NEVER diagnose anything or suggest they have a condition
- You OBSERVE and ANALYZE patterns — you do NOT prescribe
- If asked for medical advice, warmly redirect: "That's a great question for your care team!"
- Refer to the app as a "wellness journal" — not a medical device
- 1 emoji per response max

DATA CONTEXT:
${dataContext}

You can answer questions like:
- "Why did I spike?" → Look at the timeline for rapid rises and nearby mood entries
- "How are my mornings?" → Use period stats for morning data
- "Am I doing better than yesterday?" → Compare today vs yesterday averages
- "What's my best time of day?" → Find the period with highest TIR
- General T1D wellness chat`
      },
      ...history.slice(-8), // Last 4 exchanges (8 messages)
      { role: 'user', content: question }
    ];

    const chatCompletion = await Promise.race([
      groq.chat.completions.create({
        messages,
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 200,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Groq timeout')), 20000))
    ]);

    const answer = chatCompletion.choices[0]?.message?.content?.trim() ||
      "Hmm, I'm having trouble answering that right now. Try asking in a different way! 🤔";

    // Update conversation cache
    history.push({ role: 'user', content: question });
    history.push({ role: 'assistant', content: answer });
    // Keep only last 10 messages
    if (history.length > 10) history.splice(0, history.length - 10);

    res.json({
      answer,
      context: stats24h ? {
        readingCount: stats24h.readingCount,
        avg: stats24h.avg,
        tir: stats24h.tir,
      } : null
    });
  } catch (err) {
    console.error('Ask Loop error:', err?.message || err, err?.status || '', err?.error?.message || '');
    res.json({
      answer: "I'm having a moment — try asking again in a sec! 🧠",
      context: null
    });
  }
});

// @route   DELETE /api/insights/ask/history
// @desc    Clear conversation history
// @access  Private
router.delete('/ask/history', auth, (req, res) => {
  conversationCache.delete(req.user.userId);
  res.json({ message: 'Conversation cleared' });
});

// ============================================================
// WEEKLY REPORT — Auto-generated weekly glucose summary
// ============================================================

// @route   GET /api/insights/weekly-report
// @desc    Get a weekly report card (last 7 days vs previous 7 days)
// @access  Private
router.get('/weekly-report', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select('settings name timezone');
    const tz = user?.timezone || 'America/New_York';
    const low = user?.settings?.lowThreshold || 70;
    const high = user?.settings?.highThreshold || 180;

    // This week (last 7 days) and previous week
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(now.getDate() - 14);

    const [thisWeekReadings, prevWeekReadings, thisWeekMoods, prevWeekMoods] = await Promise.all([
      GlucoseReading.find({ userId, timestamp: { $gte: weekAgo } }).sort({ timestamp: -1 }),
      GlucoseReading.find({ userId, timestamp: { $gte: twoWeeksAgo, $lt: weekAgo } }).sort({ timestamp: -1 }),
      MoodEntry.find({ userId, timestamp: { $gte: weekAgo } }).sort({ timestamp: -1 }),
      MoodEntry.find({ userId, timestamp: { $gte: twoWeeksAgo, $lt: weekAgo } }).sort({ timestamp: -1 }),
    ]);

    if (thisWeekReadings.length === 0) {
      return res.json({
        report: null,
        message: 'No readings this week — log some glucose data to generate your report!'
      });
    }

    // Calculate this week's stats
    const thisWeekStats = buildWeekStats(thisWeekReadings, low, high);
    const prevWeekStats = prevWeekReadings.length > 0 ? buildWeekStats(prevWeekReadings, low, high) : null;

    // Daily breakdown
    let dailyBreakdown = [];
    try { dailyBreakdown = buildDailyBreakdown(thisWeekReadings, low, high, tz); } catch (e) {
      console.error('Daily breakdown error:', e.message);
    }

    // Mood summary
    let moodSummary = { count: 0, topMood: null, topMoodCount: 0, distribution: {} };
    try { moodSummary = buildMoodSummary(thisWeekMoods); } catch (e) {
      console.error('Mood summary error:', e.message);
    }

    // Trends vs last week
    const trends = prevWeekStats ? {
      tirChange: thisWeekStats.tir - prevWeekStats.tir,
      avgChange: thisWeekStats.avg - prevWeekStats.avg,
      cvChange: thisWeekStats.cv - prevWeekStats.cv,
      readingsChange: thisWeekStats.readingCount - prevWeekStats.readingCount,
    } : null;

    // Best day & toughest day
    const bestDay = dailyBreakdown.length > 0
      ? dailyBreakdown.reduce((a, b) => a.tir > b.tir ? a : b, dailyBreakdown[0])
      : { dayName: 'N/A', tir: 0 };
    const toughestDay = dailyBreakdown.length > 0
      ? dailyBreakdown.reduce((a, b) => a.tir < b.tir ? a : b, dailyBreakdown[0])
      : { dayName: 'N/A', tir: 0 };

    // Generate AI narrative
    let aiNarrative = null;
    const groq = getGroqClient();
    if (groq && thisWeekReadings.length >= 5) {
      try {
        const prompt = `Write a friendly, encouraging weekly glucose journal recap for ${user?.name || 'there'}. This is for the "Weekly Report Card" screen in their personal wellness journal app.

WEEK STATS:
- ${thisWeekStats.readingCount} readings | Avg: ${thisWeekStats.avg} mg/dL
- TIR: ${thisWeekStats.tir}% | Lows: ${thisWeekStats.lowCount} | Highs: ${thisWeekStats.highCount}
- CV: ${thisWeekStats.cv}% | StdDev: ${thisWeekStats.stdDev}
- Best day: ${bestDay.dayName} (${bestDay.tir}% TIR)
- Toughest day: ${toughestDay.dayName} (${toughestDay.tir}% TIR)
${prevWeekStats ? `\nVS LAST WEEK: TIR ${trends.tirChange >= 0 ? '+' : ''}${trends.tirChange}%, Avg ${trends.avgChange >= 0 ? '+' : ''}${trends.avgChange} mg/dL` : ''}
${moodSummary.topMood ? `\nMost frequent mood: ${moodSummary.topMood} (${moodSummary.topMoodCount}x)` : ''}

RULES:
- 2-3 sentences, warm and personal
- Mention their best day by name (e.g. "Tuesday was your star day!")
- If they improved vs last week, celebrate it
- If TIR was tough, be encouraging — focus on what went well
- NEVER give medical advice or suggestions
- 1 emoji
- End on a forward-looking, positive note`;

        const completion = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: 'You write short, warm weekly recap narratives for a glucose wellness journal app. Never give medical advice. Celebrate wins and encourage through tough weeks.' },
            { role: 'user', content: prompt }
          ],
          model: 'llama-3.3-70b-versatile',
          temperature: 0.7,
          max_tokens: 130,
        });
        aiNarrative = completion.choices[0]?.message?.content?.trim() || null;
      } catch (aiErr) {
        console.error('Weekly report AI error:', aiErr.message);
      }
    }

    const report = {
      weekOf: weekAgo.toISOString(),
      endDate: now.toISOString(),
      userName: user?.name || 'Warrior',
      thisWeek: thisWeekStats,
      prevWeek: prevWeekStats,
      trends,
      dailyBreakdown,
      bestDay,
      toughestDay,
      moodSummary,
      aiNarrative,
    };

    res.json({ report });
  } catch (err) {
    console.error('Weekly report error:', err?.message || err);
    // Return a minimal report instead of 500 so the client shows something
    res.json({
      report: null,
      message: 'Could not generate report right now — pull to refresh to try again!'
    });
  }
});

function buildWeekStats(readings, low, high) {
  const values = readings.map(r => r.value);
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const inRange = values.filter(v => v >= low && v <= high).length;
  const tir = Math.round((inRange / values.length) * 100);
  const lowCount = values.filter(v => v < low).length;
  const highCount = values.filter(v => v > high).length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  const stdDev = Math.round(Math.sqrt(variance));
  const cv = avg > 0 ? Math.round((stdDev / avg) * 100) : 0;
  const gmi = (3.31 + (0.02392 * avg)).toFixed(1);
  return { readingCount: readings.length, avg, min: Math.min(...values), max: Math.max(...values), tir, lowCount, highCount, stdDev, cv, gmi };
}

function buildDailyBreakdown(readings, low, high, tz = 'America/New_York') {
  const dayMap = {};
  readings.forEach(r => {
    const key = getLocalDateString(r.timestamp, tz);
    if (!dayMap[key]) dayMap[key] = { values: [], timestamp: r.timestamp };
    dayMap[key].values.push(r.value);
  });

  return Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateStr, data]) => {
      const vals = data.values;
      const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      const inRange = vals.filter(v => v >= low && v <= high).length;
      const tir = Math.round((inRange / vals.length) * 100);
      return {
        date: dateStr,
        dayName: getLocalDayOfWeek(data.timestamp, tz),
        readingCount: vals.length,
        avg,
        tir,
        low: vals.filter(v => v < low).length,
        high: vals.filter(v => v > high).length,
      };
    });
}

function buildMoodSummary(moodEntries) {
  if (moodEntries.length === 0) return { count: 0, topMood: null, topMoodCount: 0, distribution: {} };
  const freq = {};
  moodEntries.forEach(m => { freq[m.label] = (freq[m.label] || 0) + 1; });
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  const moodLabels = { great: 'Great 😄', good: 'Good 😊', okay: 'Okay 😐', tired: 'Tired 😴', stressed: 'Stressed 😰', sick: 'Sick 🤒', low_energy: 'Low Energy 😮‍💨', anxious: 'Anxious 😟' };
  return {
    count: moodEntries.length,
    topMood: moodLabels[sorted[0][0]] || sorted[0][0],
    topMoodCount: sorted[0][1],
    distribution: freq,
  };
}

// ============================================================
// GLUCOSE STORY — Narrative timeline of your day
// ============================================================

// @route   GET /api/insights/glucose-story
// @desc    Get an AI-generated narrative story of the user's glucose day
// @access  Private
router.get('/glucose-story', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select('settings name timezone');
    const tz = user?.timezone || 'America/New_York';
    const low = user?.settings?.lowThreshold || 70;
    const high = user?.settings?.highThreshold || 180;

    const since24h = new Date();
    since24h.setHours(since24h.getHours() - 24);

    const [readings, moodEntries] = await Promise.all([
      GlucoseReading.find({ userId, timestamp: { $gte: since24h } }).sort({ timestamp: 1 }), // chronological
      MoodEntry.find({ userId, timestamp: { $gte: since24h } }).sort({ timestamp: 1 }),
    ]);

    if (readings.length < 3) {
      return res.json({
        story: null,
        blocks: [],
        message: 'Log at least 3 readings today to see your glucose story!'
      });
    }

    // Build time blocks
    const blockDefs = [
      { key: 'overnight', label: 'Overnight', emoji: '🌙', startHour: 0, endHour: 5 },
      { key: 'morning', label: 'Morning', emoji: '🌅', startHour: 5, endHour: 12 },
      { key: 'afternoon', label: 'Afternoon', emoji: '☀️', startHour: 12, endHour: 18 },
      { key: 'evening', label: 'Evening', emoji: '🌆', startHour: 18, endHour: 24 },
    ];

    const blocks = blockDefs.map(def => {
      const blockReadings = readings.filter(r => {
        const h = getLocalHour(r.timestamp, tz);
        return h >= def.startHour && h < def.endHour;
      });
      const blockMoods = moodEntries.filter(m => {
        const h = getLocalHour(m.timestamp, tz);
        return h >= def.startHour && h < def.endHour;
      });

      if (blockReadings.length === 0) {
        return { ...def, hasData: false, stats: null, narrative: null, moods: [] };
      }

      const values = blockReadings.map(r => r.value);
      const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      const inRange = values.filter(v => v >= low && v <= high).length;
      const tir = Math.round((inRange / values.length) * 100);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const lowCount = values.filter(v => v < low).length;
      const highCount = values.filter(v => v > high).length;

      // Determine block quality
      let quality = 'great';
      if (tir >= 80) quality = 'great';
      else if (tir >= 60) quality = 'good';
      else if (tir >= 40) quality = 'mixed';
      else quality = 'tough';

      return {
        ...def,
        hasData: true,
        stats: { avg, tir, min, max, count: blockReadings.length, lowCount, highCount },
        quality,
        moods: blockMoods.map(m => ({ emoji: m.emoji, label: m.label, note: m.note })),
      };
    });

    const activeBlocks = blocks.filter(b => b.hasData);

    // Generate AI narrative for each block
    const groq = getGroqClient();
    if (groq && activeBlocks.length > 0) {
      try {
        const blockDescriptions = activeBlocks.map(b => {
          const moodStr = b.moods.length > 0
            ? ` Moods: ${b.moods.map(m => `${m.emoji} ${m.label}${m.note ? ` ("${m.note}")` : ''}`).join(', ')}`
            : '';
          return `${b.emoji} ${b.label}: avg ${b.stats.avg} mg/dL, ${b.stats.tir}% TIR, range ${b.stats.min}-${b.stats.max}, ${b.stats.count} readings, ${b.stats.lowCount} lows, ${b.stats.highCount} highs${moodStr}`;
        }).join('\n');

        const prompt = `Write a "Glucose Story" for ${user?.name || 'there'}'s day. This is a narrative timeline that makes glucose data feel personal and engaging.

TIME BLOCKS:
${blockDescriptions}

RULES:
- Write ONE short sentence (max 10 words) per time block
- Each sentence should feel like a chapter in their day's story
- Use the block emoji at the start
- Be specific — mention actual numbers
- Great blocks: celebrate. Tough blocks: be kind and encouraging.
- If mood data exists, weave it in naturally
- NEVER give medical advice
- Return as JSON array: [{ "key": "morning", "narrative": "🌅 Solid morning..." }, ...]
- Return ONLY the JSON array, no markdown`;

        const completion = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: 'You write short narrative story sentences about glucose data blocks. Return only valid JSON arrays. Never give medical advice.' },
            { role: 'user', content: prompt }
          ],
          model: 'llama-3.3-70b-versatile',
          temperature: 0.6,
          max_tokens: 200,
        });

        let raw = completion.choices[0]?.message?.content || '[]';
        raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

        try {
          const narratives = JSON.parse(raw);
          if (Array.isArray(narratives)) {
            narratives.forEach(n => {
              const block = blocks.find(b => b.key === n.key);
              if (block) block.narrative = n.narrative;
            });
          }
        } catch (parseErr) {
          console.error('Glucose story JSON parse error:', parseErr.message);
        }
      } catch (aiErr) {
        console.error('Glucose story AI error:', aiErr.message);
      }
    }

    // Overall day summary
    const allValues = readings.map(r => r.value);
    const dayAvg = Math.round(allValues.reduce((a, b) => a + b, 0) / allValues.length);
    const dayTir = Math.round((allValues.filter(v => v >= low && v <= high).length / allValues.length) * 100);

    res.json({
      story: {
        date: new Date().toISOString().split('T')[0],
        userName: user?.name || 'Warrior',
        readingCount: readings.length,
        avg: dayAvg,
        tir: dayTir,
      },
      blocks,
    });
  } catch (err) {
    console.error('Glucose story error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
