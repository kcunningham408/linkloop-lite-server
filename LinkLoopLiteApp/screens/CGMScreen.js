import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Dimensions, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import BloomBackground from '../components/BloomBackground';
import GlassCard from '../components/GlassCard';
import GlucoseChart from '../components/GlucoseChart';
import GlucoseRing from '../components/GlucoseRing';
import StatArc from '../components/StatArc';
import { FadeIn, stagger } from '../config/animations';
import { haptic } from '../config/haptics';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { alertsAPI, dexcomAPI, glucoseAPI, nightscoutAPI, notesAPI } from '../services/api';

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
  const { user } = useAuth();
  const { getAccent } = useTheme();
  const isMember = user?.role === 'member';
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

  // Notes
  const [notes, setNotes] = useState([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

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
      // Load notes for the timeline
      try {
        const notesData = await notesAPI.getAll(24);
        setNotes(Array.isArray(notesData) ? notesData : []);
      } catch (e) { /* notes are optional */ }
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

  const handleAddNote = async () => {
    if (!newNoteText.trim()) return;
    haptic.medium();
    setNoteSaving(true);
    try {
      await notesAPI.add(newNoteText.trim());
      setNewNoteText('');
      setShowNoteModal(false);
      loadData();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save note');
    } finally {
      setNoteSaving(false);
    }
  };

  const handleDeleteNote = (id) => {
    haptic.warning();
    Alert.alert('Delete Note', 'Remove this note?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await notesAPI.remove(id); loadData(); }
        catch (err) { Alert.alert('Error', 'Could not delete note'); }
      }},
    ]);
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
  const CHART_W = SCREEN_W - 72;
  const ARC_SIZE = Math.floor((SCREEN_W - 72) / 4);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 90 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} colors={[accent]} />}
    >
      {/* ─── Hero: GlucoseRing on gradient ─── */}
      <BloomBackground accent={glucoseColor} secondary={accent} variant="hero" contentStyle={styles.headerGradient}>
        {isMember && (
          <View style={styles.memberPill}>
            <Text style={styles.memberPillText} numberOfLines={1}>👁 Watching {warriorName || 'your warrior'}'s loop</Text>
          </View>
        )}
        {isStale && (
          <View style={styles.staleBanner}>
            <Text style={styles.staleBannerText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
              ⚠️ Data is {minsOld} min old — {isMember ? 'warrior may be offline' : 'app may be in background'}
            </Text>
          </View>
        )}

        {currentGlucose ? (
          <GlucoseRing
            value={currentGlucose.value}
            trend={currentGlucose.trend}
            accentColor={glucoseColor}
            lowThreshold={lowThreshold}
            highThreshold={highThreshold}
            size={190}
          />
        ) : (
          <View style={styles.emptyHero}>
            <Text style={styles.emptyHeroValue}>--</Text>
            <Text style={styles.emptyHeroUnit}>mg/dL</Text>
          </View>
        )}

        {currentGlucose && (
          <Text style={styles.lastUpdate}>
            {currentGlucose.source === 'dexcom' ? '🩸 Dexcom · ' : currentGlucose.source === 'nightscout' ? '🌐 Nightscout · ' : '📱 Manual · '}
            {new Date(currentGlucose.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
        {!currentGlucose && !loading && (
          <Text style={styles.lastUpdate}>
            {isMember ? 'No readings from your warrior yet' : 'No readings yet — tap + to log one'}
          </Text>
        )}
      </BloomBackground>

      <View style={styles.content}>
        {/* ─── Warriors only: Log Reading button ─── */}
        {!isMember && (
          <FadeIn delay={stagger(0, 100)}>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: accent }]}
              onPress={() => setShowAddModal(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.addButtonIcon}>➕</Text>
              <Text style={styles.addButtonText}>Log Glucose Reading</Text>
            </TouchableOpacity>
          </FadeIn>
        )}

        {/* ─── SVG Line Chart ─── */}
        <FadeIn delay={stagger(1, 100)}>
          <GlassCard accent={accent}>
            <Text style={styles.sectionTitle}>Today's Readings</Text>
            {loading ? (
              <ActivityIndicator size="small" color={accent} style={{ paddingVertical: 40 }} />
            ) : readings.length > 0 ? (
              <GlucoseChart
                readings={readings}
                width={CHART_W}
                height={180}
                lowThreshold={lowThreshold}
                highThreshold={highThreshold}
                accentColor={accent}
              />
            ) : (
              <View style={styles.emptyChart}>
                <Text style={styles.emptyEmoji}>📊</Text>
                <Text style={styles.emptyText}>No readings in the last 24 hours</Text>
              </View>
            )}
          </GlassCard>
        </FadeIn>

        {/* ─── Stats Arcs ─── */}
        <FadeIn delay={stagger(2, 100)}>
          <GlassCard accent={accent}>
            <Text style={styles.sectionTitle}>Today's Stats</Text>
            {stats && stats.count > 0 ? (
              <View style={styles.arcsRow}>
                <StatArc value={stats.timeInRange} maxValue={100} label="In Range" suffix="%" color={accent} size={ARC_SIZE} />
                <StatArc value={stats.average} maxValue={300} label="Avg mg/dL" suffix="" color="#FFA500" size={ARC_SIZE} />
                <StatArc value={stats.high} maxValue={Math.max(stats.high, 5)} label="Highs" suffix="" color="#FFA500" size={ARC_SIZE} />
                <StatArc value={stats.low} maxValue={Math.max(stats.low, 5)} label="Lows" suffix="" color="#FF6B6B" size={ARC_SIZE} />
              </View>
            ) : (
              <Text style={styles.noDataText}>Log readings to see your stats</Text>
            )}
          </GlassCard>
        </FadeIn>

        {/* ─── Notes Timeline ─── */}
        <FadeIn delay={stagger(3, 100)}>
          <GlassCard>
            <View style={styles.notesHeader}>
              <Text style={styles.sectionTitle}>📝 Notes</Text>
              <TouchableOpacity style={[styles.addNoteBtn, { borderColor: accent }]} onPress={() => setShowNoteModal(true)}>
                <Text style={[styles.addNoteBtnText, { color: accent }]}>+ Add Note</Text>
              </TouchableOpacity>
            </View>
            {notes.length > 0 ? (
              notes.slice(0, 5).map((n) => (
                <TouchableOpacity key={n._id} style={styles.noteCard} onLongPress={() => handleDeleteNote(n._id)}>
                  <View style={styles.noteRow}>
                    <Text style={[styles.noteAuthor, { color: accent }]} numberOfLines={1}>{n.authorEmoji || '📝'} {n.authorName}</Text>
                    <Text style={styles.noteTime}>
                      {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={styles.noteText}>{n.text}</Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.noNotesText}>No notes today — add one to share with your circle</Text>
            )}
          </GlassCard>
        </FadeIn>

        {/* ─── Warriors only: Connected Devices ─── */}
        {!isMember && (
          <FadeIn delay={stagger(4, 100)}>
            <GlassCard accent={accent}>
              <Text style={styles.sectionTitle}>🔗 Connected Devices</Text>

              {/* Manual Entry */}
              <View style={styles.deviceItem}>
                <Text style={styles.deviceEmoji}>📱</Text>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>Manual Entry</Text>
                  <Text style={[styles.deviceStatus, { color: accent }]} numberOfLines={1}>
                    {currentGlucose ? 'Last log: ' + new Date(currentGlucose.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No data yet'}
                  </Text>
                </View>
                <View style={[styles.statusDot, { backgroundColor: currentGlucose ? accent : '#555' }]} />
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
            </GlassCard>
          </FadeIn>
        )}
      </View>

      {/* ═══ Add Reading Modal ═══ */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Log Glucose Reading</Text>
            <Text style={styles.inputLabel}>Glucose Value (mg/dL)</Text>
            <TextInput style={styles.input} placeholder="e.g. 120" placeholderTextColor="#555" keyboardType="numeric" value={newValue} onChangeText={setNewValue} maxLength={3} />
            <Text style={styles.inputLabel}>Trend</Text>
            <View style={styles.trendRow}>
              {TREND_OPTIONS.map(t => (
                <TouchableOpacity key={t.value} style={[styles.trendButton, newTrend === t.value && [styles.trendButtonActive, { backgroundColor: accent, borderColor: accent }]]} onPress={() => setNewTrend(t.value)}>
                  <Text style={[styles.trendButtonText, newTrend === t.value && styles.trendButtonTextActive]}>{t.arrow}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.inputLabel}>Notes (optional)</Text>
            <TextInput style={[styles.input, { height: 60 }]} placeholder="After lunch, before exercise..." placeholderTextColor="#555" value={newNotes} onChangeText={setNewNotes} multiline />
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
            <TextInput style={styles.input} placeholder="https://mysite.herokuapp.com" placeholderTextColor="#555" value={nsUrl} onChangeText={setNsUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
            <Text style={styles.inputLabel}>API Secret (optional)</Text>
            <TextInput style={styles.input} placeholder="Leave blank if not required" placeholderTextColor="#555" value={nsSecret} onChangeText={setNsSecret} autoCapitalize="none" autoCorrect={false} secureTextEntry />
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

      {/* ═══ Add Note Modal ═══ */}
      <Modal visible={showNoteModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📝 Add a Note</Text>
            <Text style={styles.modalHint}>Notes appear on the timeline and are visible to your Care Circle.</Text>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              placeholder="e.g. Had pizza for dinner, feeling tired..."
              placeholderTextColor="#555"
              value={newNoteText}
              onChangeText={setNewNoteText}
              multiline
              maxLength={500}
              autoFocus
            />
            <Text style={styles.charCount}>{newNoteText.length}/500</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => { setShowNoteModal(false); setNewNoteText(''); }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveButton, { backgroundColor: accent }]} onPress={handleAddNote} disabled={noteSaving || !newNoteText.trim()}>
                {noteSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save Note</Text>}
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
  container: { flex: 1, backgroundColor: '#0A0A0F' },

  /* Hero gradient */
  headerGradient: { padding: 24, alignItems: 'center', paddingTop: 30, paddingBottom: 35 },
  memberPill: { backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, marginBottom: 12, maxWidth: '90%' },
  memberPillText: { fontSize: 13, color: '#fff', opacity: 0.9 },
  staleBanner: { backgroundColor: 'rgba(255,165,0,0.20)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,165,0,0.45)' },
  staleBannerText: { fontSize: 13, color: '#FFA500', fontWeight: TYPE.semibold, textAlign: 'center' },
  emptyHero: { alignItems: 'center', paddingVertical: 20 },
  emptyHeroValue: { fontSize: TYPE.mega, fontWeight: TYPE.bold, color: '#fff', opacity: 0.4 },
  emptyHeroUnit: { fontSize: 18, color: '#fff', opacity: 0.4 },
  lastUpdate: { fontSize: TYPE.md, color: '#fff', opacity: 0.8, marginTop: 10 },

  content: { padding: 16, marginTop: -10 },

  /* Add button */
  addButton: { borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  addButtonIcon: { fontSize: 20, marginRight: 10 },
  addButtonText: { color: '#fff', fontSize: TYPE.lg, fontWeight: TYPE.bold },

  /* Chart */
  sectionTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff', marginBottom: 14 },
  emptyChart: { alignItems: 'center', paddingVertical: 30 },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyText: { fontSize: TYPE.md, color: '#888' },

  /* Stat Arcs */
  arcsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  noDataText: { fontSize: TYPE.md, color: '#888', textAlign: 'center', paddingVertical: 15 },

  /* Notes */
  notesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  addNoteBtn: { backgroundColor: 'rgba(74,144,217,0.12)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  addNoteBtnText: { fontSize: 13, fontWeight: TYPE.semibold },
  noteCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  noteRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  noteAuthor: { fontSize: 13, fontWeight: TYPE.semibold, flex: 1, marginRight: 8 },
  noteTime: { fontSize: 11, color: '#666', flexShrink: 0 },
  noteText: { fontSize: TYPE.md, color: '#D0D0D0', lineHeight: 20 },
  noNotesText: { fontSize: 13, color: '#666', textAlign: 'center', paddingVertical: 15 },

  /* Devices */
  deviceItem: { flexDirection: 'row', alignItems: 'center' },
  deviceEmoji: { fontSize: 28, marginRight: 14 },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: TYPE.lg, fontWeight: TYPE.semibold, color: '#fff', marginBottom: 3 },
  deviceStatus: { fontSize: 13 },
  deviceSub: { fontSize: 13, color: '#A0A0A0' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  deviceDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 12 },
  connectRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  chevron: { fontSize: 28, color: '#555', fontWeight: '300' },
  dexcomActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  syncBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 10, gap: 6 },
  syncBtnIcon: { fontSize: 16 },
  syncBtnText: { fontSize: TYPE.md, fontWeight: TYPE.bold, color: '#fff' },
  disconnectBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,107,107,0.10)', borderWidth: 1, borderColor: 'rgba(255,107,107,0.25)', justifyContent: 'center' },
  disconnectBtnText: { fontSize: 13, color: '#FF6B6B', fontWeight: TYPE.semibold },
  shareNote: { fontSize: TYPE.sm, color: '#00D4AA', textAlign: 'center', marginTop: 10 },

  /* Modals */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1A1A20', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 25, paddingBottom: 40 },
  modalTitle: { fontSize: TYPE.xxl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 16, textAlign: 'center' },
  modalHint: { fontSize: 13, color: '#A0A0A0', textAlign: 'center', marginBottom: 16, lineHeight: 19 },
  modalFine: { fontSize: 11, color: '#666', marginTop: 6 },
  charCount: { fontSize: 11, color: '#555', textAlign: 'right', marginTop: 4, marginBottom: 12 },
  inputLabel: { fontSize: TYPE.md, fontWeight: TYPE.semibold, color: '#E0E0E0', marginBottom: 8, marginTop: 10 },
  input: { backgroundColor: '#2A2A32', borderRadius: 12, padding: 14, fontSize: TYPE.lg, borderWidth: 1, borderColor: '#3A3A42', color: '#fff' },
  trendRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  trendButton: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2A2A32', alignItems: 'center', borderWidth: 1, borderColor: '#3A3A42' },
  trendButtonActive: {},
  trendButtonText: { fontSize: 20, color: '#A0A0A0' },
  trendButtonTextActive: { color: '#fff' },
  modalButtons: { flexDirection: 'row', marginTop: 25, gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#2A2A32', alignItems: 'center' },
  cancelButtonText: { fontSize: TYPE.lg, color: '#A0A0A0', fontWeight: TYPE.semibold },
  saveButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveButtonText: { fontSize: TYPE.lg, color: '#fff', fontWeight: TYPE.bold },
});
