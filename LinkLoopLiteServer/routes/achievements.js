const express = require('express');
const auth = require('../middleware/auth');
const Achievement = require('../models/Achievement');
const GlucoseReading = require('../models/GlucoseReading');
const MoodEntry = require('../models/MoodEntry');
const User = require('../models/User');

const router = express.Router();

// ============================================================
// ACHIEVEMENTS — Gamification & Time in Range Streaks
// Personal wellness journal badges. Not medical advice.
// ============================================================

// All possible achievements
const ACHIEVEMENT_DEFS = [
  // Streak achievements
  { key: 'streak_5', title: 'Getting Started', description: '5 consecutive in-range readings', emoji: '🌱', category: 'streak', threshold: 5 },
  { key: 'streak_10', title: 'Building Momentum', description: '10 consecutive in-range readings', emoji: '🔥', category: 'streak', threshold: 10 },
  { key: 'streak_25', title: 'On a Roll', description: '25 consecutive in-range readings', emoji: '⚡', category: 'streak', threshold: 25 },
  { key: 'streak_50', title: 'Unstoppable', description: '50 consecutive in-range readings', emoji: '🏆', category: 'streak', threshold: 50 },
  { key: 'streak_100', title: 'Century Club', description: '100 consecutive in-range readings', emoji: '💯', category: 'streak', threshold: 100 },

  // Logging milestones
  { key: 'log_10', title: 'First Steps', description: 'Logged 10 glucose readings', emoji: '📝', category: 'milestone', threshold: 10 },
  { key: 'log_50', title: 'Dedicated Logger', description: 'Logged 50 glucose readings', emoji: '📊', category: 'milestone', threshold: 50 },
  { key: 'log_100', title: 'Data Warrior', description: 'Logged 100 glucose readings', emoji: '💪', category: 'milestone', threshold: 100 },
  { key: 'log_250', title: 'Data Champion', description: 'Logged 250 glucose readings', emoji: '🏅', category: 'milestone', threshold: 250 },
  { key: 'log_500', title: 'Logging Legend', description: 'Logged 500 glucose readings', emoji: '👑', category: 'milestone', threshold: 500 },

  // Time in Range achievements
  { key: 'tir_70', title: 'In the Zone', description: 'Achieved 70%+ Time in Range (24h)', emoji: '🎯', category: 'consistency', threshold: 70 },
  { key: 'tir_80', title: 'Precision Player', description: 'Achieved 80%+ Time in Range (24h)', emoji: '🎯', category: 'consistency', threshold: 80 },
  { key: 'tir_90', title: 'Bullseye', description: 'Achieved 90%+ Time in Range (24h)', emoji: '🎯', category: 'consistency', threshold: 90 },
  { key: 'tir_100', title: 'Perfect Day', description: '100% Time in Range for a full day', emoji: '✨', category: 'consistency', threshold: 100 },

  // Consistency achievements
  { key: 'days_3', title: '3-Day Streak', description: 'Logged readings 3 days in a row', emoji: '📅', category: 'consistency', threshold: 3 },
  { key: 'days_7', title: 'Week Warrior', description: 'Logged readings 7 days in a row', emoji: '🗓️', category: 'consistency', threshold: 7 },
  { key: 'days_14', title: 'Two-Week Titan', description: 'Logged readings 14 days in a row', emoji: '💎', category: 'consistency', threshold: 14 },
  { key: 'days_30', title: 'Monthly Master', description: 'Logged readings 30 days in a row', emoji: '🌟', category: 'consistency', threshold: 30 },

  // Explorer achievements
  { key: 'first_mood', title: 'Mood Check', description: 'Logged your first mood entry', emoji: '😊', category: 'explorer', threshold: 1 },
  { key: 'mood_10', title: 'Self-Aware', description: 'Logged 10 mood entries', emoji: '🧠', category: 'explorer', threshold: 10 },
  { key: 'first_note', title: 'Dear Diary', description: 'Added your first note to a mood entry', emoji: '📝', category: 'explorer', threshold: 1 },
  { key: 'night_owl', title: 'Night Owl', description: 'Logged an in-range reading between midnight and 5 AM', emoji: '🌙', category: 'explorer', threshold: 1 },
  { key: 'early_bird', title: 'Early Bird', description: 'Logged a reading before 7 AM', emoji: '🌅', category: 'explorer', threshold: 1 },

  // Community
  { key: 'circle_member', title: 'Circle Started', description: 'Added your first Care Circle member', emoji: '👥', category: 'community', threshold: 1 },
];

