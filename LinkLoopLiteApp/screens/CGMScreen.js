import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Dimensions, Linking, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { dexcomAPI, glucoseAPI } from '../services/api';

const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes — matches Dexcom G7 update interval

const { width } = Dimensions.get('window');

const TREND_OPTIONS = [
  { value: 'rising_fast', arrow: '↑↑', label: 'Rising Fast' },
  { value: 'rising', arrow: '↑', label: 'Rising' },
  { value: 'stable', arrow: '→', label: 'Stable' },
  { value: 'falling', arrow: '↓', label: 'Falling' },
  { value: 'falling_fast', arrow: '↓↓', label: 'Falling Fast' },
];

export default function CGMScreen() {
  const { user } = useAuth();
  const isMember = user?.role === 'member';

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
  const [dexcomStatus, setDexcomStatus] = useState({ connected: false, lastSync: null });
  const [dexcomSyncing, setDexcomSyncing] = useState(false);
  const [dexcomConnecting, setDexcomConnecting] = useState(false);
  const [shareStatus, setShareStatus] = useState({ connected: false, username: null, lastSync: null, region: 'us' });
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUsername, setShareUsername] = useState('');
  const [sharePassword, setSharePassword] = useState('');
  const [shareRegion, setShareRegion] = useState('us');
  const [shareConnecting, setShareConnecting] = useState(false);
  const [shareSyncing, setShareSyncing] = useState(false);
  const [warriorName, setWarriorName] = useState('');

  const loadData = useCallback(async () => {
    try {
      if (isMember && user?.linkedOwnerId) {
        // Loop Member: fetch the linked warrior's data in one call
        const data = await glucoseAPI.getMemberView(user.linkedOwnerId, 24);
        setReadings(data.readings || []);
        setCurrentGlucose(data.latest || null);
        setStats(data.stats || null);
        if (data.ownerName) setWarriorName(data.ownerName);
      } else {
        // T1D Warrior: fetch own data
        const [readingsData, statsData, dexStatus, shareStatusData] = await Promise.allSettled([
          glucoseAPI.getReadings(24),
          glucoseAPI.getStats(24),
          dexcomAPI.getStatus(),
          dexcomAPI.getShareStatus(),
        ]);
        if (readingsData.status === 'fulfilled') {
          const r = readingsData.value;
          setReadings(r);
          if (r.length > 0) setCurrentGlucose(r[0]);
        }
        if (statsData.status === 'fulfilled') setStats(statsData.value);
        if (dexStatus.status === 'fulfilled') setDexcomStatus(dexStatus.value);
        if (shareStatusData.status === 'fulfilled') setShareStatus(shareStatusData.value);
      }
    } catch (err) {
      console.log('CGM load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isMember, user?.linkedOwnerId]);

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

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const handleAddReading = async () => {
    const val = parseInt(newValue);
    if (!val || val < 20 || val > 600) {
      Alert.alert('Invalid', 'Enter a glucose value between 20-600 mg/dL');
      return;
    }
    setSaving(true);
    try {
      await glucoseAPI.addReading(val, newTrend, 'manual', newNotes);
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

  const handleConnectDexcom = async () => {
    setDexcomConnecting(true);
    try {
      const data = await dexcomAPI.getAuthUrl();
      if (data.authUrl) {
        await Linking.openURL(data.authUrl);
        // After returning, refresh status
        setTimeout(() => {
          loadData();
          setDexcomConnecting(false);
        }, 3000);
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not start Dexcom connection');
      setDexcomConnecting(false);
    }
  };

  const handleSyncDexcom = async () => {
    setDexcomSyncing(true);
    try {
      const result = await dexcomAPI.sync();
      Alert.alert('Sync Complete', result.message || `Synced ${result.synced} readings`);
      loadData();
    } catch (err) {
      if (err.message?.includes('expired') || err.message?.includes('reconnect')) {
        Alert.alert('Session Expired', 'Please reconnect your Dexcom account.', [
          { text: 'Reconnect', onPress: handleConnectDexcom },
          { text: 'Cancel', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Sync Failed', err.message || 'Could not sync with Dexcom');
      }
    } finally {
      setDexcomSyncing(false);
    }
  };

  const handleDisconnectDexcom = () => {
    Alert.alert(
      'Disconnect Dexcom',
      'This will remove your Dexcom connection. Your existing readings will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await dexcomAPI.disconnect();
              setDexcomStatus({ connected: false, lastSync: null });
              Alert.alert('Disconnected', 'Dexcom has been disconnected.');
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not disconnect');
            }
          },
        },
      ]
    );
  };

  const handleConnectShare = async () => {
    if (!shareUsername.trim() || !sharePassword.trim()) {
      Alert.alert('Required', 'Please enter your Dexcom username and password.');
      return;
    }
    setShareConnecting(true);
    try {
      await dexcomAPI.connectShare(shareUsername.trim(), sharePassword, shareRegion);
      setShowShareModal(false);
      setShareUsername('');
      setSharePassword('');
      Alert.alert('Connected! 🎉', 'Dexcom Share is connected. Real-time readings will sync every 5 minutes.');
      loadData();
    } catch (err) {
      Alert.alert('Connection Failed', err.message || 'Could not connect to Dexcom Share. Check your username and password.');
    } finally {
      setShareConnecting(false);
    }
  };

  const handleSyncShare = async () => {
    setShareSyncing(true);
    try {
      const result = await dexcomAPI.syncShare();
      Alert.alert('Sync Complete', result.message || `Synced ${result.synced} readings`);
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
  const chartReadings = readings.slice(0, 5).reverse();

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4A90D9']} />}
    >
      <LinearGradient
        colors={[glucoseColor, glucoseColor, '#111111']}
        style={styles.headerGradient}
        locations={[0, 0.6, 1]}
      >
      {isMember && (
          <Text style={styles.memberBanner}>
            👁 Watching {warriorName || 'your warrior'}'s loop
          </Text>
        )}
        {isStale && (
          <View style={styles.staleBanner}>
            <Text style={styles.staleBannerText}>
              ⚠️ Data is {minsOld} min old — {isMember ? 'warrior may be offline' : 'app may be in background'}
            </Text>
          </View>
        )}
        <View style={styles.currentReading}>
          <Text style={styles.glucoseValue}>{glucoseValue}</Text>
          <Text style={styles.glucoseUnit}>mg/dL</Text>
          <Text style={styles.trendArrow}>{getTrendArrow()}</Text>
        </View>
        {currentGlucose && (
          <>
            <Text style={styles.statusText}>{getGlucoseStatus(currentGlucose.value)}</Text>
            <Text style={styles.lastUpdate}>
              {currentGlucose.source === 'dexcom' ? '🩸 Dexcom · ' : '📱 Manual · '}
              {new Date(currentGlucose.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </>
        )}
        {!currentGlucose && !loading && (
          <Text style={styles.lastUpdate}>
            {isMember ? 'No readings from your warrior yet' : 'No readings yet — tap + to log one'}
          </Text>
        )}
      </LinearGradient>

      <View style={styles.content}>
        {/* Warriors only: log reading button */}
        {!isMember && (
          <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
            <Text style={styles.addButtonIcon}>➕</Text>
            <Text style={styles.addButtonText}>Log Glucose Reading</Text>
          </TouchableOpacity>
        )}

        <View style={styles.chartContainer}>
          <Text style={styles.sectionTitle}>Today's Readings</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#4A90D9" style={{ paddingVertical: 40 }} />
          ) : chartReadings.length > 0 ? (
            <View style={styles.chartArea}>
              <View style={styles.chartGrid}>
                <View style={[styles.gridLine, styles.highLine]} />
                <Text style={styles.gridLabel}>180</Text>
                <View style={[styles.gridLine, styles.targetLine]} />
                <Text style={[styles.gridLabel, styles.targetLabel]}>Target</Text>
                <View style={[styles.gridLine, styles.lowLine]} />
                <Text style={styles.gridLabel}>70</Text>
              </View>
              <View style={styles.pointsContainer}>
                {chartReadings.map((reading, index) => {
                  const position = ((reading.value - 50) / 150) * 100;
                  return (
                    <View key={index} style={[styles.dataPoint, { bottom: `${Math.min(Math.max(position, 5), 95)}%` }]}>
                      <View style={[styles.point, { backgroundColor: getGlucoseColor(reading.value) }]} />
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.emptyChart}>
              <Text style={styles.emptyEmoji}>📊</Text>
              <Text style={styles.emptyText}>No readings in the last 24 hours</Text>
            </View>
          )}
          {chartReadings.length > 0 && (
            <View style={styles.timeLabels}>
              {chartReadings.map((reading, index) => (
                <Text key={index} style={styles.timeLabel}>
                  {new Date(reading.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              ))}
            </View>
          )}
        </View>

        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>Today's Stats</Text>
          {stats && stats.count > 0 ? (
            <View style={styles.statsGrid}>
              <StatCard label="Time in Range" value={stats.timeInRange + '%'} color="#4A90D9" />
              <StatCard label="Avg Glucose" value={'' + stats.average} color="#666" />
              <StatCard label="High Events" value={'' + stats.high} color="#FFA500" />
              <StatCard label="Low Events" value={'' + stats.low} color="#FF6B6B" />
            </View>
          ) : (
            <Text style={styles.noDataText}>Log readings to see your stats</Text>
          )}
        </View>

        {/* Warriors only: connected devices & Dexcom controls */}
        {!isMember && (
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>🔗 Connected Devices</Text>

            {/* Manual Entry */}
            <View style={styles.deviceItem}>
              <Text style={styles.deviceEmoji}>📱</Text>
              <View style={styles.deviceInfo}>
                <Text style={styles.deviceName}>Manual Entry</Text>
                <Text style={styles.deviceStatus}>
                  {currentGlucose ? 'Last sync: ' + new Date(currentGlucose.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No data yet'}
                </Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: currentGlucose ? '#4A90D9' : '#ccc' }]} />
            </View>

            {/* Dexcom */}
            <View style={styles.deviceDivider} />
            {dexcomStatus.connected ? (
              <>
                <View style={styles.deviceItem}>
                  <Text style={styles.deviceEmoji}>🩸</Text>
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>Dexcom CGM</Text>
                    <Text style={styles.deviceStatus}>
                      {dexcomStatus.lastSync
                        ? 'Last sync: ' + new Date(dexcomStatus.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Connected — tap Sync'}
                    </Text>
                  </View>
                  <View style={[styles.statusDot, { backgroundColor: '#4A90D9' }]} />
                </View>
                <View style={styles.dexcomActions}>
                  <TouchableOpacity style={styles.dexcomSyncButton} onPress={handleSyncDexcom} disabled={dexcomSyncing}>
                    {dexcomSyncing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Text style={styles.dexcomButtonIcon}>🔄</Text>
                        <Text style={styles.dexcomSyncText}>Sync Now</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dexcomDisconnectButton} onPress={handleDisconnectDexcom}>
                    <Text style={styles.dexcomDisconnectText}>Disconnect</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity style={styles.connectDexcomButton} onPress={handleConnectDexcom} disabled={dexcomConnecting}>
                {dexcomConnecting ? (
                  <ActivityIndicator size="small" color="#4A90D9" />
                ) : (
                  <>
                    <Text style={styles.connectDexcomIcon}>🩸</Text>
                    <View style={styles.connectDexcomInfo}>
                      <Text style={styles.connectDexcomTitle}>Connect Dexcom CGM</Text>
                      <Text style={styles.connectDexcomSub}>Import glucose readings automatically</Text>
                    </View>
                    <Text style={styles.connectChevron}>›</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Dexcom Share Card (real-time) ───────────────────── */}
        {!isMember && (
          <View style={styles.deviceCard}>
            <Text style={styles.deviceCardTitle}>⚡ Real-Time Sync</Text>
            <View style={styles.deviceItem}>
              <Text style={styles.deviceEmoji}>📡</Text>
              <View style={styles.deviceInfo}>
                <Text style={styles.deviceName}>Dexcom Share</Text>
                <Text style={styles.deviceStatus}>
                  {shareStatus.connected
                    ? shareStatus.lastSync
                      ? 'Last sync: ' + new Date(shareStatus.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : `Connected as ${shareStatus.username}`
                    : 'Real-time • No API approval needed'}
                </Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: shareStatus.connected ? '#00D4AA' : '#555' }]} />
            </View>

            {shareStatus.connected ? (
              <>
                <View style={styles.dexcomActions}>
                  <TouchableOpacity style={[styles.dexcomSyncButton, { backgroundColor: '#00D4AA' }]} onPress={handleSyncShare} disabled={shareSyncing}>
                    {shareSyncing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Text style={styles.dexcomButtonIcon}>⚡</Text>
                        <Text style={styles.dexcomSyncText}>Sync Now</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dexcomDisconnectButton} onPress={handleDisconnectShare}>
                    <Text style={styles.dexcomDisconnectText}>Disconnect</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.shareNote}>
                  ⚡ Share API is real-time — same feed as the Follow app
                </Text>
              </>
            ) : (
              <TouchableOpacity style={styles.connectDexcomButton} onPress={() => setShowShareModal(true)}>
                <Text style={styles.connectDexcomIcon}>📡</Text>
                <View style={styles.connectDexcomInfo}>
                  <Text style={styles.connectDexcomTitle}>Connect via Dexcom Share</Text>
                  <Text style={styles.connectDexcomSub}>Real-time readings • Use your Dexcom login</Text>
                </View>
                <Text style={styles.connectChevron}>›</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.alertsCard}>
          <Text style={styles.alertsTitle}>⚠️ Alerts & Notifications</Text>
          {readings.filter(r => r.value < lowThreshold || r.value > highThreshold).slice(0, 3).length > 0 ? (
            readings.filter(r => r.value < lowThreshold || r.value > highThreshold).slice(0, 3).map((r, i) => (
              <View key={i} style={styles.alertItem}>
                <Text style={styles.alertIcon}>{r.value < 70 ? '🔔' : '📊'}</Text>
                <View style={styles.alertContent}>
                  <Text style={styles.alertText}>
                    {r.value < lowThreshold ? 'Low glucose alert' : 'High glucose reading'}: {r.value} mg/dL
                  </Text>
                  <Text style={styles.alertTime}>
                    {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.alertItem}>
              <Text style={styles.alertIcon}>✅</Text>
              <View style={styles.alertContent}>
                <Text style={styles.alertText}>No alerts — looking good!</Text>
                <Text style={styles.alertTime}>Keep it up</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Add Reading Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Log Glucose Reading</Text>
            <Text style={styles.inputLabel}>Glucose Value (mg/dL)</Text>
            <TextInput style={styles.input} placeholder="e.g. 120" keyboardType="numeric" value={newValue} onChangeText={setNewValue} maxLength={3} />
            <Text style={styles.inputLabel}>Trend</Text>
            <View style={styles.trendRow}>
              {TREND_OPTIONS.map(t => (
                <TouchableOpacity key={t.value} style={[styles.trendButton, newTrend === t.value && styles.trendButtonActive]} onPress={() => setNewTrend(t.value)}>
                  <Text style={[styles.trendButtonText, newTrend === t.value && styles.trendButtonTextActive]}>{t.arrow}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.inputLabel}>Notes (optional)</Text>
            <TextInput style={[styles.input, { height: 60 }]} placeholder="After lunch, before exercise..." value={newNotes} onChangeText={setNewNotes} multiline />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleAddReading} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Dexcom Share Login Modal ──────────────────────────── */}
      <Modal visible={showShareModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Connect Dexcom Share</Text>
            <Text style={[styles.modalTitle, { fontSize: 13, color: '#A0A0A0', fontWeight: '400', marginBottom: 16 }]}>
              Use your Dexcom account credentials. Make sure you have at least one follower set up in the Dexcom app.
            </Text>

            <Text style={styles.inputLabel}>Dexcom Username</Text>
            <TextInput
              style={styles.input}
              value={shareUsername}
              onChangeText={setShareUsername}
              placeholder="Email or username"
              placeholderTextColor="#666"
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.inputLabel}>Dexcom Password</Text>
            <TextInput
              style={styles.input}
              value={sharePassword}
              onChangeText={setSharePassword}
              placeholder="Password"
              placeholderTextColor="#666"
              secureTextEntry
            />

            <Text style={styles.inputLabel}>Region</Text>
            <View style={styles.regionRow}>
              <TouchableOpacity
                style={[styles.regionBtn, shareRegion === 'us' && styles.regionBtnActive]}
                onPress={() => setShareRegion('us')}
              >
                <Text style={[styles.regionBtnText, shareRegion === 'us' && styles.regionBtnTextActive]}>🇺🇸 USA</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.regionBtn, shareRegion === 'ous' && styles.regionBtnActive]}
                onPress={() => setShareRegion('ous')}
              >
                <Text style={[styles.regionBtnText, shareRegion === 'ous' && styles.regionBtnTextActive]}>🌍 Outside USA</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => { setShowShareModal(false); setShareUsername(''); setSharePassword(''); }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleConnectShare} disabled={shareConnecting}>
                {shareConnecting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Connect</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function StatCard({ label, value, color }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111111' },
  headerGradient: { padding: 30, alignItems: 'center', paddingBottom: 40 },
  memberBanner: { fontSize: 13, color: '#fff', opacity: 0.85, marginBottom: 10, backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  staleBanner: { backgroundColor: 'rgba(255,165,0,0.25)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,165,0,0.5)' },
  staleBannerText: { fontSize: 13, color: '#FFA500', fontWeight: '600', textAlign: 'center' },
  currentReading: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 },
  glucoseValue: { fontSize: 72, fontWeight: 'bold', color: '#fff' },
  glucoseUnit: { fontSize: 20, color: '#fff', opacity: 0.9, marginLeft: 5 },
  trendArrow: { fontSize: 40, marginLeft: 15, color: '#fff' },
  statusText: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 5 },
  lastUpdate: { fontSize: 14, color: '#fff', opacity: 0.8 },
  content: { padding: 20 },
  addButton: { backgroundColor: '#4A90D9', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  addButtonIcon: { fontSize: 20, marginRight: 10 },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  chartContainer: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#2C2C2E' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 15 },
  chartArea: { height: 200, position: 'relative', borderLeftWidth: 2, borderBottomWidth: 2, borderColor: '#3A3A3C' },
  chartGrid: { position: 'absolute', width: '100%', height: '100%' },
  gridLine: { position: 'absolute', width: '100%', height: 1, borderStyle: 'dashed', borderWidth: 1 },
  highLine: { borderColor: '#FFA500', top: '20%' },
  targetLine: { borderColor: '#4A90D9', top: '50%' },
  lowLine: { borderColor: '#FF6B6B', top: '80%' },
  gridLabel: { position: 'absolute', right: 5, fontSize: 10, color: '#888' },
  targetLabel: { top: '48%' },
  pointsContainer: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  dataPoint: { position: 'absolute', width: width / 5 },
  point: { width: 12, height: 12, borderRadius: 6, alignSelf: 'center' },
  timeLabels: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 },
  timeLabel: { fontSize: 11, color: '#A0A0A0' },
  emptyChart: { alignItems: 'center', paddingVertical: 30 },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyText: { fontSize: 14, color: '#888' },
  statsContainer: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#2C2C2E' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statCard: { width: '48%', alignItems: 'center', padding: 15, backgroundColor: '#2C2C2E', borderRadius: 8, marginBottom: 10 },
  statValue: { fontSize: 28, fontWeight: 'bold', marginBottom: 5 },
  statLabel: { fontSize: 12, color: '#A0A0A0', textAlign: 'center' },
  noDataText: { fontSize: 14, color: '#888', textAlign: 'center', paddingVertical: 15 },
  infoCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#2C2C2E' },
  infoCardTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 15 },
  deviceItem: { flexDirection: 'row', alignItems: 'center' },
  deviceEmoji: { fontSize: 30, marginRight: 15 },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 3 },
  deviceStatus: { fontSize: 13, color: '#4A90D9' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  deviceDivider: { height: 1, backgroundColor: '#2C2C2E', marginVertical: 12 },
  dexcomActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  dexcomSyncButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4A90D9', borderRadius: 8, paddingVertical: 10, gap: 6 },
  dexcomButtonIcon: { fontSize: 16 },
  dexcomSyncText: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  dexcomDisconnectButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#2A1A1A', borderWidth: 1, borderColor: '#3A2020', justifyContent: 'center' },
  dexcomDisconnectText: { fontSize: 13, color: '#FF6B6B', fontWeight: '600' },
  connectDexcomButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  connectDexcomIcon: { fontSize: 30, marginRight: 15 },
  connectDexcomInfo: { flex: 1 },
  connectDexcomTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 3 },
  connectDexcomSub: { fontSize: 13, color: '#A0A0A0' },
  connectChevron: { fontSize: 24, color: '#555', fontWeight: '300' },
  alertsCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#2C2C2E' },
  alertsTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 15 },
  alertItem: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  alertIcon: { fontSize: 24, marginRight: 15 },
  alertContent: { flex: 1 },
  alertText: { fontSize: 14, color: '#E0E0E0', marginBottom: 3 },
  alertTime: { fontSize: 12, color: '#888' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 25, paddingBottom: 40 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 20, textAlign: 'center' },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#E0E0E0', marginBottom: 8, marginTop: 10 },
  input: { backgroundColor: '#2C2C2E', borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1, borderColor: '#3A3A3C', color: '#fff' },
  trendRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  trendButton: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#2C2C2E', alignItems: 'center', borderWidth: 1, borderColor: '#3A3A3C' },
  trendButtonActive: { backgroundColor: '#4A90D9', borderColor: '#4A90D9' },
  trendButtonText: { fontSize: 20, color: '#A0A0A0' },
  trendButtonTextActive: { color: '#fff' },
  modalButtons: { flexDirection: 'row', marginTop: 25, gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#2C2C2E', alignItems: 'center' },
  cancelButtonText: { fontSize: 16, color: '#A0A0A0', fontWeight: '600' },
  saveButton: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#4A90D9', alignItems: 'center' },
  saveButtonText: { fontSize: 16, color: '#fff', fontWeight: 'bold' },
  regionRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  regionBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2C2C2E', alignItems: 'center', borderWidth: 1, borderColor: '#3A3A3C' },
  regionBtnActive: { backgroundColor: '#00D4AA', borderColor: '#00D4AA' },
  regionBtnText: { fontSize: 14, color: '#A0A0A0', fontWeight: '600' },
  regionBtnTextActive: { color: '#fff' },
  shareNote: { fontSize: 12, color: '#00D4AA', textAlign: 'center', marginTop: 8, marginBottom: 4 },
});
