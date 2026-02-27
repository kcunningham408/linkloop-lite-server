import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { glucoseAPI } from '../services/api';

const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const isMember = user?.role === 'member';
  const lowThreshold = user?.settings?.lowThreshold ?? 70;
  const highThreshold = user?.settings?.highThreshold ?? 180;

  const [stats, setStats] = useState(null);
  const [latestGlucose, setLatestGlucose] = useState(null);
  const [warriorName, setWarriorName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      if (isMember && user?.linkedOwnerId) {
        const data = await glucoseAPI.getMemberView(user.linkedOwnerId, 24);
        setLatestGlucose(data.latest || null);
        setStats(data.stats || null);
        if (data.ownerName) setWarriorName(data.ownerName);
      } else {
        const [statsData, latestData] = await Promise.allSettled([
          glucoseAPI.getStats(24),
          glucoseAPI.getLatest(),
        ]);
        if (statsData.status === 'fulfilled') setStats(statsData.value);
        if (latestData.status === 'fulfilled') setLatestGlucose(latestData.value);
      }
    } catch (err) {
      console.log('Home load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isMember, user?.linkedOwnerId]);

  useFocusEffect(
    useCallback(() => { loadData(); }, [loadData])
  );

  // Auto-refresh every 5 min while screen is open — matches Dexcom G7 update interval
  useEffect(() => {
    const interval = setInterval(() => { loadData(); }, AUTO_REFRESH_MS);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') loadData(); // refresh when user returns to app from background
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const getGlucoseColor = (value) => {
    if (!value) return '#4A90D9';
    if (value < lowThreshold) return '#FF6B6B';
    if (value > highThreshold) return '#FFA500';
    return '#4A90D9';
  };

  const getGlucoseStatus = (value) => {
    if (!value) return '';
    if (value < lowThreshold) return 'LOW';
    if (value > highThreshold) return 'HIGH';
    return 'IN RANGE';
  };

  const getTrendArrow = (trend) => {
    const arrows = { rising_fast: '↑↑', rising: '↑', stable: '→', falling: '↓', falling_fast: '↓↓' };
    return arrows[trend] || '→';
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4A90D9']} />}
    >
      <LinearGradient
        colors={isMember ? ['#34C759', '#2A9E47'] : ['#4A90D9', '#3A7BC8']}
        style={styles.heroSection}
      >
        <Text style={styles.heroTitle}>∞ LinkLoop</Text>
        <Text style={styles.heroSubtitle}>
          {isMember ? `You're in the loop` : 'Stay Connected, Stay in Range'}
        </Text>
        <View style={styles.statsBadge}>
          <Text style={styles.statsEmoji}>{isMember ? '�' : '�💙'}</Text>
          <Text style={styles.statsText}>
            {isMember
              ? `Watching ${warriorName || 'your warrior'}'s loop`
              : (user?.name ? `Welcome, ${user.name}!` : 'Your T1D Support Network')}
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>
          {isMember ? `${warriorName || 'Warrior'}'s Loop` : 'Welcome to LinkLoop'}
        </Text>
        <Text style={styles.description}>
          {isMember
            ? `You have read-only access to ${warriorName || 'your warrior'}'s real-time glucose data. You'll see their live readings, stats, and alerts below.`
            : 'LinkLoop connects Type 1 Diabetics and their caregivers through real-time CGM sharing, supply tracking, AI insights, and community support.'}
        </Text>

        {/* Current Glucose Reading */}
        <TouchableOpacity style={styles.glucoseCard} onPress={() => navigation.navigate('CGM')}>
          {latestGlucose ? (
            <View>
              {(() => {
                const minsOld = Math.floor((Date.now() - new Date(latestGlucose.timestamp).getTime()) / 60000);
                return minsOld > 30 ? (
                  <View style={styles.staleWarning}>
                    <Text style={styles.staleWarningText}>⚠️ Data is {minsOld} min old</Text>
                  </View>
                ) : null;
              })()}
              <View style={styles.glucoseCardContent}>
                <View style={styles.glucoseLeft}>
                  <Text style={styles.glucoseCardLabel}>
                    {isMember ? `${warriorName || 'Warrior'}'s Glucose` : 'Current Glucose'}
                  </Text>
                  <View style={styles.glucoseReadingRow}>
                    <Text style={[styles.glucoseCardValue, { color: getGlucoseColor(latestGlucose.value) }]}>
                      {latestGlucose.value}
                    </Text>
                    <Text style={styles.glucoseCardUnit}>mg/dL</Text>
                    <Text style={[styles.glucoseCardTrend, { color: getGlucoseColor(latestGlucose.value) }]}>
                      {getTrendArrow(latestGlucose.trend)}
                    </Text>
                  </View>
                  <View style={[styles.glucoseStatusBadge, { backgroundColor: getGlucoseColor(latestGlucose.value) + '20' }]}>
                    <Text style={[styles.glucoseStatusText, { color: getGlucoseColor(latestGlucose.value) }]}>
                      {getGlucoseStatus(latestGlucose.value)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.glucoseCardTime}>
                  {new Date(latestGlucose.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.glucoseCardContent}>
              <View>
                <Text style={styles.glucoseCardLabel}>
                  {isMember ? `${warriorName || 'Warrior'}'s Glucose` : 'Current Glucose'}
                </Text>
                <Text style={styles.glucoseCardEmpty}>
                  {isMember ? 'No readings from your warrior yet' : 'No readings yet — tap to log'}
                </Text>
              </View>
              <Text style={styles.glucoseCardArrow}>›</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Feature grid — warriors get full set, members get their relevant subset */}
        <View style={styles.featuresGrid}>
          <FeatureCard emoji="📊" title="Live Glucose" description={isMember ? "See real-time CGM data" : "Share real-time glucose data"} onPress={() => navigation.navigate('CGM')} />
          {isMember ? (
            <>
              <FeatureCard emoji="💬" title="Message" description="Chat with your warrior" onPress={() => navigation.navigate('Chat')} />
              <FeatureCard emoji="�" title="Alerts" description="Low & high notifications" onPress={() => navigation.navigate('Alerts')} />
              <FeatureCard emoji="⚙️" title="Profile" description="Your Loop Member settings" onPress={() => navigation.navigate('Profile')} />
            </>
          ) : (
            <>
              <FeatureCard emoji="👥" title="Care Circle" description="Connect with caregivers" onPress={() => navigation.navigate('Circle')} />
              <FeatureCard emoji="📦" title="Supply Tracker" description="Never run out of supplies" onPress={() => navigation.navigate('Supplies')} />
              <FeatureCard emoji="✨" title="AI Insights" description="Pattern analysis by AI" onPress={() => navigation.navigate('Insights')} />
              <FeatureCard emoji="📝" title="Mood & Notes" description="Track how you're feeling" onPress={() => navigation.navigate('Mood')} />
              <FeatureCard emoji="🏆" title="Achievements" description="Earn badges & streaks" onPress={() => navigation.navigate('Achievements')} />
            </>
          )}
        </View>

        <View style={styles.quickStats}>
          <Text style={styles.quickStatsTitle}>Today's Overview</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#4A90D9" style={{ paddingVertical: 20 }} />
          ) : stats && stats.count > 0 ? (
            <View style={styles.statsRow}>
              <StatBox label="Time in Range" value={stats.timeInRange + '%'} color="#4A90D9" />
              <StatBox label="Avg Glucose" value={'' + stats.average} color="#FFA500" />
              <StatBox label="Low Events" value={'' + stats.low} color="#FF6B6B" />
            </View>
          ) : (
            <View style={styles.emptyStats}>
              <Text style={styles.emptyStatsText}>No glucose readings today — tap CGM Sync to get started</Text>
            </View>
          )}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>💡</Text>
          <Text style={styles.infoText}>
            LinkLoop — your T1D wellness companion. Built with ❤️ for the T1D community.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function FeatureCard({ emoji, title, description, onPress }) {
  return (
    <TouchableOpacity style={styles.featureCard} onPress={onPress}>
      <Text style={styles.featureEmoji}>{emoji}</Text>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureDescription}>{description}</Text>
    </TouchableOpacity>
  );
}

function StatBox({ label, value, color }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
  },
  heroSection: {
    padding: 30,
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 50,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  heroSubtitle: {
    fontSize: 18,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 20,
  },
  statsBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statsEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  statsText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    color: '#A0A0A0',
    lineHeight: 24,
    marginBottom: 20,
  },
  glucoseCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  staleWarning: {
    backgroundColor: 'rgba(255,165,0,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,165,0,0.4)',
  },
  staleWarningText: {
    fontSize: 12,
    color: '#FFA500',
    fontWeight: '600',
  },
  glucoseCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  glucoseLeft: {},
  glucoseCardLabel: {
    fontSize: 13,
    color: '#888',
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  glucoseReadingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  glucoseCardValue: {
    fontSize: 42,
    fontWeight: 'bold',
  },
  glucoseCardUnit: {
    fontSize: 16,
    color: '#888',
    marginLeft: 4,
  },
  glucoseCardTrend: {
    fontSize: 28,
    marginLeft: 10,
    fontWeight: 'bold',
  },
  glucoseStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  glucoseStatusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  glucoseCardTime: {
    fontSize: 13,
    color: '#888',
  },
  glucoseCardEmpty: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  glucoseCardArrow: {
    fontSize: 28,
    color: '#555',
    fontWeight: '300',
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  featureCard: {
    width: '48%',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  featureEmoji: {
    fontSize: 40,
    marginBottom: 10,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
    textAlign: 'center',
  },
  featureDescription: {
    fontSize: 12,
    color: '#A0A0A0',
    textAlign: 'center',
  },
  quickStats: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  quickStatsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 15,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 11,
    color: '#A0A0A0',
    textAlign: 'center',
  },
  emptyStats: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  emptyStatsText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: '#1A2235',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2A3A50',
  },
  infoIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#A0A0A0',
    lineHeight: 20,
  },
});
