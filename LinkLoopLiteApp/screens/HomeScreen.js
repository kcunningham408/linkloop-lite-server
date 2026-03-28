import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// HUD-style layout — no GlassCard/BloomBackground on home screen
import { FadeIn, stagger } from '../config/animations';
import { haptic } from '../config/haptics';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useViewing } from '../context/ViewingContext';
import { alertsAPI, glucoseAPI } from '../services/api';

const AUTO_REFRESH_MS = 2 * 60 * 1000; // 2 minutes — matches Dexcom ~5min reading cadence

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, circleRemoved, clearCircleRemoved, checkAuth } = useAuth();
  const { getAccent, getGradient } = useTheme();
  const { isViewingOther, viewingId } = useViewing();
  const isMember = isViewingOther || user?.role === 'member';
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
  const [warriorLastActive, setWarriorLastActive] = useState(null);
  const [recentReadings, setRecentReadings] = useState([]);

  const loadData = useCallback(async () => {
    try {
      // Cross-Circle: use viewingId (from ViewingContext) to determine which warrior to fetch
      const targetId = viewingId || user?.linkedOwnerId;
      if (isMember && targetId) {
        try {
          const data = await glucoseAPI.getMemberView(targetId, 24);
          setLatestGlucose(data.latest || null);
          setStats(data.stats || null);
          if (data.readings) {
            // Deduplicate by minute-level timestamp (safety net)
            const seen = new Set();
            const deduped = data.readings.filter(r => {
              const key = new Date(r.timestamp).toISOString().slice(0, 16);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            setRecentReadings(deduped.slice(0, 8));
          }
          if (data.ownerName) setWarriorName(user?.warriorDisplayName || data.ownerName);
          if (data.lastCGMSync) setLastCGMSync(data.lastCGMSync);
          if (data.lastActive) setWarriorLastActive(data.lastActive);
        } catch (memberErr) {
          // If the member-view call fails (e.g. removed from circle), refresh profile
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
  }, [isMember, viewingId, user?.linkedOwnerId]);

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
    if (value > highThreshold) return '#FF7B93';
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

  const txtShadow = { textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 };

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 16 }]}
      contentContainerStyle={{ paddingBottom: 90 + insets.bottom }}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Top: Glucose ring + time in frosted glass ─── */}
      <View style={styles.topBar}>
       <View style={styles.topGlass}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,18,40,0.55)' }]} />
        <FadeIn delay={0} slideY={0}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => { haptic.light(); navigation.navigate('CGM'); }} onLongPress={shareGlucoseSnapshot}>
            {latestGlucose ? (
              <Animated.View style={[styles.glucoseBanner, { borderColor: getGlucoseColor(latestGlucose.value) + '40' }, glowAnimatedStyle]}>
                <View style={[styles.glucoseBannerAccent, { backgroundColor: getGlucoseColor(latestGlucose.value) }]} />
                <View style={styles.glucoseBannerContent}>
                  <View style={styles.glucoseBannerRow}>
                    <Text style={[styles.glucoseBannerValue, txtShadow]}>
                      {latestGlucose.value}
                    </Text>
                    <Text style={[styles.glucoseBannerTrend, { color: getGlucoseColor(latestGlucose.value) }, txtShadow]}>
                      {getTrendArrow(latestGlucose.trend)}
                    </Text>
                  </View>
                  <View style={styles.glucoseBannerMeta}>
                    <Text style={[styles.glucoseBannerUnit, txtShadow]}>mg/dL</Text>
                    <View style={[styles.statusPill, { backgroundColor: getGlucoseColor(latestGlucose.value) + '30', borderColor: getGlucoseColor(latestGlucose.value) + '50' }]}>
                      <Text style={[styles.statusPillText, { color: getGlucoseColor(latestGlucose.value) }, txtShadow]}>
                        {getGlucoseStatus(latestGlucose.value)}
                      </Text>
                    </View>
                    <Text style={[styles.glucoseBannerTime, txtShadow]}>
                      {new Date(latestGlucose.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {minsOld != null && minsOld > 0 ? ` · ${minsOld}m ago` : ''}
                    </Text>
                  </View>
                  {minsOld > 30 && (
                    <Text style={styles.staleText}>{'\u26A0\uFE0F'} {minsOld}m old</Text>
                  )}
                  {isMember && minsOld != null && minsOld <= 30 && (
                    <Animated.View style={[styles.liveDot, { backgroundColor: minsOld < 5 ? '#4CAF50' : minsOld < 15 ? '#FF7B93' : '#FF6B6B' }, liveDotStyle]} />
                  )}
                </View>
              </Animated.View>
            ) : (
              <Text style={[styles.glucoseHint, { fontSize: TYPE.md }, txtShadow]}>
                {isMember ? 'No readings yet' : 'Tap to sync'}
              </Text>
            )}
          </TouchableOpacity>
        </FadeIn>
        {/* Avg inline */}
        {!loading && stats && stats.count > 0 && latestGlucose && (
          <FadeIn delay={50}>
            <Text style={[styles.topAvg, txtShadow]}>
              Avg <Text style={{ color: accent, fontWeight: TYPE.bold }}>{stats.average}</Text>
            </Text>
          </FadeIn>
        )}
       </View>
        {/* Member sync badges */}
        {isMember && (lastCGMSync || warriorLastActive) && (
          <FadeIn delay={50}>
            <View style={styles.syncRow}>
              {lastCGMSync && (
                <View style={styles.syncBadge}>
                  <Text style={[styles.syncBadgeText, txtShadow]}>
                    {'\uD83E\uDE78 CGM synced ' + (() => {
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
              {warriorLastActive && (
                <View style={styles.syncBadge}>
                  <Text style={[styles.syncBadgeText, txtShadow]}>
                    {(() => {
                      const mins = Math.floor((Date.now() - new Date(warriorLastActive).getTime()) / 60000);
                      const dot = mins < 15 ? '\uD83D\uDFE2' : mins < 60 ? '\uD83D\uDFE1' : '\uD83D\uDD34';
                      if (mins < 1) return dot + ' Active just now';
                      if (mins < 60) return dot + ' Active ' + mins + 'm ago';
                      const hrs = Math.floor(mins / 60);
                      if (hrs < 24) return dot + ' Last seen ' + hrs + 'h ago';
                      return dot + ' Last seen ' + Math.floor(hrs / 24) + 'd ago';
                    })()}
                  </Text>
                </View>
              )}
            </View>
          </FadeIn>
        )}
      </View>

      {/* ─── Middle: Actions above "LinkLoop" bg text ─── */}
      <View style={styles.middleActions}>
        <View style={styles.actionsContainer}>
        {/* Quick Actions */}
        <FadeIn delay={stagger(1, 100)}>
          <View style={styles.quickActionsCard}>
            <Text style={[styles.floatingSectionTitle, txtShadow]}>Quick Actions</Text>
            <View style={styles.quickActions}>
              {isMember ? (
                <>
                  <QuickAction emoji="⚡" label="Alerts" color="#8B3A3A" badge={activeAlertCount > 0 ? activeAlertCount : null} onPress={() => navigation.navigate('Alerts')} />
                  <QuickAction emoji="💙" label="Circle" color="#2D6B5A" onPress={() => navigation.navigate('Circle')} />
                  <QuickAction emoji="🏆" label="Badges" color="#4A3D8F" onPress={() => navigation.navigate('Achievements')} />
                  <QuickAction emoji="⚙️" label="Settings" color="#3D4556" onPress={() => navigation.navigate('Settings')} />
                </>
              ) : (
                <>
                  <QuickAction emoji="💊" label="Supplies" color="#2D5A8E" onPress={() => navigation.navigate('Supplies')} />
                  <QuickAction emoji="💡" label="Insights" color="#4A3D8F" onPress={() => navigation.navigate('Insights')} />
                  <QuickAction emoji="✏️" label="Mood" color="#6B5B3A" onPress={() => navigation.navigate('Mood')} />
                  <QuickAction emoji="⚡" label="Alerts" color="#8B3A3A" badge={activeAlertCount > 0 ? activeAlertCount : null} onPress={() => navigation.navigate('Alerts')} />
                </>
              )}
            </View>
          </View>
        </FadeIn>

        {/* Explore (warriors only) */}
        {!isMember && (
        <FadeIn delay={stagger(2, 100)}>
          <View style={styles.quickActionsCard}>
            <Text style={[styles.floatingSectionTitle, txtShadow]}>Explore</Text>
            <View style={styles.quickActions}>
              <QuickAction emoji="🔮" label="Ask Loop" color="#2A6070" onPress={() => navigation.navigate('AskLoop')} />
              <QuickAction emoji="📜" label="Story" color="#5A3D6B" onPress={() => navigation.navigate('GlucoseStory')} />
              <QuickAction emoji="📈" label="Report" color="#2D6B5A" onPress={() => navigation.navigate('WeeklyReport')} />
              <QuickAction emoji="🎯" label="Challenges" color="#6B5B3A" onPress={() => navigation.navigate('Challenges')} />
            </View>
          </View>
        </FadeIn>
        )}
        </View>

        {/* ─── Member Dashboard Content ─── */}
        {isMember && latestGlucose && (
          <View style={styles.memberDashboard}>
            {/* Status Banner */}
            <FadeIn delay={stagger(2, 100)}>
              <View style={[styles.statusBanner, { borderLeftColor: stats && stats.timeInRange >= 70 ? '#4CAF50' : stats && stats.timeInRange >= 50 ? '#FFB74D' : '#FF6B6B' }]}>
                <Text style={styles.statusBannerEmoji}>
                  {stats && stats.timeInRange >= 70 ? '✅' : stats && stats.timeInRange >= 50 ? '⚠️' : '🚨'}
                </Text>
                <View style={styles.statusBannerTextWrap}>
                  <Text style={[styles.statusBannerTitle, txtShadow]}>
                    {stats && stats.timeInRange >= 70 ? 'Looking Good' : stats && stats.timeInRange >= 50 ? 'Needs Attention' : 'Check In'}
                  </Text>
                  <Text style={[styles.statusBannerSub, txtShadow]}>
                    {stats ? `${stats.timeInRange}% in range today · ${stats.count} readings` : 'Monitoring glucose…'}
                  </Text>
                </View>
              </View>
            </FadeIn>

            {/* Today's Stats */}
            {stats && stats.count > 0 && (
              <FadeIn delay={stagger(3, 100)}>
                <View style={styles.statsCard}>
                  <Text style={[styles.statsCardTitle, txtShadow]}>Today’s Stats</Text>
                  <View style={styles.statsGrid}>
                    <View style={styles.statItem}>
                      <Text style={[styles.statValue, { color: stats.timeInRange >= 70 ? '#4CAF50' : stats.timeInRange >= 50 ? '#FFB74D' : '#FF6B6B' }]}>{stats.timeInRange}%</Text>
                      <Text style={styles.statLabel}>In Range</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={[styles.statValue, { color: accent }]}>{stats.average}</Text>
                      <Text style={styles.statLabel}>Average</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={[styles.statValue, { color: stats.min < lowThreshold ? '#FF6B6B' : '#4CAF50' }]}>{stats.min}</Text>
                      <Text style={styles.statLabel}>Low</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={[styles.statValue, { color: stats.max > highThreshold ? '#FF7B93' : '#4CAF50' }]}>{stats.max}</Text>
                      <Text style={styles.statLabel}>Peak</Text>
                    </View>
                  </View>
                  <View style={styles.statsRangeRow}>
                    <Text style={styles.statsRangeText}>{stats.count} readings today</Text>
                  </View>
                </View>
              </FadeIn>
            )}

            {/* Recent Readings */}
            {recentReadings.length > 0 && (
              <FadeIn delay={stagger(4, 100)}>
                <TouchableOpacity activeOpacity={0.8} onPress={() => { haptic.light(); navigation.navigate('Home', { screen: 'CGM' }); }} style={styles.readingsCard}>
                  <View style={styles.readingsHeader}>
                    <Text style={[styles.statsCardTitle, txtShadow]}>Recent Readings</Text>
                    <Text style={styles.readingsViewAll}>View All ›</Text>
                  </View>
                  {recentReadings.slice(0, 6).map((r, i) => {
                    const rColor = getGlucoseColor(r.value);
                    const rTime = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const trendArrows = { rising_fast: '↑↑', rising: '↑', stable: '→', falling: '↓', falling_fast: '↓↓' };
                    return (
                      <View key={r._id || `${r.timestamp}-${i}`} style={[styles.readingRow, i < recentReadings.slice(0, 6).length - 1 && styles.readingRowBorder]}>
                        <View style={[styles.readingDot, { backgroundColor: rColor }]} />
                        <Text style={[styles.readingValue, { color: rColor }]}>{r.value}</Text>
                        <Text style={styles.readingUnit}>mg/dL</Text>
                        <Text style={[styles.readingTrend, { color: rColor }]}>{trendArrows[r.trend] || '→'}</Text>
                        <Text style={styles.readingTime}>{rTime}</Text>
                      </View>
                    );
                  })}
                </TouchableOpacity>
              </FadeIn>
            )}
          </View>
        )}


      </View>
    </ScrollView>
  );
}

/* ─── Quick Action Button — color-coded rounded tile ─── */
function QuickAction({ emoji, label, color, onPress, badge }) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => { haptic.light(); onPress(); }} style={styles.quickActionWrap}>
      <View style={[styles.quickActionTile, { backgroundColor: color }]}>
        <Text style={styles.quickActionEmoji}>{emoji}</Text>
        {badge ? (
          <View style={styles.quickActionBadge}>
            <Text style={styles.quickActionBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.quickActionLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },

  /* ─── Top bar: bold glucose banner ─── */
  topBar: { paddingHorizontal: 12, paddingTop: 8 },
  topGlass: { borderRadius: 20, overflow: 'hidden', paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  glucoseBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(10,18,40,0.6)', borderRadius: 16, overflow: 'hidden', borderWidth: 1.5 },
  glucoseBannerAccent: { width: 5, alignSelf: 'stretch' },
  glucoseBannerContent: { flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  glucoseBannerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  glucoseBannerValue: { fontSize: TYPE.mega, fontWeight: TYPE.black, color: '#fff', letterSpacing: -2, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10 },
  glucoseBannerTrend: { fontSize: 34, fontWeight: TYPE.bold, marginLeft: 6, textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  glucoseBannerMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  glucoseBannerUnit: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.6)', fontWeight: TYPE.medium },
  glucoseBannerTime: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.6)', fontWeight: TYPE.medium },
  staleText: { fontSize: TYPE.sm, color: '#FF7B93', fontWeight: TYPE.semibold, marginTop: 2 },
  topAvg: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.9)', marginTop: 4, marginLeft: 2, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },

  /* Member sync badges */
  syncRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  syncBadge: { backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  syncBadgeText: { color: 'rgba(255,255,255,0.9)', fontSize: TYPE.xs, fontWeight: TYPE.medium },

  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, borderWidth: 1, alignSelf: 'flex-start' },
  statusPillText: { fontSize: TYPE.xs, fontWeight: TYPE.bold },
  glucoseHint: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  liveDot: { width: 8, height: 8, borderRadius: 4, marginTop: 3 },

  /* ─── Middle: actions ─── */
  middleActions: { flex: 1, justifyContent: 'flex-start', paddingHorizontal: 12, marginTop: 12 },

  /* Actions container — no glass, buttons float on background */
  actionsContainer: { paddingVertical: 12, paddingHorizontal: 8 },

  /* Floating action rows */
  floatingSection: { marginBottom: 14, paddingHorizontal: 4 },
  floatingSectionTitle: { fontSize: TYPE.sm, fontWeight: TYPE.bold, color: '#fff', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 2, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  quickActions: { flexDirection: 'row', justifyContent: 'space-around' },
  quickActionWrap: { alignItems: 'center', minWidth: 72 },
  quickActionTile: { width: 58, height: 58, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6 },
  quickActionEmoji: { fontSize: 26 },
  quickActionBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#FF6B6B', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  quickActionBadgeText: { fontSize: TYPE.xs, fontWeight: TYPE.bold, color: '#fff' },
  quickActionLabel: { fontSize: TYPE.sm, color: '#fff', fontWeight: TYPE.bold, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },

  /* Member Quick Actions Card */
  quickActionsCard: { backgroundColor: 'rgba(10,18,40,0.80)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 14, marginHorizontal: 4 },

  /* ─── Member Dashboard ─── */
  memberDashboard: { paddingHorizontal: 16, marginTop: 4, gap: 12 },

  /* Status Banner */
  statusBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(10,18,40,0.80)', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderLeftWidth: 4 },
  statusBannerEmoji: { fontSize: 28, marginRight: 12 },
  statusBannerTextWrap: { flex: 1 },
  statusBannerTitle: { fontSize: TYPE.md, fontWeight: TYPE.bold, color: '#fff' },
  statusBannerSub: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.70)', marginTop: 2 },

  /* Stats Card */
  statsCard: { backgroundColor: 'rgba(10,18,40,0.80)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  statsCardTitle: { fontSize: TYPE.sm, fontWeight: TYPE.bold, color: '#fff', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 22, fontWeight: TYPE.bold },
  statLabel: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.60)', marginTop: 4, fontWeight: TYPE.medium },
  statsRangeRow: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
  statsRangeText: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.70)' },

  /* Recent Readings */
  readingsCard: { backgroundColor: 'rgba(10,18,40,0.80)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  readingsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  readingsViewAll: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.50)', fontWeight: TYPE.semibold },
  readingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  readingRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  readingDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  readingValue: { fontSize: TYPE.lg, fontWeight: TYPE.bold, width: 52 },
  readingUnit: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.45)', marginRight: 8 },
  readingTrend: { fontSize: TYPE.md, fontWeight: TYPE.bold, width: 28, textAlign: 'center' },
  readingTime: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.60)', marginLeft: 'auto' },
});
