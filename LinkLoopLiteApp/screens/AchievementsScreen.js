import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert,
    RefreshControl,
    ScrollView,
    StyleSheet, Text,
    TouchableOpacity,
    View
} from 'react-native';
import ScreenHeader from '../components/ScreenHeader';
import { FadeIn, stagger } from '../config/animations';
import { haptic } from '../config/haptics';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { achievementsAPI } from '../services/api';

const CATEGORY_INFO = {
  streak: { title: '🔥 Streaks', description: 'Consecutive in-range readings' },
  milestone: { title: '📊 Milestones', description: 'Logging achievements' },
  consistency: { title: '🎯 Consistency', description: 'Time in range & daily logging' },
  explorer: { title: '🧭 Explorer', description: 'Discover app features' },
  community: { title: '👥 Community', description: 'Care Circle connections' },
};

const CATEGORY_ORDER = ['streak', 'milestone', 'consistency', 'explorer', 'community'];

export default function AchievementsScreen() {
  const { user } = useAuth();
  const { getAccent } = useTheme();
  const accent = getAccent(user?.role === 'member');

  const [achievements, setAchievements] = useState([]);
  const [stats, setStats] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [newBadges, setNewBadges] = useState([]);

  const loadData = useCallback(async () => {
    try {
      const data = await achievementsAPI.getAll();
      setAchievements(data.achievements || []);
      setStats(data.stats || null);
    } catch (err) {
      console.log('Achievements load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { haptic.light(); setRefreshing(true); loadData(); };

  const handleCheckAchievements = async () => {
    haptic.medium();
    setChecking(true);
    try {
      const result = await achievementsAPI.check();
      setProgress(result.progress);

      if (result.newlyUnlocked && result.newlyUnlocked.length > 0) {
        haptic.success();
        setNewBadges(result.newlyUnlocked);
        // Show celebration
        const badgeNames = result.newlyUnlocked.map(b => `${b.emoji} ${b.title}`).join('\n');
        Alert.alert(
          '🎉 New Badges Unlocked!',
          badgeNames,
          [{ text: 'Awesome!', onPress: () => setNewBadges([]) }]
        );
        // Reload to refresh states
        loadData();
      } else {
        Alert.alert('All Caught Up', 'Keep logging to unlock more badges! 🏆');
      }
    } catch (err) {
      Alert.alert('Error', 'Could not check achievements');
    } finally {
      setChecking(false);
    }
  };

  const groupedAchievements = CATEGORY_ORDER.map(cat => ({
    category: cat,
    ...CATEGORY_INFO[cat],
    items: achievements.filter(a => a.category === cat),
  })).filter(g => g.items.length > 0);

  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const totalCount = achievements.length;
  const pct = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[accent]} tintColor={accent} />}
    >
      {/* Header */}
      <ScreenHeader
        title="Achievements"
        subtitle="Celebrate your T1D wins — every reading counts 🏆"
      />

      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color={accent} style={{ paddingVertical: 60 }} />
        ) : (
          <>
            {/* Overall Progress Card */}
            <FadeIn delay={stagger(0, 100)}>
            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <View>
                  <Text style={styles.progressTitle}>Your Progress</Text>
                  <Text style={styles.progressSubtitle}>{unlockedCount} of {totalCount} badges earned</Text>
                </View>
                <View style={[styles.progressCircle, { borderColor: accent }]}>
                  <Text style={[styles.progressPct, { color: accent }]}>{pct}%</Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: accent }]} />
              </View>

              {/* Quick stats */}
              {progress && (
                <View style={styles.quickStats}>
                  <View style={styles.quickStatItem}>
                    <Text style={[styles.quickStatValue, { color: accent }]}>{progress.totalReadings}</Text>
                    <Text style={styles.quickStatLabel}>Readings</Text>
                  </View>
                  <View style={styles.quickStatItem}>
                    <Text style={[styles.quickStatValue, { color: accent }]}>{progress.longestStreak}</Text>
                    <Text style={styles.quickStatLabel}>Best Streak</Text>
                  </View>
                  <View style={styles.quickStatItem}>
                    <Text style={[styles.quickStatValue, { color: accent }]}>{progress.currentInRangeStreak}</Text>
                    <Text style={styles.quickStatLabel}>Current Streak</Text>
                  </View>
                  <View style={styles.quickStatItem}>
                    <Text style={[styles.quickStatValue, { color: accent }]}>{progress.consecutiveDays}</Text>
                    <Text style={styles.quickStatLabel}>Day Streak</Text>
                  </View>
                </View>
              )}
            </View>
            </FadeIn>

            <FadeIn delay={stagger(1, 100)}>
            {/* Check for new achievements button */}
            <TouchableOpacity
              style={styles.checkButton}
              onPress={handleCheckAchievements}
              disabled={checking}
            >
              {checking ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.checkButtonIcon}>🔍</Text>
                  <View>
                    <Text style={styles.checkButtonText}>Check for New Badges</Text>
                    <Text style={styles.checkButtonSub}>Evaluate your data for unlockable achievements</Text>
                  </View>
                </>
              )}
            </TouchableOpacity>

            {/* Achievement Categories */}
            {groupedAchievements.map((group) => (
              <View key={group.category} style={styles.categorySection}>
                <Text style={styles.categoryTitle}>{group.title}</Text>
                <Text style={styles.categoryDesc}>{group.description}</Text>

                <View style={styles.badgeGrid}>
                  {group.items.map((badge) => (
                    <View
                      key={badge.key}
                      style={[
                        styles.badgeCard,
                        badge.unlocked ? [styles.badgeUnlocked, { borderColor: accent }] : styles.badgeLocked,
                      ]}
                    >
                      <Text style={[
                        styles.badgeEmoji,
                        !badge.unlocked && styles.badgeEmojiLocked,
                      ]}>
                        {badge.unlocked ? badge.emoji : '🔒'}
                      </Text>
                      <Text style={[
                        styles.badgeTitle,
                        !badge.unlocked && styles.badgeTitleLocked,
                      ]} numberOfLines={2}>
                        {badge.title}
                      </Text>
                      <Text style={styles.badgeDesc} numberOfLines={3}>{badge.description}</Text>
                      {badge.unlocked && badge.unlockedAt && (
                        <Text style={[styles.badgeDate, { color: accent }]}>
                          {new Date(badge.unlockedAt).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            ))}

            {/* Info card */}
            <View style={styles.infoCard}>
              <Text style={styles.infoIcon}>💡</Text>
              <Text style={styles.infoText}>
                Badges are earned by logging glucose readings, staying in range, tracking your mood, 
                and using LinkLoop consistently. Keep going — every check-in counts!
              </Text>
            </View>
            </FadeIn>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111111' },

  content: { padding: 20 },

  // Progress Card
  progressCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  progressTitle: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff' },
  progressSubtitle: { fontSize: 13, color: '#A0A0A0', marginTop: 3 },
  progressCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1A2235',
    borderWidth: 3,
    borderColor: '#4A90D9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressPct: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#4A90D9' },
  progressBarBg: {
    height: 10,
    backgroundColor: '#2C2C2E',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 15,
  },
  progressBarFill: {
    height: 10,
    backgroundColor: '#4A90D9',
    borderRadius: 5,
  },
  quickStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  quickStatItem: { alignItems: 'center' },
  quickStatValue: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#4A90D9' },
  quickStatLabel: { fontSize: TYPE.xs, color: '#888', marginTop: 3 },

  // Check Button
  checkButton: {
    backgroundColor: '#1A2235',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
    borderWidth: 1,
    borderColor: '#2A3A50',
  },
  checkButtonIcon: { fontSize: TYPE.h3, marginRight: 12 },
  checkButtonText: { fontSize: 15, fontWeight: TYPE.bold, color: '#fff' },
  checkButtonSub: { fontSize: TYPE.sm, color: '#A0A0A0', marginTop: 2 },

  // Categories
  categorySection: { marginBottom: 25 },
  categoryTitle: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 4 },
  categoryDesc: { fontSize: TYPE.sm, color: '#888', marginBottom: 12 },

  // Badge Grid
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  badgeCard: {
    width: '48%',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  badgeUnlocked: {
    backgroundColor: '#1A2235',
    borderColor: '#4A90D9',
  },
  badgeLocked: {
    backgroundColor: '#1C1C1E',
    borderColor: '#2C2C2E',
  },
  badgeEmoji: { fontSize: TYPE.h1, marginBottom: 6 },
  badgeEmojiLocked: { opacity: 0.4 },
  badgeTitle: { fontSize: 13, fontWeight: TYPE.bold, color: '#fff', textAlign: 'center', marginBottom: 4 },
  badgeTitleLocked: { color: '#666' },
  badgeDesc: { fontSize: 11, color: '#888', textAlign: 'center', lineHeight: 15 },
  badgeDate: { fontSize: TYPE.xs, color: '#4A90D9', marginTop: 6 },

  // Info Card
  infoCard: {
    backgroundColor: '#1A2235',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#2A3A50',
  },
  infoIcon: { fontSize: 20, marginRight: 12, marginTop: 2 },
  infoText: { flex: 1, fontSize: 13, color: '#A0A0A0', lineHeight: 19 },
});
