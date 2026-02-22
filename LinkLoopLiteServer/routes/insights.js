const express = require('express');
const auth = require('../middleware/auth');
const GlucoseReading = require('../models/GlucoseReading');
const MoodEntry = require('../models/MoodEntry');
const User = require('../models/User');
const Groq = require('groq-sdk');

const router = express.Router();

// ============================================================
// INSIGHTS ENGINE — Pattern-based glucose observations
// Personal wellness journal features. Not medical advice.
// Observes patterns in user-entered data only.
// ============================================================

function analyzeGlucosePatterns(readings, settings) {
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
    const lowHours = lowReadings.map(r => new Date(r.timestamp).getHours());
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
    const highHours = highReadings.map(r => new Date(r.timestamp).getHours());
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
  const morningReadings = readings.filter(r => { const h = new Date(r.timestamp).getHours(); return h >= 5 && h < 12; });
  const afternoonReadings = readings.filter(r => { const h = new Date(r.timestamp).getHours(); return h >= 12 && h < 18; });
  const eveningReadings = readings.filter(r => { const h = new Date(r.timestamp).getHours(); return h >= 18 && h < 23; });
  const nightReadings = readings.filter(r => { const h = new Date(r.timestamp).getHours(); return h >= 23 || h < 5; });

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
      User.findById(req.user.userId).select('settings')
    ]);

    const insights = analyzeGlucosePatterns(readings, user?.settings);

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
function buildGlucoseStats(readings, user, hours) {
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
      const h = new Date(r.timestamp).getHours();
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

  // Day-over-day comparison
  const now = new Date();
  const todayReadings = readings.filter(r => {
    const d = new Date(r.timestamp);
    return d.toDateString() === now.toDateString();
  });
  const yesterdayStart = new Date(now); yesterdayStart.setDate(now.getDate() - 1); yesterdayStart.setHours(0,0,0,0);
  const yesterdayEnd = new Date(now); yesterdayEnd.setDate(now.getDate() - 1); yesterdayEnd.setHours(23,59,59,999);
  const yesterdayReadings = readings.filter(r => {
    const d = new Date(r.timestamp);
    return d >= yesterdayStart && d <= yesterdayEnd;
  });

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
      User.findById(req.user.userId).select('settings name'),
      MoodEntry.find({ userId: req.user.userId, timestamp: { $gte: since } }).sort({ timestamp: -1 }).limit(20),
    ]);

    if (readings.length === 0) {
      return res.json({ aiSummary: 'Log some glucose readings and I\'ll give you a personalized analysis! 📊' });
    }

    const stats = buildGlucoseStats(readings, user, parseInt(hours));

    // Build mood context for AI
    let moodContext = '';
    if (moodEntries.length > 0) {
      const moodLabels = { great: 'Great', good: 'Good', okay: 'Okay', tired: 'Tired', stressed: 'Stressed', sick: 'Sick', low_energy: 'Low Energy', anxious: 'Anxious' };
      const moodSummary = moodEntries.map(m => {
        const label = moodLabels[m.label] || m.label;
        const time = new Date(m.timestamp).toLocaleString();
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

    const prompt = `You are a friendly, supportive wellness companion in LinkLoop — a personal glucose journal app. Analyze this glucose data and give a personalized summary.

RULES:
- Warm & conversational, like a knowledgeable friend
- 2-4 short paragraphs max
- 1-2 observations based on patterns (e.g. timing patterns, consistency, trends)
- If mood/notes data is available, ALWAYS reference it — connect how they felt or what they noted with glucose patterns nearby. This is a key feature. Example: "I noticed you logged 'stressed' around the same time your glucose spiked — that's a pattern worth watching."
- Emojis sparingly (1-2 per paragraph)
- NEVER give medical advice, suggest medication or dosage changes, or recommend any specific actions to manage glucose
- Do NOT suggest eating, snacking, correcting, or any treatment actions
- If you notice trends, simply point them out as observations
- If data looks good, celebrate it!
- Refer to the app as a "wellness journal" not a "medical tool"
- End with encouragement, NOT a reminder to see a doctor

DATA (last ${stats.hours}h):
- Name: ${stats.userName}
- ${stats.readingCount} readings | Avg: ${stats.avg} mg/dL | Range: ${stats.min}-${stats.max}
- Time in Range (${stats.low}-${stats.high}): ${stats.tir}%
- Lows: ${stats.lowCount} | Highs: ${stats.highCount} | StdDev: ${stats.stdDev} | CV: ${stats.cv}%
- ${stats.periodStats.map(p => p.text).join('\n- ')}
- Last 5 readings: ${stats.recentValues.join(', ')} mg/dL
- Recent trends: ${stats.recentTrends.join(', ') || 'none logged'}
- Today avg: ${stats.todayAvg ?? 'N/A'} (${stats.todayCount} readings) | Yesterday avg: ${stats.yesterdayAvg ?? 'N/A'} (${stats.yesterdayCount} readings)
- Current in-range streak: ${stats.inRangeStreak} consecutive readings
- Rapid changes (>50 mg/dL jump): ${stats.spikes.length > 0 ? stats.spikes.map(s => `${s.direction} ${s.from}→${s.to} at ${new Date(s.time).toLocaleTimeString()}`).join(', ') : 'none'}${moodContext}`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a friendly wellness companion in LinkLoop, a personal glucose journal app. You help users see patterns in the data they log. You NEVER give medical advice, suggest medication changes, or recommend specific health actions. You only observe patterns and celebrate progress.' },
        { role: 'user', content: prompt }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 500,
    });

    res.json({ aiSummary: chatCompletion.choices[0]?.message?.content || 'No summary available.' });
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
      User.findById(req.user.userId).select('settings name'),
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

    const stats = buildGlucoseStats(readings, user, parseInt(hours));

    // Build mood context for trends
    let moodContext = '';
    if (moodEntries.length > 0) {
      const moodLabels = { great: 'Great', good: 'Good', okay: 'Okay', tired: 'Tired', stressed: 'Stressed', sick: 'Sick', low_energy: 'Low Energy', anxious: 'Anxious' };
      const moodSummary = moodEntries.slice(0, 10).map(m => {
        const label = moodLabels[m.label] || m.label;
        const time = new Date(m.timestamp).toLocaleString();
        const noteStr = m.note ? ` — "${m.note}"` : '';
        return `${m.emoji} ${label} (${time})${noteStr}`;
      }).join('\n  ');
      moodContext = `\n\nMOOD/NOTES (${moodEntries.length} entries):\n  ${moodSummary}\n- If mood entries or notes correlate with glucose patterns (e.g. "stressed" near a spike, "sick" near erratic readings), create a trend observation about it. This helps the user see mood↔glucose connections.`;
    }

    const prompt = `Analyze this glucose journal data and return a JSON array of trend observations. Each observation should help the user see a pattern or interesting note in the data they've logged.

RULES:
- Return ONLY valid JSON — an array of objects, no markdown, no explanation outside the JSON
- Each object: { "type": "alert|warning|success|info|streak", "icon": "emoji", "title": "short title", "message": "1-2 sentence explanation", "category": "one of: trend, pattern, streak, spike, timing, comparison, stability, milestone" }
- Identify 3-6 most important/interesting observations
- Categories to look for:
  • TREND: Is glucose generally rising, falling, or stable over the period?
  • PATTERN: Recurring time-of-day patterns (e.g. "post-lunch readings tend higher", "mornings look steady")
  • STREAK: Consecutive in-range readings, days without lows, improvement streaks
  • SPIKE: Rapid glucose changes (>50 mg/dL jumps), roller-coaster patterns
  • TIMING: Best/worst time of day, weekend vs weekday differences
  • COMPARISON: Today vs yesterday, this period vs previous
  • STABILITY: Low variability streaks, consistent overnight readings
  • MILESTONE: First time hitting >70% TIR, longest streak, new personal best
- Be encouraging and specific. Use the actual numbers.
- NEVER suggest medication changes, dosing, eating, or any specific health actions
- Simply observe patterns — do NOT give advice or recommendations
- Use fun, friendly language — this is a personal wellness journal, not a clinical report

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
      max_tokens: 800,
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
// In-memory cache for daily motivation (per user, resets daily)
// ============================================================
const motivationCache = new Map(); // key: `${userId}-${YYYY-MM-DD}` → { message, emoji }

// @route   GET /api/insights/daily-motivation
// @desc    Get a daily T1D-positive motivational message
// @access  Private
router.get('/daily-motivation', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const cacheKey = `${req.user.userId}-${today}`;

    // Return cached if we already generated one today for this user
    if (motivationCache.has(cacheKey)) {
      return res.json(motivationCache.get(cacheKey));
    }

    // Clean old cache entries (anything not from today)
    for (const [key] of motivationCache) {
      if (!key.endsWith(today)) motivationCache.delete(key);
    }

    const groq = getGroqClient();
    if (!groq) {
      const fallback = {
        motivation: "You're showing up for yourself every single day, and that takes real strength. Keep going — you've got this! 💪",
        emoji: '💪'
      };
      return res.json(fallback);
    }

    // Get user name for personalization
    const user = await User.findById(req.user.userId).select('name');
    const name = user?.name || 'friend';

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
      dataContext += `\nTheir most recent mood was "${moodLabels[lastMood.label] || lastMood.label}" ${lastMood.emoji}${lastMood.note ? ` with the note: "${lastMood.note}"` : ''}. Tailor the motivation to acknowledge how they're feeling — if they're tired or stressed, be extra compassionate.`;
    }

    const prompt = `Generate a single daily motivational message for a person living with Type 1 Diabetes who uses a personal glucose journal app called LinkLoop.

RULES:
- Address them by name: ${name}
- 1-3 sentences MAX — short, punchy, heartfelt
- Be specific to the T1D experience (logging readings, staying on top of things, the daily effort, staying strong, self-care)
- Tone: warm, uplifting, empowering — like a supportive friend who truly gets it
- Celebrate the everyday wins of living with T1D
- Vary the theme: sometimes about resilience, sometimes about self-compassion, sometimes about how amazing they are for managing a 24/7 condition
- Include 1 emoji at the end that matches the vibe
- NEVER give medical advice or suggest any health actions
- Do NOT use clichés like "you've got this" every time — be creative and genuine${dataContext}

Return ONLY the motivational message text, nothing else.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You generate short, heartfelt daily motivational messages for people living with Type 1 Diabetes. Return ONLY the message text. Never give medical advice or suggest health actions.' },
        { role: 'user', content: prompt }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.9,
      max_tokens: 150,
    });

    const message = chatCompletion.choices[0]?.message?.content?.trim() || 
      `${name}, every glucose check is proof that you're taking care of yourself. That's something to be proud of today. 🌟`;

    // Pick an emoji from the message or default
    const emojiMatch = message.match(/[\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}]/u);
    const emoji = emojiMatch ? emojiMatch[0] : '🌟';

    const result = { motivation: message, emoji };

    // Cache it for the rest of the day
    motivationCache.set(cacheKey, result);

    res.json(result);
  } catch (err) {
    console.error('Daily motivation error:', err);
    res.json({
      motivation: "Every finger prick, every carb count, every correction — it all adds up. You're doing an incredible job managing something most people can't even imagine. 💛",
      emoji: '💛'
    });
  }
});

module.exports = router;
