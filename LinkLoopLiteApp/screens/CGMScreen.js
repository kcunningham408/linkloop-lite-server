import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Dimensions, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn, stagger } from '../config/animations';
import { haptic } from '../config/haptics';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useViewing } from '../context/ViewingContext';
import { alertsAPI, dexcomAPI, glucoseAPI, nightscoutAPI } from '../services/api';

const AUTO_REFRESH_MS = 5 * 60 * 1000;

const { width: SCREEN_W } = Dimensions.get('window');

const TREND_OPTIONS = [
  { value: 'rising_fast', arrow: '↑↑', label: 'Rising Fast' },
  { value: 'rising', arrow: '↑', label: 'Rising' },
  { value: 'stable', arrow: '→', label: 'Stable' },
  { value: 'falling', arrow: '↓', label: 'Falling' },
  { value: 'falling_fast', arrow: '↓↓', label: 'Falling Fast' },
];

export default function CGMScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getAccent } = useTheme();
  const { isViewingOther, viewingId } = useViewing();
  const isMember = isViewingOther || user?.role === 'member';
  const accent = getAccent(isMember);

  // Use the warrior's personal thresholds if set, otherwise standard defaults
  const lowThreshold = user?.settings?.lowThreshold ?? 70;
  const highThreshold = user?.settings?.highThreshold ?? 180;

  const [currentGlucose, setCurrentGlucose] = useState(null);
  const [readings, setReadings] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [newTrend, setNewTrend] = useState('stable');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [shareStatus, setShareStatus] = useState({ connected: false, username: null, lastSync: null, region: 'us' });
  const [shareSyncing, setShareSyncing] = useState(false);
  const [warriorName, setWarriorName] = useState('');

  // Nightscout
  const [nsStatus, setNsStatus] = useState({ connected: false, url: null, lastSync: null });
  const [nsSyncing, setNsSyncing] = useState(false);
  const [showNsConnect, setShowNsConnect] = useState(false);
  const [nsUrl, setNsUrl] = useState('');
  const [nsSecret, setNsSecret] = useState('');
  const [nsConnecting, setNsConnecting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      // Cross-Circle: use viewingId (from ViewingContext) to determine which warrior to fetch
      const targetId = viewingId || user?.linkedOwnerId;
      if (isMember && targetId) {
        // Loop Member: fetch the linked warrior's data in one call
        const data = await glucoseAPI.getMemberView(targetId, 24);
        setReadings(data.readings || []);
        setCurrentGlucose(data.latest || null);
        setStats(data.stats || null);
        if (data.ownerName) setWarriorName(data.ownerName);
      } else {
        // T1D Warrior: fetch own data
        const [readingsData, statsData, shareStatusData, nsStatusData] = await Promise.allSettled([
          glucoseAPI.getReadings(24),
          glucoseAPI.getStats(24),
          dexcomAPI.getShareStatus(),
          nightscoutAPI.getStatus(),
        ]);
        if (readingsData.status === 'fulfilled') {
          const r = readingsData.value;
          setReadings(r);
          if (r.length > 0) setCurrentGlucose(r[0]);
        }
        if (statsData.status === 'fulfilled') setStats(statsData.value);
        if (shareStatusData.status === 'fulfilled') setShareStatus(shareStatusData.value);
        if (nsStatusData.status === 'fulfilled') setNsStatus(nsStatusData.value);
      }
    } catch (err) {
      console.log('CGM load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isMember, viewingId, user?.linkedOwnerId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 5 min while screen is open — matches Dexcom G7 update interval
  useEffect(() => {
    const interval = setInterval(() => { loadData(); }, AUTO_REFRESH_MS);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') loadData(); // also refresh when user returns to app
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [loadData]);

  const onRefresh = () => { haptic.light(); setRefreshing(true); loadData(); };

  const handleAddReading = async () => {
    const val = parseInt(newValue);
    if (!val || val < 20 || val > 600) {
      Alert.alert('Invalid', 'Enter a glucose value between 20-600 mg/dL');
      return;
    }
    setSaving(true);
    try {
      await glucoseAPI.addReading(val, newTrend, 'manual', newNotes);
      // Auto-trigger alert check for this reading
      alertsAPI.triggerCheck(val).catch(() => {});
      setShowAddModal(false);
      setNewValue('');
      setNewNotes('');
      setNewTrend('stable');
      loadData();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save reading');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncShare = async () => {
    setShareSyncing(true);
    try {
      const result = await dexcomAPI.syncShare();
      Alert.alert('Sync Complete', result.message || `Synced ${result.synced} readings`);
      // Trigger alert check for the latest reading after sync
      if (result.latestValue) alertsAPI.triggerCheck(result.latestValue).catch(() => {});
      loadData();
    } catch (err) {
      Alert.alert('Sync Failed', err.message || 'Could not sync via Dexcom Share');
    } finally {
      setShareSyncing(false);
    }
  };

  const handleDisconnectShare = () => {
    Alert.alert(
      'Disconnect Dexcom Share',
      'This will remove your Dexcom Share credentials. Your existing readings will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await dexcomAPI.disconnectShare();
              setShareStatus({ connected: false, username: null, lastSync: null, region: 'us' });
              Alert.alert('Disconnected', 'Dexcom Share has been disconnected.');
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not disconnect');
            }
          },
        },
      ]
    );
  };

  // ── Nightscout handlers ────────────────────────────────────────────────────
  const handleNsConnect = async () => {
    if (!nsUrl.trim()) {
      Alert.alert('Required', 'Enter your Nightscout site URL');
      return;
    }
    setNsConnecting(true);
    try {
      const result = await nightscoutAPI.connect(nsUrl.trim(), nsSecret.trim() || null);
      setNsStatus({ connected: true, url: result.url, lastSync: null });
      setShowNsConnect(false);
      setNsUrl('');
      setNsSecret('');
      Alert.alert('Connected!', 'Nightscout is connected. Tap Sync Now to pull your latest readings.');
    } catch (err) {
      Alert.alert('Connection Failed', err.message || 'Could not connect to Nightscout');
    } finally {
      setNsConnecting(false);
    }
  };

  const handleNsSync = async () => {
    setNsSyncing(true);
    try {
      const result = await nightscoutAPI.sync();
      Alert.alert('Sync Complete', result.message || `Synced ${result.synced} readings`);
      // Trigger alert check for the latest reading after sync
      if (result.latestValue) alertsAPI.triggerCheck(result.latestValue).catch(() => {});
      loadData();
    } catch (err) {
      Alert.alert('Sync Failed', err.message || 'Could not sync from Nightscout');
    } finally {
      setNsSyncing(false);
    }
  };

  const handleNsDisconnect = () => {
    Alert.alert(
      'Disconnect Nightscout',
      'This will remove your Nightscout URL. Your existing readings will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await nightscoutAPI.disconnect();
              setNsStatus({ connected: false, url: null, lastSync: null });
              Alert.alert('Disconnected', 'Nightscout has been disconnected.');
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not disconnect');
            }
          },
        },
      ]
    );
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

  const getTrendArrow = () => {
    if (!currentGlucose) return '→';
    const t = TREND_OPTIONS.find(o => o.value === currentGlucose.trend);
    return t ? t.arrow : (currentGlucose.trendArrow || '→');
  };

  // Returns minutes since last reading, or null if no reading
  const minutesSinceReading = () => {
    if (!currentGlucose?.timestamp) return null;
    return Math.floor((Date.now() - new Date(currentGlucose.timestamp).getTime()) / 60000);
  };
  const minsOld = minutesSinceReading();
  const isStale = minsOld !== null && minsOld > 30;

  const glucoseValue = currentGlucose ? currentGlucose.value : '--';
  const glucoseColor = getGlucoseColor(currentGlucose?.value);

  const txtShadow = { textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 90 + insets.bottom, paddingTop: insets.top + 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} colors={[accent]} />}
    >
      {/* ─── Banners ─── */}
      <View style={styles.bannersSection}>
        {isMember && (
          <View style={styles.memberPill}>
            <Text style={[styles.memberPillText, txtShadow]} numberOfLines={1}>Watching {warriorName || 'your warrior'}'s loop</Text>
          </View>
        )}
        {isStale && (
          <View style={styles.staleBanner}>
            <Text style={styles.staleBannerText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
              ⚠️ Data is {minsOld} min old — {isMember ? 'warrior may be offline' : 'app may be in background'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        {/* ─── Stats Dashboard: 2x2 solid tiles ─── */}
        <FadeIn delay={stagger(0, 100)}>
          <Text style={[styles.dashSectionTitle, txtShadow]}>Today's Stats</Text>
          {stats && stats.count > 0 ? (
            <View style={styles.statsGrid}>
              <View style={[styles.statTile, { backgroundColor: '#2D5A8E' }]}>
                <Text style={styles.statTileValue}>{stats.average}</Text>
                <Text style={styles.statTileLabel}>Avg mg/dL</Text>
              </View>
              <View style={[styles.statTile, { backgroundColor: '#2D6B5A' }]}>
                <Text style={styles.statTileValue}>{stats.timeInRange}%</Text>
                <Text style={styles.statTileLabel}>In Range</Text>
              </View>
              <View style={[styles.statTile, { backgroundColor: '#8B3A3A' }]}>
                <Text style={styles.statTileValue}>{stats.high}</Text>
                <Text style={styles.statTileLabel}>Highs</Text>
              </View>
              <View style={[styles.statTile, { backgroundColor: '#6B4A2A' }]}>
                <Text style={styles.statTileValue}>{stats.low}</Text>
                <Text style={styles.statTileLabel}>Lows</Text>
              </View>
            </View>
          ) : (
            <View style={styles.noDataCard}>
              <Text style={styles.noDataText}>Log readings to see your stats</Text>
            </View>
          )}
        </FadeIn>

        {/* ─── Current CGM Reading ─── */}
        <FadeIn delay={stagger(1, 100)}>
          <Text style={[styles.dashSectionTitle, txtShadow]}>Current Reading</Text>
          <View style={[styles.cgmCard, { borderLeftColor: glucoseColor }]}>
            {currentGlucose ? (
              <View style={styles.cgmCardContent}>
                <View style={styles.cgmLeft}>
                  <Text style={[styles.cgmValue, { color: glucoseColor }]}>{currentGlucose.value}</Text>
                  <Text style={styles.cgmUnit}>mg/dL</Text>
                </View>
                <View style={styles.cgmRight}>
                  <Text style={styles.cgmTrend}>
                    {(() => { const t = TREND_OPTIONS.find(o => o.value === currentGlucose.trend); return t ? t.arrow + ' ' + t.label : '→'; })()}
                  </Text>
                  <Text style={styles.cgmSource}>
                    {currentGlucose.source === 'dexcom' ? '🩸 Dexcom' : currentGlucose.source === 'nightscout' ? '🌐 Nightscout' : '📱 Manual'}
                  </Text>
                  <Text style={styles.cgmTime}>
                    {new Date(currentGlucose.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.cgmCardContent}>
                <Text style={styles.cgmValueEmpty}>--</Text>
                <Text style={styles.cgmUnit}>
                  {loading ? 'Loading...' : isMember ? 'No readings from your warrior yet' : 'No readings yet'}
                </Text>
              </View>
            )}
          </View>
        </FadeIn>

        {/* ─── Recent readings summary ─── */}
        <FadeIn delay={stagger(2, 100)}>
          <Text style={[styles.dashSectionTitle, txtShadow]}>Recent Readings</Text>
          <View style={styles.opaqueCard}>
            {loading ? (
              <ActivityIndicator size="small" color={accent} style={{ paddingVertical: 30 }} />
            ) : readings.length > 0 ? (
              readings.slice(0, 6).map((r, i) => (
                <View key={r._id || i} style={[styles.readingRow, i < Math.min(readings.length, 6) - 1 && styles.readingDivider]}>
                  <View style={[styles.readingDot, { backgroundColor: getGlucoseColor(r.value) }]} />
                  <Text style={styles.readingValue}>{r.value}</Text>
                  <Text style={styles.readingUnit}>mg/dL</Text>
                  <Text style={styles.readingTrend}>{(() => { const t = TREND_OPTIONS.find(o => o.value === r.trend); return t ? t.arrow : '→'; })()}</Text>
                  <Text style={styles.readingTime}>
                    {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              ))
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>📊</Text>
                <Text style={styles.noDataText}>No readings in the last 24 hours</Text>
              </View>
            )}
          </View>
        </FadeIn>

        {/* ─── Warriors only: Connected Devices ─── */}
        {!isMember && (
          <FadeIn delay={stagger(3, 100)}>
            <Text style={[styles.dashSectionTitle, txtShadow]}>🔗 Connected Devices</Text>
            <View style={styles.opaqueCard}>

              {/* Manual Entry */}
              <View style={styles.deviceItem}>
                <Text style={styles.deviceEmoji}>📱</Text>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>Manual Entry</Text>
                  <Text style={[styles.deviceStatus, { color: accent }]} numberOfLines={1}>
                    {currentGlucose ? 'Last log: ' + new Date(currentGlucose.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No data yet'}
                  </Text>
                </View>
                <View style={[styles.statusDot, { backgroundColor: currentGlucose ? accent : '#666' }]} />
              </View>

              {/* Dexcom Share */}
              <View style={styles.deviceDivider} />
              {shareStatus.connected ? (
                <>
                  <View style={styles.deviceItem}>
                    <Text style={styles.deviceEmoji}>🩸</Text>
                    <View style={styles.deviceInfo}>
                      <Text style={styles.deviceName}>Dexcom CGM · Live</Text>
                      <Text style={[styles.deviceStatus, { color: '#00D4AA' }]} numberOfLines={1}>
                        {shareStatus.lastSync
                          ? '⚡ Last sync: ' + new Date(shareStatus.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : `⚡ Connected as ${shareStatus.username}`}
                      </Text>
                    </View>
                    <View style={[styles.statusDot, { backgroundColor: '#00D4AA' }]} />
                  </View>
                  <View style={styles.dexcomActions}>
                    <TouchableOpacity style={[styles.syncBtn, { backgroundColor: '#00D4AA' }]} onPress={handleSyncShare} disabled={shareSyncing}>
                      {shareSyncing ? <ActivityIndicator size="small" color="#fff" /> : (
                        <><Text style={styles.syncBtnIcon}>⚡</Text><Text style={styles.syncBtnText}>Sync Now</Text></>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnectShare}>
                      <Text style={styles.disconnectBtnText}>Disconnect</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.shareNote}>⚡ Real-time via Dexcom Share · syncs every 5 min</Text>
                </>
              ) : (
                <TouchableOpacity style={styles.connectRow} onPress={() => navigation.navigate('DexcomConnect')}>
                  <Text style={styles.deviceEmoji}>🩸</Text>
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>Connect Dexcom CGM</Text>
                    <Text style={styles.deviceSub}>Real-time · Same feed as the Follow app</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              )}

              {/* Nightscout */}
              <View style={styles.deviceDivider} />
              {nsStatus.connected ? (
                <>
                  <View style={styles.deviceItem}>
                    <Text style={styles.deviceEmoji}>🌐</Text>
                    <View style={styles.deviceInfo}>
                      <Text style={styles.deviceName}>Nightscout · Live</Text>
                      <Text style={[styles.deviceStatus, { color: '#9B59B6' }]} numberOfLines={1}>
                        {nsStatus.lastSync
                          ? '⚡ Last sync: ' + new Date(nsStatus.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '⚡ Connected'}
                      </Text>
                    </View>
                    <View style={[styles.statusDot, { backgroundColor: '#9B59B6' }]} />
                  </View>
                  <View style={styles.dexcomActions}>
                    <TouchableOpacity style={[styles.syncBtn, { backgroundColor: '#9B59B6' }]} onPress={handleNsSync} disabled={nsSyncing}>
                      {nsSyncing ? <ActivityIndicator size="small" color="#fff" /> : (
                        <><Text style={styles.syncBtnIcon}>⚡</Text><Text style={styles.syncBtnText}>Sync Now</Text></>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.disconnectBtn} onPress={handleNsDisconnect}>
                      <Text style={styles.disconnectBtnText}>Disconnect</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.shareNote, { color: '#9B59B6' }]}>🌐 Supports Dexcom, Libre, Medtronic & more</Text>
                </>
              ) : (
                <TouchableOpacity style={styles.connectRow} onPress={() => setShowNsConnect(true)}>
                  <Text style={styles.deviceEmoji}>🌐</Text>
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>Connect Nightscout</Text>
                    <Text style={styles.deviceSub}>Universal · Dexcom, Libre, Medtronic & more</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              )}
            </View>
          </FadeIn>
        )}
      </View>

      {/* ═══ Add Reading Modal ═══ */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Log Glucose Reading</Text>
            <Text style={styles.inputLabel}>Glucose Value (mg/dL)</Text>
            <TextInput style={styles.input} placeholder="e.g. 120" placeholderTextColor="#888" keyboardType="numeric" value={newValue} onChangeText={setNewValue} maxLength={3} />
            <Text style={styles.inputLabel}>Trend</Text>
            <View style={styles.trendRow}>
              {TREND_OPTIONS.map(t => (
                <TouchableOpacity key={t.value} style={[styles.trendButton, newTrend === t.value && [styles.trendButtonActive, { backgroundColor: accent, borderColor: accent }]]} onPress={() => setNewTrend(t.value)}>
                  <Text style={[styles.trendButtonText, newTrend === t.value && styles.trendButtonTextActive]}>{t.arrow}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.inputLabel}>Notes (optional)</Text>
            <TextInput style={[styles.input, { height: 60 }]} placeholder="After lunch, before exercise..." placeholderTextColor="#888" value={newNotes} onChangeText={setNewNotes} multiline />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveButton, { backgroundColor: accent }]} onPress={handleAddReading} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ Nightscout Connect Modal ═══ */}
      <Modal visible={showNsConnect} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Connect Nightscout</Text>
            <Text style={styles.modalHint}>
              Works with Dexcom, Freestyle Libre, Medtronic, and any CGM connected to your Nightscout site.
            </Text>
            <Text style={styles.inputLabel}>Nightscout URL</Text>
            <TextInput style={styles.input} placeholder="https://mysite.herokuapp.com" placeholderTextColor="#888" value={nsUrl} onChangeText={setNsUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
            <Text style={styles.inputLabel}>API Secret (optional)</Text>
            <TextInput style={styles.input} placeholder="Leave blank if not required" placeholderTextColor="#888" value={nsSecret} onChangeText={setNsSecret} autoCapitalize="none" autoCorrect={false} secureTextEntry />
            <Text style={styles.modalFine}>Your API secret is stored securely and only used to read glucose data.</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => { setShowNsConnect(false); setNsUrl(''); setNsSecret(''); }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveButton, { backgroundColor: '#9B59B6' }]} onPress={handleNsConnect} disabled={nsConnecting}>
                {nsConnecting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Connect</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },

  /* Banners */
  bannersSection: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 4, paddingBottom: 4 },
  memberPill: { backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, marginBottom: 6, maxWidth: '90%' },
  memberPillText: { fontSize: 13, color: '#fff', opacity: 0.9 },
  staleBanner: { backgroundColor: 'rgba(255,123,147,0.20)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,123,147,0.45)' },
  staleBannerText: { fontSize: 13, color: '#FF7B93', fontWeight: TYPE.semibold, textAlign: 'center' },

  content: { padding: 16 },

  /* Dashboard section titles */
  dashSectionTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff', marginBottom: 12, marginTop: 8, textTransform: 'uppercase', letterSpacing: 1.5 },

  /* CGM reading card */
  cgmCard: { backgroundColor: 'rgba(10,18,40,0.90)', borderRadius: 18, padding: 20, marginBottom: 16, borderLeftWidth: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8 },
  cgmCardContent: { flexDirection: 'row', alignItems: 'center' },
  cgmLeft: { flexDirection: 'row', alignItems: 'baseline', marginRight: 'auto' },
  cgmValue: { fontSize: 54, fontWeight: TYPE.bold, letterSpacing: -1 },
  cgmValueEmpty: { fontSize: 44, fontWeight: TYPE.bold, color: 'rgba(255,255,255,0.4)', marginRight: 10 },
  cgmUnit: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.6)', marginLeft: 6 },
  cgmRight: { alignItems: 'flex-end' },
  cgmTrend: { fontSize: TYPE.md, color: '#fff', fontWeight: TYPE.semibold, marginBottom: 4 },
  cgmSource: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  cgmTime: { fontSize: TYPE.lg, color: '#fff', fontWeight: TYPE.bold },

  /* 2x2 stats grid */
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statTile: { width: (SCREEN_W - 42) / 2, borderRadius: 16, padding: 18, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  statTileValue: { fontSize: 32, fontWeight: TYPE.bold, color: '#fff', marginBottom: 4 },
  statTileLabel: { fontSize: TYPE.sm, fontWeight: TYPE.semibold, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 1 },

  /* Opaque card */
  opaqueCard: { backgroundColor: 'rgba(10,18,40,0.85)', borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  noDataCard: { backgroundColor: 'rgba(10,18,40,0.85)', borderRadius: 18, padding: 24, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  noDataText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },

  /* Recent readings list */
  readingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  readingDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  readingDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  readingValue: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff', width: 52 },
  readingUnit: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.5)', marginRight: 8 },
  readingTrend: { fontSize: TYPE.lg, color: '#fff', marginRight: 'auto' },
  readingTime: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.6)' },

  /* Devices */
  deviceItem: { flexDirection: 'row', alignItems: 'center' },
  deviceEmoji: { fontSize: 28, marginRight: 14 },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: TYPE.lg, fontWeight: TYPE.semibold, color: '#fff', marginBottom: 3 },
  deviceStatus: { fontSize: 13 },
  deviceSub: { fontSize: 13, color: '#D0D0D0' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  deviceDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 12 },
  connectRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  chevron: { fontSize: 28, color: '#B0B0B0', fontWeight: '300' },
  dexcomActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  syncBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 10, gap: 6 },
  syncBtnIcon: { fontSize: 16 },
  syncBtnText: { fontSize: TYPE.md, fontWeight: TYPE.bold, color: '#fff' },
  disconnectBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,107,107,0.10)', borderWidth: 1, borderColor: 'rgba(255,107,107,0.25)', justifyContent: 'center' },
  disconnectBtnText: { fontSize: 13, color: '#FF6B6B', fontWeight: TYPE.semibold },
  shareNote: { fontSize: TYPE.sm, color: '#00D4AA', textAlign: 'center', marginTop: 10 },

  /* Modals */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'rgba(26,26,32,0.5)', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 25, paddingBottom: 40 },
  modalTitle: { fontSize: TYPE.xxl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 16, textAlign: 'center' },
  modalHint: { fontSize: 13, color: '#D0D0D0', textAlign: 'center', marginBottom: 16, lineHeight: 19 },
  modalFine: { fontSize: 11, color: '#B0B0B0', marginTop: 6 },
  inputLabel: { fontSize: TYPE.md, fontWeight: TYPE.semibold, color: '#E0E0E0', marginBottom: 8, marginTop: 10 },
  input: { backgroundColor: 'rgba(42,42,50,0.45)', borderRadius: 12, padding: 14, fontSize: TYPE.lg, borderWidth: 1, borderColor: '#3A3A42', color: '#fff' },
  trendRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  trendButton: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(42,42,50,0.45)', alignItems: 'center', borderWidth: 1, borderColor: '#3A3A42' },
  trendButtonActive: {},
  trendButtonText: { fontSize: 20, color: '#D0D0D0' },
  trendButtonTextActive: { color: '#fff' },
  modalButtons: { flexDirection: 'row', marginTop: 25, gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: 'rgba(42,42,50,0.45)', alignItems: 'center' },
  cancelButtonText: { fontSize: TYPE.lg, color: '#D0D0D0', fontWeight: TYPE.semibold },
  saveButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveButtonText: { fontSize: TYPE.lg, color: '#fff', fontWeight: TYPE.bold },
});
