import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Dimensions, RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import BloomBackground from '../components/BloomBackground';
import GlassCard from '../components/GlassCard';
import GlucoseRing from '../components/GlucoseRing';
import StatArc from '../components/StatArc';
import { FadeIn, stagger } from '../config/animations';
import { haptic } from '../config/haptics';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { alertsAPI, glucoseAPI } from '../services/api';

const { width: SCREEN_W } = Dimensions.get('window');

const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export default function HomeScreen({ navigation }) {
  const { user, circleRemoved, clearCircleRemoved, checkAuth } = useAuth();
  const { getAccent, getGradient } = useTheme();
  const isMember = user?.role === 'member';
  const accent = getAccent(isMember);
  const lowThreshold = user?.settings?.lowThreshold ?? 70;
  const highThreshold = user?.settings?.highThreshold ?? 180;

  const [stats, setStats] = useState(null);
  const [latestGlucose, setLatestGlucose] = useState(null);
  const [warriorName, setWarriorName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeAlertCount, setActiveAlertCount] = useState(0);
  const [lastCGMSync, setLastCGMSync] = useState(null);

  const loadData = useCallback(async () => {
    try {
      if (isMember && user?.linkedOwnerId) {
        try {
          const data = await glucoseAPI.getMemberView(user.linkedOwnerId, 24);
          setLatestGlucose(data.latest || null);
          setStats(data.stats || null);
          if (data.ownerName) setWarriorName(user?.warriorDisplayName || data.ownerName);
          if (data.lastCGMSync) setLastCGMSync(data.lastCGMSync);
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

  const onRefresh = () => { haptic.light(); setRefreshing(true); loadData(); };

  const shareGlucoseSnapshot = async () => {
    if (!latestGlucose) return;
    haptic.medium();
    const status = getGlucoseStatus(latestGlucose.value);
    const trend = getTrendArrow(latestGlucose.trend);
    const time = new Date(latestGlucose.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const name = isMember ? (warriorName || 'Warrior') : (user?.name || 'My');
    const msg = `∞ LinkLoop · ${name}'s glucose\n${latestGlucose.value} mg/dL ${trend} · ${status}\n🕐 ${time}${minsOld != null ? ' (' + minsOld + 'm ago)' : ''}`;
    try {
      await Share.share({ message: msg });
    } catch (e) {}
  };

  const getGlucoseColor = (value) => {
    if (!value) return accent;
    if (value < lowThreshold) return '#FF6B6B';
    if (value > highThreshold) return '#FFA500';
    return accent;
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

  // ── Glucose card glow ──
  const glowColor = latestGlucose ? getGlucoseColor(latestGlucose.value) : accent;
  const isOutOfRange = latestGlucose && (latestGlucose.value < lowThreshold || latestGlucose.value > highThreshold);

  const glowPulse = useSharedValue(0.35);
  useEffect(() => {
    glowPulse.value = withRepeat(
      withTiming(isOutOfRange ? 0.8 : 0.5, { duration: isOutOfRange ? 1200 : 2400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [isOutOfRange]);

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    shadowOpacity: glowPulse.value,
    shadowColor: glowColor,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: isOutOfRange ? 16 : 10,
    elevation: 10,
    borderColor: glowColor + (isOutOfRange ? '60' : '30'),
  }));

  // Live status dot pulse
  const livePulse = useSharedValue(0.4);
  useEffect(() => {
    livePulse.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);
  const liveDotStyle = useAnimatedStyle(() => ({
    opacity: livePulse.value,
    transform: [{ scale: 0.8 + livePulse.value * 0.2 }],
  }));

  /* ── Stat arc helper ── */
  const ARC_SIZE = Math.floor((SCREEN_W - 64) / 4);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 90 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} colors={[accent]} />}
    >
      {/* ─── Hero gradient header ─── */}
      <FadeIn delay={0} slideY={0}>
        <BloomBackground accent={accent} secondary={getGradient(isMember)[1] || accent} variant="hero" contentStyle={styles.hero}>
          <Text style={styles.heroTitle}>{'\u221E'} LinkLoop</Text>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeEmoji}>{isMember ? '\uD83D\uDC41\uFE0F' : '\uD83E\uDE7A'}</Text>
            <Text style={styles.heroBadgeText}>
              {isMember
                ? 'Watching ' + (warriorName || 'your warrior') + "'s loop"
                : user?.name ? 'Welcome back, ' + user.name : 'Stay Connected, Stay in Range'}
            </Text>
          </View>
          {isMember && lastCGMSync && (
            <View style={styles.syncBadge}>
              <Text style={styles.syncBadgeText}>
                {'🩸 CGM synced ' + (() => {
                  const mins = Math.floor((Date.now() - new Date(lastCGMSync).getTime()) / 60000);
                  if (mins < 1) return 'just now';
                  if (mins < 60) return mins + 'm ago';
                  const hrs = Math.floor(mins / 60);
                  if (hrs < 24) return hrs + 'h ago';
                  return Math.floor(hrs / 24) + 'd ago';
                })()}
              </Text>
            </View>
          )}
        </BloomBackground>
      </FadeIn>

      <View style={styles.content}>
        {/* ─── Glucose Ring Hero Card ─── */}
        <FadeIn delay={stagger(0, 100)}>
          <Animated.View style={[styles.glucoseGlow, glowAnimatedStyle]}>
            <TouchableOpacity activeOpacity={0.8} onPress={() => { haptic.light(); navigation.navigate('CGM'); }} onLongPress={shareGlucoseSnapshot}>
              <GlassCard accent={glowColor} glow>
                {latestGlucose ? (
                  <View style={styles.glucoseInner}>
                    {minsOld > 30 && (
                      <View style={styles.staleWarning}>
                        <Text style={styles.staleWarningText}>{'\u26A0\uFE0F'} Data is {minsOld} min old</Text>
                      </View>
                    )}
                    <View style={styles.glucoseLabelRow}>
                      <Text style={styles.glucoseLabel}>
                        {isMember ? (warriorName || 'Warrior') + "'s Glucose" : 'Current Glucose'}
                      </Text>
                      {isMember && minsOld != null && minsOld <= 30 && (
                        <Animated.View style={[styles.liveDot, { backgroundColor: minsOld < 5 ? '#4CAF50' : minsOld < 15 ? '#FFA500' : '#FF6B6B' }, liveDotStyle]} />
                      )}
                    </View>
                    <View style={styles.ringRow}>
                      <GlucoseRing
                        value={latestGlucose.value}
                        trend={latestGlucose.trend}
                        accentColor={getGlucoseColor(latestGlucose.value)}
                        lowThreshold={lowThreshold}
                        highThreshold={highThreshold}
                        size={150}
                      />
                      <View style={styles.ringMeta}>
                        <View style={[styles.statusPill, { backgroundColor: getGlucoseColor(latestGlucose.value) + '25' }]}>
                          <Text style={[styles.statusPillText, { color: getGlucoseColor(latestGlucose.value) }]}>
                            {getGlucoseStatus(latestGlucose.value)}
                          </Text>
                        </View>
                        <Text style={styles.ringTime}>
                          {new Date(latestGlucose.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                        <Text style={styles.ringHint}>Tap for details · Hold to share</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={styles.emptyGlucose}>
                    <Text style={styles.glucoseLabel}>
                      {isMember ? (warriorName || 'Warrior') + "'s Glucose" : 'Current Glucose'}
                    </Text>
                    <Text style={styles.glucoseEmpty}>
                      {isMember ? 'No readings from your warrior yet' : 'No readings yet — tap to sync'}
                    </Text>
                  </View>
                )}
              </GlassCard>
            </TouchableOpacity>
          </Animated.View>
        </FadeIn>

        {/* ─── Today's Overview — arc stats ─── */}
        <FadeIn delay={stagger(1, 100)}>
          <GlassCard accent={accent}>
            <Text style={styles.statsTitle}>Today's Overview</Text>
            {loading ? (
              <ActivityIndicator size="small" color={accent} style={{ paddingVertical: 20 }} />
            ) : stats && stats.count > 0 ? (
              <View style={styles.arcsRow}>
                <StatArc value={stats.timeInRange} maxValue={100} label="In Range" suffix="%" color={accent} size={ARC_SIZE} />
                <StatArc value={stats.average} maxValue={300} label="Avg mg/dL" suffix="" color="#FFA500" size={ARC_SIZE} />
                <StatArc value={stats.low} maxValue={Math.max(stats.low, 5)} label="Lows" suffix="" color="#FF6B6B" size={ARC_SIZE} />
                <StatArc value={stats.high || 0} maxValue={Math.max(stats.high || 0, 5)} label="Highs" suffix="" color="#FFA500" size={ARC_SIZE} />
              </View>
            ) : (
              <View style={styles.emptyStats}>
                <Text style={styles.emptyStatsText}>
                  {isMember ? 'No readings from your warrior today' : 'No readings today — connect Dexcom or log manually'}
                </Text>
              </View>
            )}
          </GlassCard>
        </FadeIn>

        {/* ─── Active Alerts Banner ─── */}
        {activeAlertCount > 0 && (
          <FadeIn delay={stagger(2, 100)}>
            <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Alerts')}>
              <GlassCard accent="#FF6B6B" glow>
                <View style={styles.alertRow}>
                  <Text style={styles.alertIcon}>{'\uD83D\uDD14'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertTitle}>
                      {activeAlertCount} Active Alert{activeAlertCount > 1 ? 's' : ''}
                    </Text>
                    <Text style={styles.alertSub}>Tap to view & acknowledge</Text>
                  </View>
                  <Text style={styles.alertArrow}>{'\u203A'}</Text>
                </View>
              </GlassCard>
            </TouchableOpacity>
          </FadeIn>
        )}

        {/* ─── Quick Actions ─── */}
        <FadeIn delay={stagger(3, 100)}>
          <Text style={styles.quickActionsTitle}>Quick Actions</Text>
          <View style={styles.quickActions}>
            <QuickAction emoji={'\uD83D\uDCAC'} label="Messages" accent={accent} onPress={() => navigation.navigate('Messages')} />
            {isMember ? (
              <>
                <QuickAction emoji={'\uD83D\uDD14'} label="Alerts" accent={accent} badge={activeAlertCount > 0 ? activeAlertCount : null} onPress={() => navigation.navigate('Alerts')} />
                <QuickAction emoji={'\u2699\uFE0F'} label="Profile" accent={accent} onPress={() => navigation.navigate('Profile')} />
              </>
            ) : (
              <>
                <QuickAction emoji={'\u2728'} label="Insights" accent={accent} onPress={() => navigation.navigate('Insights')} />
                <QuickAction emoji={'\uD83D\uDCDD'} label="Mood" accent={accent} onPress={() => navigation.navigate('Mood')} />
                <QuickAction emoji={'\uD83D\uDD14'} label="Alerts" accent={accent} badge={activeAlertCount > 0 ? activeAlertCount : null} onPress={() => navigation.navigate('Alerts')} />
              </>
            )}
          </View>
        </FadeIn>

        {/* ─── Disclaimer ─── */}
        <FadeIn delay={stagger(4, 100)}>
          <GlassCard>
            <View style={styles.disclaimerRow}>
              <Text style={styles.disclaimerIcon}>{'\uD83D\uDC9A'}</Text>
              <Text style={styles.disclaimerText}>
                LinkLoop is a wellness companion — not a medical device. Always consult your care team.
              </Text>
            </View>
          </GlassCard>
        </FadeIn>
      </View>
    </ScrollView>
  );
}

/* ─── Quick Action Button ─── */
function QuickAction({ emoji, label, onPress, badge, accent }) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => { haptic.light(); onPress(); }} style={{ flex: 1, marginHorizontal: 3 }}>
      <GlassCard accent={accent} style={{ alignItems: 'center', paddingVertical: 14, paddingHorizontal: 2 }}>
        <View style={styles.quickActionInner}>
          <Text style={styles.quickActionEmoji}>{emoji}</Text>
          {badge ? (
            <View style={styles.quickActionBadge}>
              <Text style={styles.quickActionBadgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.quickActionLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
      </GlassCard>
    </TouchableOpacity>
  );
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },

  /* Hero */
  hero: { padding: 24, alignItems: 'center', paddingTop: 35, paddingBottom: 30, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  heroTitle: { fontSize: TYPE.h1, fontWeight: TYPE.bold, color: '#fff', marginBottom: 10 },
  heroBadge: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center' },
  heroBadgeEmoji: { fontSize: TYPE.xl, marginRight: 8 },
  heroBadgeText: { color: '#fff', fontSize: TYPE.md, fontWeight: TYPE.semibold },
  syncBadge: { marginTop: 8, backgroundColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  syncBadgeText: { color: 'rgba(255,255,255,0.85)', fontSize: TYPE.sm, fontWeight: TYPE.medium },

  content: { padding: 16, marginTop: -8 },

  /* Glucose Hero */
  glucoseGlow: { borderRadius: 18, marginBottom: 16 },
  glucoseInner: {},
  staleWarning: { backgroundColor: 'rgba(255,165,0,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,165,0,0.35)' },
  staleWarningText: { fontSize: TYPE.sm, color: '#FFA500', fontWeight: TYPE.semibold },
  glucoseLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  glucoseLabel: { fontSize: TYPE.xs, color: '#999', fontWeight: TYPE.semibold, textTransform: 'uppercase', letterSpacing: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
  ringRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ringMeta: { flex: 1, marginLeft: 16, alignItems: 'flex-start' },
  statusPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginBottom: 10 },
  statusPillText: { fontSize: TYPE.sm, fontWeight: TYPE.bold },
  ringTime: { fontSize: TYPE.md, color: '#888', marginBottom: 4 },
  ringHint: { fontSize: TYPE.sm, color: '#555' },
  emptyGlucose: { paddingVertical: 10 },
  glucoseEmpty: { fontSize: TYPE.md, color: '#888', marginTop: 4 },

  /* Stats */
  statsTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff', marginBottom: 14 },
  arcsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  emptyStats: { paddingVertical: 12, alignItems: 'center' },
  emptyStatsText: { fontSize: TYPE.md, color: '#888', textAlign: 'center' },

  /* Alert Banner */
  alertRow: { flexDirection: 'row', alignItems: 'center' },
  alertIcon: { fontSize: TYPE.h2, marginRight: 12 },
  alertTitle: { fontSize: 15, fontWeight: TYPE.bold, color: '#fff' },
  alertSub: { fontSize: TYPE.sm, color: '#FF6B6B', marginTop: 2 },
  alertArrow: { fontSize: TYPE.h2, color: '#FF6B6B', fontWeight: '300' },

  /* Quick Actions */
  quickActionsTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff', marginBottom: 12, marginTop: 4 },
  quickActions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  quickActionInner: { position: 'relative', marginBottom: 6 },
  quickActionEmoji: { fontSize: TYPE.h2 },
  quickActionBadge: { position: 'absolute', top: -6, right: -10, backgroundColor: '#FF6B6B', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  quickActionBadgeText: { fontSize: TYPE.xs, fontWeight: TYPE.bold, color: '#fff' },
  quickActionLabel: { fontSize: TYPE.sm, color: '#B0B0B0', fontWeight: TYPE.semibold, textAlign: 'center' },

  /* Disclaimer */
  disclaimerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  disclaimerIcon: { fontSize: TYPE.xl, marginRight: 10, marginTop: 1 },
  disclaimerText: { flex: 1, fontSize: TYPE.sm, color: '#888', lineHeight: 18 },
});
