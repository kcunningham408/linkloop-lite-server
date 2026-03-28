import { useEffect, useRef, useState } from 'react';
import { Alert, Animated as RNAnimated, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn, stagger } from '../config/animations';
import { haptic } from '../config/haptics';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { circleAPI, glucoseAPI, usersAPI } from '../services/api';

export default function SettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuth();
  const { palette, setTheme, palettes } = useTheme();
  const isMember = user?.role === 'member';
  const accent = isMember ? palette.member : palette.warrior;

  // ── Alert thresholds ──
  const [lowThreshold, setLowThreshold] = useState(String(user?.settings?.lowThreshold ?? 70));
  const [highThreshold, setHighThreshold] = useState(String(user?.settings?.highThreshold ?? 180));
  const [highAlertDelay, setHighAlertDelay] = useState(String(user?.settings?.highAlertDelay ?? 0));
  const [savingThresholds, setSavingThresholds] = useState(false);

  // ── Push notification prefs ──
  const [pushPrefs, setPushPrefs] = useState({
    glucoseAlerts: true,
    acknowledgments: true,
    alertResolved: true,
    newMessages: true,
    groupMessages: true,
    dailyInsights: true,
  });

  // ── Pause alerts (members) ──
  const [alertsPaused, setAlertsPaused] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);

  // ── Export ──
  const [exporting, setExporting] = useState(false);

  // ── Save toast ──
  const [savedToast, setSavedToast] = useState(false);
  const toastOpacity = useRef(new RNAnimated.Value(0)).current;
  const showSavedToast = () => {
    haptic.success();
    setSavedToast(true);
    RNAnimated.sequence([
      RNAnimated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      RNAnimated.delay(1200),
      RNAnimated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setSavedToast(false));
  };

  useEffect(() => {
    if (user?.pushPreferences) {
      setPushPrefs(prev => ({ ...prev, ...user.pushPreferences }));
    }
    if (isMember) {
      circleAPI.getMyMembership().then(data => {
        if (data?.status === 'paused') setAlertsPaused(true);
      }).catch(() => {});
    }
  }, []);

  const handleSaveThresholds = async () => {
    const low = parseInt(lowThreshold);
    const high = parseInt(highThreshold);
    const delay = parseInt(highAlertDelay) || 0;
    if (isNaN(low) || isNaN(high)) {
      Alert.alert('Error', 'Please enter valid numbers for both thresholds.');
      return;
    }
    if (low < 40 || low > 120) {
      Alert.alert('Error', 'Low threshold should be between 40 and 120 mg/dL.');
      return;
    }
    if (high < 120 || high > 400) {
      Alert.alert('Error', 'High threshold should be between 120 and 400 mg/dL.');
      return;
    }
    if (low >= high) {
      Alert.alert('Error', 'Low threshold must be less than high threshold.');
      return;
    }
    if (delay < 0 || delay > 120) {
      Alert.alert('Error', 'High alert delay should be between 0 and 120 minutes.');
      return;
    }
    setSavingThresholds(true);
    haptic.medium();
    try {
      await updateUser({ settings: { lowThreshold: low, highThreshold: high, highAlertDelay: delay } });
      showSavedToast();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save thresholds');
    } finally {
      setSavingThresholds(false);
    }
  };

  const handleTogglePauseAlerts = async () => {
    const newVal = !alertsPaused;
    setAlertsPaused(newVal);
    setPauseLoading(true);
    try {
      await circleAPI.pauseMyAlerts(newVal);
    } catch (err) {
      setAlertsPaused(!newVal);
      Alert.alert('Error', 'Could not update pause status');
    } finally {
      setPauseLoading(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const data = await glucoseAPI.exportCSV(30);
      const { Share } = require('react-native');
      await Share.share({
        message: data.csv,
        title: `LinkLoop Glucose Export (${data.count} readings)`,
      });
    } catch (err) {
      if (err.message !== 'User did not share') {
        Alert.alert('Error', err.message || 'Could not export data');
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
    {savedToast && (
      <RNAnimated.View style={[styles.savedToast, { opacity: toastOpacity }]}>
        <Text style={styles.savedToastText}>✓ Saved</Text>
      </RNAnimated.View>
    )}
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}>
      <View style={styles.content}>

        {/* ── Alert Thresholds ── */}
        <FadeIn delay={0}>
          <View style={[styles.opaqueCard, { borderLeftWidth: 5, borderLeftColor: accent }]}>
            <Text style={styles.cardHeaderTitle}>ALERT THRESHOLDS</Text>
            <Text style={[styles.desc, { marginBottom: 12 }]}>
              {isMember
                ? 'Set your personal alert levels. You\'ll only get push notifications when glucose crosses YOUR thresholds.'
                : 'Set your low and high glucose alert levels. Circle members can also set their own thresholds independently.'}
            </Text>

            {[
              { icon: '📉', title: 'Low Alert (mg/dL)', hint: 'Get alerted when glucose drops below this', value: lowThreshold, setter: setLowThreshold },
              { icon: '📈', title: 'High Alert (mg/dL)', hint: 'Get alerted when glucose goes above this', value: highThreshold, setter: setHighThreshold },
              { icon: '⏱️', title: 'High Alert Delay (min)', hint: 'Wait this many minutes above threshold before alerting. 0 = immediate.', value: highAlertDelay, setter: setHighAlertDelay, placeholder: '0' },
            ].map((item, idx, arr) => (
              <View key={idx}>
                <View style={styles.settingRow}>
                  <View style={[styles.iconCircle, { backgroundColor: accent + '15' }]}>
                    <Text style={{ fontSize: 16 }}>{item.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingTitle}>{item.title}</Text>
                    <Text style={styles.desc}>{item.hint}</Text>
                  </View>
                  <TextInput
                    style={[styles.thresholdInput, { borderColor: accent }]}
                    value={item.value}
                    onChangeText={item.setter}
                    keyboardType="number-pad"
                    maxLength={3}
                    selectTextOnFocus
                    placeholder={item.placeholder}
                    placeholderTextColor="#888"
                  />
                </View>
                {idx < arr.length - 1 && <View style={styles.rowDivider} />}
              </View>
            ))}

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: accent }]}
              onPress={handleSaveThresholds}
              disabled={savingThresholds}
            >
              <Text style={styles.saveBtnText}>{savingThresholds ? 'Saving...' : 'Save Alert Settings'}</Text>
            </TouchableOpacity>
          </View>
        </FadeIn>

        {/* ── Notification Preferences ── */}
        <FadeIn delay={stagger(1, 100)}>
          <View style={styles.opaqueCard}>
            <Text style={styles.cardHeaderTitle}>NOTIFICATIONS</Text>
            <View style={styles.rowDivider} />

            {[
              { key: 'glucoseAlerts', icon: '📉', title: 'Glucose Alerts', desc: 'Low, high, urgent & rapid changes' },
              { key: 'acknowledgments', icon: '✅', title: 'Acknowledgments', desc: 'Someone acknowledged an alert' },
              { key: 'alertResolved', icon: '☑️', title: 'Alert Resolved', desc: 'Warrior resolved an active alert' },
              { key: 'newMessages', icon: '💬', title: 'Direct Messages', desc: '1-on-1 chat messages' },
              { key: 'groupMessages', icon: '👥', title: 'Group Messages', desc: 'Care Circle group chat' },
              ...(!isMember ? [{ key: 'dailyInsights', icon: '✨', title: 'Evening Recap', desc: 'AI glucose recap at 7 PM daily' }] : []),
            ].map((item, idx, arr) => (
              <View key={item.key}>
                <View style={styles.settingRow}>
                  <View style={[styles.iconCircle, { backgroundColor: accent + '15' }]}>
                    <Text style={{ fontSize: 16 }}>{item.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingTitle}>{item.title}</Text>
                    <Text style={styles.desc}>{item.desc}</Text>
                  </View>
                  <Switch
                    value={pushPrefs[item.key]}
                    onValueChange={(val) => {
                      setPushPrefs(p => ({ ...p, [item.key]: val }));
                      usersAPI.savePushPreferences({ [item.key]: val }).then(() => showSavedToast()).catch(console.log);
                    }}
                    trackColor={{ false: '#3E3E58', true: accent }}
                    thumbColor="#fff"
                    style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                  />
                </View>
                {idx < arr.length - 1 && <View style={styles.rowDivider} />}
              </View>
            ))}
          </View>
        </FadeIn>

        {/* ── Pause Alerts (Members only) ── */}
        {isMember && (
          <FadeIn delay={stagger(2, 100)}>
            <View style={styles.opaqueCard}>
              <Text style={styles.cardHeaderTitle}>PAUSE ALERTS</Text>
              <View style={styles.rowDivider} />
              <View style={styles.settingRow}>
                <View style={[styles.iconCircle, { backgroundColor: '#FF980015' }]}>
                  <Text style={{ fontSize: 16 }}>🔇</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingTitle}>Pause My Alerts</Text>
                  <Text style={styles.desc}>
                    {alertsPaused
                      ? 'Your alerts are paused. You won\'t receive glucose notifications.'
                      : 'Temporarily stop receiving glucose alerts from this circle.'}
                  </Text>
                </View>
                <Switch
                  value={alertsPaused}
                  onValueChange={handleTogglePauseAlerts}
                  disabled={pauseLoading}
                  trackColor={{ false: '#3E3E58', true: '#FF9800' }}
                  thumbColor="#fff"
                  style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                />
              </View>
            </View>
          </FadeIn>
        )}

        {/* ── Export Data (Warriors only) ── */}
        {!isMember && (
          <FadeIn delay={stagger(2, 100)}>
            <View style={styles.opaqueCard}>
              <Text style={styles.cardHeaderTitle}>EXPORT DATA</Text>
              <View style={styles.rowDivider} />
              <TouchableOpacity style={styles.settingRow} onPress={handleExportData} disabled={exporting}>
                <View style={[styles.iconCircle, { backgroundColor: accent + '15' }]}>
                  <Text style={{ fontSize: 16 }}>📊</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingTitle}>{exporting ? 'Exporting...' : 'Export Glucose Data (CSV)'}</Text>
                  <Text style={styles.desc}>Download last 30 days of glucose readings</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            </View>
          </FadeIn>
        )}

        {/* ── Theme Picker ── */}
        <FadeIn delay={stagger(3, 100)}>
          <View style={styles.opaqueCard}>
            <Text style={styles.cardHeaderTitle}>APP THEME</Text>
            <Text style={[styles.desc, { marginBottom: 14 }]}>
              Choose a color palette for your LinkLoop experience
            </Text>
            <View style={styles.themeGrid}>
              {palettes.map((p) => {
                const isActive = palette.id === p.id;
                const displayColor = isMember ? p.member : p.warrior;
                const displayDark = isMember ? p.memberDark : p.warriorDark;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.themeOption,
                      isActive && { borderColor: displayColor, borderWidth: 2 },
                    ]}
                    onPress={() => { haptic.selection(); setTheme(p.id); }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.themeColorRow}>
                      <View style={[styles.themeColorDot, { backgroundColor: displayColor }]} />
                      <View style={[styles.themeColorDot, { backgroundColor: displayDark }]} />
                    </View>
                    <Text style={[
                      styles.themeOptionLabel,
                      isActive && { color: displayColor, fontWeight: TYPE.bold },
                    ]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {isActive && (
                      <Text style={[styles.themeActiveCheck, { color: displayColor }]}>✓</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Preview */}
            <View style={[styles.themePreview, { borderColor: accent }]}>
              <Text style={styles.themePreviewLabel}>Preview</Text>
              <View style={styles.themePreviewRow}>
                <View style={[styles.themePreviewBtn, { backgroundColor: accent }]}>
                  <Text style={styles.themePreviewBtnText}>Button</Text>
                </View>
                <View style={[styles.themePreviewBadge, { borderColor: accent }]}>
                  <Text style={[styles.themePreviewBadgeText, { color: accent }]}>Badge</Text>
                </View>
                <View style={[styles.themePreviewDot, { backgroundColor: accent }]} />
              </View>
            </View>
          </View>
        </FadeIn>

      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 16 },

  savedToast: {
    position: 'absolute', top: 50, alignSelf: 'center', zIndex: 100,
    backgroundColor: 'rgba(76,175,80,0.92)', paddingHorizontal: 24, paddingVertical: 10,
    borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, elevation: 10,
  },
  savedToastText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  /* Opaque card */
  opaqueCard: {
    backgroundColor: 'rgba(10,18,40,0.94)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardHeaderTitle: { fontSize: 13, fontWeight: TYPE.bold, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  rowDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 2 },
  desc: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.45)', lineHeight: 16 },

  /* Setting rows */
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  iconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  settingTitle: { fontSize: 15, fontWeight: TYPE.semibold, color: '#fff', marginBottom: 2 },
  chevron: { fontSize: 22, color: 'rgba(255,255,255,0.3)', fontWeight: '300' },

  thresholdInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff',
    textAlign: 'center', width: 64, borderWidth: 1,
  },

  saveBtn: { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, alignSelf: 'flex-end', marginTop: 12 },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: TYPE.semibold },

  /* Theme */
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  themeOption: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
  },
  themeColorRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  themeColorDot: { width: 24, height: 24, borderRadius: 12 },
  themeOptionLabel: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: TYPE.medium },
  themeActiveCheck: { position: 'absolute', top: 10, right: 12, fontSize: TYPE.lg, fontWeight: TYPE.bold },
  themePreview: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, padding: 14, borderWidth: 1, alignItems: 'center',
  },
  themePreviewLabel: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.45)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  themePreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  themePreviewBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  themePreviewBtnText: { color: '#fff', fontSize: 13, fontWeight: TYPE.bold },
  themePreviewBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  themePreviewBadgeText: { fontSize: TYPE.sm, fontWeight: TYPE.semibold },
  themePreviewDot: { width: 16, height: 16, borderRadius: 8 },
});