// @route   GET /api/achievements
// @desc    Get user's achievements (unlocked + locked with progress)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const unlocked = await Achievement.find({ userId: req.user.userId }).sort({ unlockedAt: -1 });
    const unlockedKeys = new Set(unlocked.map(a => a.key));

    // Build full list with lock status
    const achievements = ACHIEVEMENT_DEFS.map(def => {
      const earned = unlocked.find(a => a.key === def.key);
      return {
        key: def.key,
        title: def.title,
        description: def.description,
        emoji: def.emoji,
        category: def.category,
        unlocked: !!earned,
        unlockedAt: earned?.unlockedAt || null,
      };
    });

    // Stats
    const totalUnlocked = unlocked.length;
    const totalPossible = ACHIEVEMENT_DEFS.length;

    res.json({
      achievements,
      stats: {
        unlocked: totalUnlocked,
        total: totalPossible,
        percentage: Math.round((totalUnlocked / totalPossible) * 100),
      },
    });
  } catch (err) {
    console.error('Get achievements error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/achievements/check
// @desc    Evaluate and unlock any new achievements
// @access  Private
router.post('/check', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get already unlocked
    const existing = await Achievement.find({ userId });
    const unlockedKeys = new Set(existing.map(a => a.key));

    // Gather all data needed for evaluation
    const [allReadings, user, moodEntries, circleCount] = await Promise.all([
      GlucoseReading.find({ userId }).sort({ timestamp: -1 }),
      User.findById(userId).select('settings'),
      MoodEntry.find({ userId }),
      require('../models/CareCircle').countDocuments({ ownerId: userId }),
    ]);

    const low = user?.settings?.lowThreshold || 70;
    const high = user?.settings?.highThreshold || 180;

    const newlyUnlocked = [];

    // Helper to unlock
    const unlock = async (def) => {
      if (unlockedKeys.has(def.key)) return;
      try {
        const achievement = new Achievement({
          userId,
          key: def.key,
          title: def.title,
          description: def.description,
          emoji: def.emoji,
          category: def.category,
        });
        await achievement.save();
        newlyUnlocked.push({
          key: def.key,
          title: def.title,
          emoji: def.emoji,
          description: def.description,
        });
        unlockedKeys.add(def.key);
      } catch (e) {
        // Duplicate key — already unlocked (race condition safe)
        if (e.code !== 11000) console.error('Unlock error:', e);
      }
    };

    // ---- LOGGING MILESTONES ----
    const totalReadings = allReadings.length;
    const logDefs = ACHIEVEMENT_DEFS.filter(d => d.key.startsWith('log_'));
    for (const def of logDefs) {
      if (totalReadings >= def.threshold) await unlock(def);
    }

    // ---- IN-RANGE STREAK ----
    let currentStreak = 0;
    let maxStreak = 0;
    for (const r of allReadings) {
      if (r.value >= low && r.value <= high) {
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    }
    // Actually we need longest streak, not just current. Let's recalculate:
    let longestStreak = 0;
    let streak = 0;
    // allReadings sorted desc, reverse for chronological
    const chronological = [...allReadings].reverse();
    for (const r of chronological) {
      if (r.value >= low && r.value <= high) {
        streak++;
        if (streak > longestStreak) longestStreak = streak;
      } else {
        streak = 0;
      }
    }

    const streakDefs = ACHIEVEMENT_DEFS.filter(d => d.key.startsWith('streak_'));
    for (const def of streakDefs) {
      if (longestStreak >= def.threshold) await unlock(def);
    }

    // ---- TIME IN RANGE (24h) ----
    const since24h = new Date();
    since24h.setHours(since24h.getHours() - 24);
    const last24h = allReadings.filter(r => new Date(r.timestamp) >= since24h);
    if (last24h.length >= 3) {
      const inRange = last24h.filter(r => r.value >= low && r.value <= high).length;
      const tir = Math.round((inRange / last24h.length) * 100);

      const tirDefs = ACHIEVEMENT_DEFS.filter(d => d.key.startsWith('tir_'));
      for (const def of tirDefs) {
        if (tir >= def.threshold) await unlock(def);
      }
    }

    // ---- DAILY CONSISTENCY ----
    const daySet = new Set();
    allReadings.forEach(r => {
      daySet.add(new Date(r.timestamp).toISOString().split('T')[0]);
    });
    const sortedDays = [...daySet].sort();
    let consecutiveDays = 1;
    let maxConsecutiveDays = 1;
    for (let i = 1; i < sortedDays.length; i++) {
      const prev = new Date(sortedDays[i - 1]);
      const curr = new Date(sortedDays[i]);
      const diffMs = curr - prev;
      if (diffMs <= 86400000 * 1.5) { // allow slight timezone drift
        consecutiveDays++;
        if (consecutiveDays > maxConsecutiveDays) maxConsecutiveDays = consecutiveDays;
      } else {
        consecutiveDays = 1;
      }
    }
    const dayDefs = ACHIEVEMENT_DEFS.filter(d => d.key.startsWith('days_'));
    for (const def of dayDefs) {
      if (maxConsecutiveDays >= def.threshold) await unlock(def);
    }

    // ---- MOOD ACHIEVEMENTS ----
    if (moodEntries.length >= 1) {
      await unlock(ACHIEVEMENT_DEFS.find(d => d.key === 'first_mood'));
    }
    if (moodEntries.length >= 10) {
      await unlock(ACHIEVEMENT_DEFS.find(d => d.key === 'mood_10'));
    }
    if (moodEntries.some(e => e.note && e.note.trim().length > 0)) {
      await unlock(ACHIEVEMENT_DEFS.find(d => d.key === 'first_note'));
    }

    // ---- EXPLORER: Night Owl & Early Bird ----
    const nightOwlReading = allReadings.find(r => {
      const h = new Date(r.timestamp).getHours();
      return (h >= 0 && h < 5) && r.value >= low && r.value <= high;
    });
    if (nightOwlReading) await unlock(ACHIEVEMENT_DEFS.find(d => d.key === 'night_owl'));

    const earlyBirdReading = allReadings.find(r => {
      const h = new Date(r.timestamp).getHours();
      return h < 7;
    });
    if (earlyBirdReading) await unlock(ACHIEVEMENT_DEFS.find(d => d.key === 'early_bird'));

    // ---- COMMUNITY ----
    if (circleCount > 0) {
      await unlock(ACHIEVEMENT_DEFS.find(d => d.key === 'circle_member'));
    }

    // Build progress info
    const progress = {
      totalReadings,
      longestStreak,
      currentInRangeStreak: (() => {
        let s = 0;
        for (const r of allReadings) { // desc order = most recent first
          if (r.value >= low && r.value <= high) s++;
          else break;
        }
        return s;
      })(),
      consecutiveDays: maxConsecutiveDays,
      totalMoodEntries: moodEntries.length,
    };

    res.json({
      newlyUnlocked,
      progress,
    });
  } catch (err) {
    console.error('Check achievements error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
