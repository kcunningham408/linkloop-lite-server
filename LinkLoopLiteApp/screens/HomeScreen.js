import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { alertsAPI, glucoseAPI } from '../services/api';

const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export default function HomeScreen({ navigation }) {
  const { user, circleRemoved, clearCircleRemoved, checkAuth } = useAuth();
  const isMember = user?.role === 'member';
  const lowThreshold = user?.settings?.lowThreshold ?? 70;
  const highThreshold = user?.settings?.highThreshold ?? 180;

  const [stats, setStats] = useState(null);
  const [latestGlucose, setLatestGlucose] = useState(null);
  const [warriorName, setWarriorName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeAlertCount, setActiveAlertCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      if (isMember && user?.linkedOwnerId) {
        try {
          const data = await glucoseAPI.getMemberView(user.linkedOwnerId, 24);
          setLatestGlucose(data.latest || null);
          setStats(data.stats || null);
          if (data.ownerName) setWarriorName(data.ownerName);
        } catch (memberErr) {
          // If the member-view call fails (e.g. removed from circle), refresh profile
          // The server will return updated role/linkedOwnerId
          console.log('Member view failed, refreshing auth:', memberErr.message);
          await checkAuth();
        }
      } else {
        const [statsData, latestData] = await Promise.allSettled([
          glucoseAPI.getStats(24),
          glucoseAPI.getLatest(),
        ]);
        if (statsData.status === 'fulfilled') setStats(statsData.value);
        if (latestData.status === 'fulfilled') setLatestGlucose(latestData.value);
      }
      try {
        const alertData = await alertsAPI.getActiveAlerts().catch(() => ({ activeCount: 0 }));
        setActiveAlertCount(alertData.activeCount || 0);
      } catch (e) {}
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

  // Show popup if this user was removed from a Care Circle
  useEffect(() => {
    if (circleRemoved) {
      Alert.alert(
        'Removed from Care Circle',
        'You are no longer a member of a Care Circle. You will no longer see their glucose data or receive alerts.\n\nIf this was a mistake, ask the warrior to send you a new invite.',
        [{ text: 'OK', onPress: () => clearCircleRemoved() }]
      );
    }
  }, [circleRemoved]);

  useEffect(() => {
    const interval = setInterval(() => { loadData(); }, AUTO_REFRESH_MS);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') loadData();
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
    const arrows = { rising_fast: '\u2191\u2191', rising: '\u2191', stable: '\u2192', falling: '\u2193', falling_fast: '\u2193\u2193' };
    return arrows[trend] || '\u2192';
  };

  const minsOld = latestGlucose?.timestamp
    ? Math.floor((Date.now() - new Date(latestGlucose.timestamp).getTime()) / 60000)
    : null;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4A90D9']} />}
    >
      {/* Compact Hero */}
      <LinearGradient
        colors={isMember ? ['#34C759', '#2A9E47'] : ['#4A90D9', '#3A7BC8']}
        style={styles.hero}
      >
        <Text style={styles.heroTitle}>{'\u221E'} LinkLoop</Text>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeEmoji}>{isMember ? '\uD83D\uDC41\uFE0F' : '\uD83E\uDE7A'}</Text>
          <Text style={styles.heroBadgeText}>
            {isMember
              ? 'Watching ' + (warriorName || 'your warrior') + "'s loop"
              : (user?.name ? 'Welcome back, ' + user.name : 'Stay Connected, Stay in Range')}
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.content}>
        {/* Glucose Card */}
        <TouchableOpacity style={styles.glucoseCard} onPress={() => navigation.navigate('CGM')} activeOpacity={0.8}>
          {latestGlucose ? (
            <View>
              {minsOld > 30 && (
                <View style={styles.staleWarning}>
                  <Text style={styles.staleWarningText}>{'\u26A0\uFE0F'} Data is {minsOld} min old</Text>
                </View>
              )}
              <View style={styles.glucoseRow}>
                <View style={styles.glucoseLeft}>
                  <Text style={styles.glucoseLabel}>
                    {isMember ? (warriorName || 'Warrior') + "'s Glucose" : 'Current Glucose'}
                  </Text>
                  <View style={styles.glucoseReadingRow}>
                    <Text style={[styles.glucoseValue, { color: getGlucoseColor(latestGlucose.value) }]}>
                      {latestGlucose.value}
                    </Text>
                    <Text style={styles.glucoseUnit}>mg/dL</Text>
                    <Text style={[styles.glucoseTrend, { color: getGlucoseColor(latestGlucose.value) }]}>
                      {getTrendArrow(latestGlucose.trend)}
                    </Text>
                  </View>
                  <View style={[styles.glucoseStatusBadge, { backgroundColor: getGlucoseColor(latestGlucose.value) + '20' }]}>
                    <Text style={[styles.glucoseStatusText, { color: getGlucoseColor(latestGlucose.value) }]}>
                      {getGlucoseStatus(latestGlucose.value)}
                    </Text>
                  </View>
                </View>
                <View style={styles.glucoseRight}>
                  <Text style={styles.glucoseTime}>
                    {new Date(latestGlucose.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={styles.glucoseChevron}>{'\u203A'}</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.glucoseRow}>
              <View>
                <Text style={styles.glucoseLabel}>
                  {isMember ? (warriorName || 'Warrior') + "'s Glucose" : 'Current Glucose'}
                </Text>
                <Text style={styles.glucoseEmpty}>
                  {isMember ? 'No readings from your warrior yet' : 'No readings yet \u2014 tap to sync'}
                </Text>
              </View>
              <Text style={styles.glucoseChevron}>{'\u203A'}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Today's Overview */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Today's Overview</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#4A90D9" style={{ paddingVertical: 20 }} />
          ) : stats && stats.count > 0 ? (
            <View style={styles.statsRow}>
              <StatBox label="Time in Range" value={stats.timeInRange + '%'} color="#4A90D9" />
              <StatBox label="Avg Glucose" value={'' + stats.average} color="#FFA500" />
              <StatBox label="Low Events" value={'' + stats.low} color="#FF6B6B" />
              <StatBox label="High Events" value={'' + (stats.high || 0)} color="#FFA500" />
            </View>
          ) : (
            <View style={styles.emptyStats}>
              <Text style={styles.emptyStatsText}>
                {isMember ? 'No readings from your warrior today' : 'No readings today \u2014 connect Dexcom or log manually'}
              </Text>
            </View>
          )}
        </View>

        {/* Active Alerts Banner */}
        {activeAlertCount > 0 && (
          <TouchableOpacity
            style={styles.alertBanner}
            onPress={() => navigation.navigate('Alerts')}
            activeOpacity={0.8}
          >
            <Text style={styles.alertBannerIcon}>{'\uD83D\uDD14'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertBannerTitle}>
                {activeAlertCount} Active Alert{activeAlertCount > 1 ? 's' : ''}
              </Text>
              <Text style={styles.alertBannerSub}>Tap to view & acknowledge</Text>
            </View>
            <Text style={styles.alertBannerArrow}>{'\u203A'}</Text>
          </TouchableOpacity>
        )}

        {/* Quick Actions */}
        <Text style={styles.quickActionsTitle}>Quick Actions</Text>
        <View style={styles.quickActions}>
          <QuickAction
            emoji={'\uD83D\uDCAC'}
            label="Messages"
            onPress={() => navigation.navigate('Messages')}
          />
          {isMember ? (
            <>
              <QuickAction
                emoji={'\uD83D\uDD14'}
                label="Alerts"
                badge={activeAlertCount > 0 ? activeAlertCount : null}
                onPress={() => navigation.navigate('Alerts')}
              />
              <QuickAction
                emoji={'\u2699\uFE0F'}
                label="Profile"
                onPress={() => navigation.navigate('Profile')}
              />
            </>
          ) : (
            <>
              <QuickAction
                emoji={'\u2728'}
                label="Insights"
                onPress={() => navigation.navigate('Insights')}
              />
              <QuickAction
                emoji={'\uD83D\uDCDD'}
                label="Mood"
                onPress={() => navigation.navigate('Mood')}
              />
              <QuickAction
                emoji={'\uD83D\uDD14'}
                label="Alerts"
                badge={activeAlertCount > 0 ? activeAlertCount : null}
                onPress={() => navigation.navigate('Alerts')}
              />
            </>
          )}
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerIcon}>{'\uD83D\uDC9A'}</Text>
          <Text style={styles.disclaimerText}>
            LinkLoop is a wellness companion — not a medical device. Always consult your care team.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function QuickAction({ emoji, label, onPress, badge }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.quickActionInner}>
        <Text style={styles.quickActionEmoji}>{emoji}</Text>
        {badge ? (
          <View style={styles.quickActionBadge}>
            <Text style={styles.quickActionBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
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
  container: { flex: 1, backgroundColor: '#111111' },
  hero: { padding: 24, alignItems: 'center', paddingTop: 35, paddingBottom: 30 },
  heroTitle: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
  heroBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center' },
  heroBadgeEmoji: { fontSize: 18, marginRight: 8 },
  heroBadgeText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  content: { padding: 16 },

  // Glucose Card
  glucoseCard: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#2C2C2E' },
  staleWarning: { backgroundColor: 'rgba(255,165,0,0.15)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,165,0,0.4)' },
  staleWarningText: { fontSize: 12, color: '#FFA500', fontWeight: '600' },
  glucoseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  glucoseLeft: {},
  glucoseLabel: { fontSize: 12, color: '#888', fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  glucoseReadingRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 },
  glucoseValue: { fontSize: 44, fontWeight: 'bold' },
  glucoseUnit: { fontSize: 16, color: '#888', marginLeft: 4 },
  glucoseTrend: { fontSize: 28, marginLeft: 10, fontWeight: 'bold' },
  glucoseStatusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  glucoseStatusText: { fontSize: 12, fontWeight: 'bold' },
  glucoseRight: { alignItems: 'flex-end' },
  glucoseTime: { fontSize: 13, color: '#888', marginBottom: 4 },
  glucoseChevron: { fontSize: 28, color: '#555', fontWeight: '300' },
  glucoseEmpty: { fontSize: 14, color: '#888', marginTop: 4 },

  // Stats Card
  statsCard: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#2C2C2E' },
  statsTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 14 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  statLabel: { fontSize: 10, color: '#A0A0A0', textAlign: 'center' },
  emptyStats: { paddingVertical: 12, alignItems: 'center' },
  emptyStatsText: { fontSize: 14, color: '#888', textAlign: 'center' },

  // Alert Banner
  alertBanner: { backgroundColor: '#2A1A1A', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 16, borderWidth: 2, borderColor: '#FF6B6B' },
  alertBannerIcon: { fontSize: 28, marginRight: 12 },
  alertBannerTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  alertBannerSub: { fontSize: 12, color: '#FF6B6B', marginTop: 2 },
  alertBannerArrow: { fontSize: 28, color: '#FF6B6B', fontWeight: '300' },

  // Quick Actions
  quickActionsTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  quickActions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  quickAction: { flex: 1, alignItems: 'center', backgroundColor: '#1C1C1E', borderRadius: 14, paddingVertical: 16, marginHorizontal: 4, borderWidth: 1, borderColor: '#2C2C2E' },
  quickActionInner: { position: 'relative', marginBottom: 6 },
  quickActionEmoji: { fontSize: 28 },
  quickActionBadge: { position: 'absolute', top: -6, right: -10, backgroundColor: '#FF6B6B', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  quickActionBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#fff' },
  quickActionLabel: { fontSize: 12, color: '#A0A0A0', fontWeight: '600' },

  // Disclaimer
  disclaimer: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20, borderWidth: 1, borderColor: '#2C2C2E' },
  disclaimerIcon: { fontSize: 18, marginRight: 10, marginTop: 1 },
  disclaimerText: { flex: 1, fontSize: 12, color: '#888', lineHeight: 18 },
});
