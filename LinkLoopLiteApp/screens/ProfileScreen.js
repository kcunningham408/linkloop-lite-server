import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import GlassCard from '../components/GlassCard';
import LinkLoopBanner from '../components/LinkLoopBanner';
import { FadeIn, stagger } from '../config/animations';
import { haptic } from '../config/haptics';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { authAPI, circleAPI, glucoseAPI, usersAPI } from '../services/api';

const APP_VERSION = Constants.expoConfig?.version || Constants.manifest?.version || '1.1.0';

export default function ProfileScreen() {
  const { user, logout, deleteAccount, updateUser } = useAuth();
  const { palette, setTheme, palettes, getGradient } = useTheme();
  const isMember = user?.role === 'member';
  const accent = isMember ? palette.member : palette.warrior;
  const gradient = getGradient(isMember);
  const [pushPrefs, setPushPrefs] = useState({
    glucoseAlerts: true,
    acknowledgments: true,
    alertResolved: true,
    newMessages: true,
    groupMessages: true,
  });
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);
  const [editingWarriorName, setEditingWarriorName] = useState(false);
  const [newWarriorName, setNewWarriorName] = useState(user?.warriorDisplayName || '');
  const [savingWarriorName, setSavingWarriorName] = useState(false);
  const [lowThreshold, setLowThreshold] = useState(String(user?.settings?.lowThreshold ?? 70));
  const [highThreshold, setHighThreshold] = useState(String(user?.settings?.highThreshold ?? 180));
  const [highAlertDelay, setHighAlertDelay] = useState(String(user?.settings?.highAlertDelay ?? 0));
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [alertsPaused, setAlertsPaused] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [watchCode, setWatchCode] = useState(null);
  const [watchCodeLoading, setWatchCodeLoading] = useState(false);

  const handleWatchPair = async () => {
    try {
      setWatchCodeLoading(true);
      const data = await authAPI.generateWatchPairCode();
      setWatchCode(data.code);
      haptic.success();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not generate code');
    } finally {
      setWatchCodeLoading(false);
    }
  };

  useEffect(() => {
    // Load push preferences from user object
    if (user?.pushPreferences) {
      setPushPrefs(prev => ({ ...prev, ...user.pushPreferences }));
    }
    // Load membership status for members (pause state)
    if (isMember) {
      circleAPI.getMyMembership().then(data => {
        if (data?.status === 'paused') setAlertsPaused(true);
      }).catch(() => {});
    }
  }, []);

  const handleLogout = () => {
    haptic.warning();
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const handleDeleteAccount = () => {
    haptic.heavy();
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account? This will remove all your data including glucose readings, care circle, and mood entries. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'This is permanent. All your data will be deleted forever. Are you absolutely sure?',
              [
                { text: 'Keep Account', style: 'cancel' },
                {
                  text: 'Yes, Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteAccount();
                    } catch (err) {
                      Alert.alert('Error', err.message || 'Could not delete account. Please try again.');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleSaveName = async () => {
    if (!newName.trim()) { Alert.alert('Error', 'Name cannot be empty'); return; }
    haptic.medium();
    setSavingName(true);
    try {
      await updateUser({ name: newName.trim() });
      haptic.success();
      setEditingName(false);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not update name');
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveWarriorName = async () => {
    haptic.medium();
    setSavingWarriorName(true);
    try {
      await updateUser({ warriorDisplayName: newWarriorName.trim() || null });
      setEditingWarriorName(false);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not update warrior name');
    } finally {
      setSavingWarriorName(false);
    }
  };

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
      Alert.alert('Saved', 'Your alert settings have been updated.');
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
      setAlertsPaused(!newVal); // revert
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

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 90 }}>
      {/* ── Hero Banner ── */}
      <FadeIn delay={0} slideY={0}>
      <LinkLoopBanner accent={accent} secondary={gradient[1] || accent}>
        {/* Decorative circles */}
        <View style={styles.heroDecoCircle1} />
        <View style={styles.heroDecoCircle2} />

        {/* Avatar with glow ring */}
        <View style={[styles.avatarRing, { borderColor: accent + '80' }]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase() || '∞'}</Text>
          </View>
        </View>

        <Text style={styles.heroName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{user?.name || 'LinkLoop User'}</Text>
        <Text style={styles.heroEmail} numberOfLines={1}>{user?.email || ''}</Text>

        {/* Role badge */}
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>
            {isMember ? '∞ Loop Member' : '💙 T1D Warrior'}
          </Text>
        </View>

        {/* Quick stats row */}
        <View style={styles.heroStatsRow}>
          {memberSince && (
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Joined</Text>
              <Text style={styles.heroStatValue} numberOfLines={1}>{memberSince}</Text>
            </View>
          )}
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>Role</Text>
            <Text style={styles.heroStatValue} numberOfLines={1}>{isMember ? 'Member' : 'Warrior'}</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>Version</Text>
            <Text style={styles.heroStatValue} numberOfLines={1}>v{APP_VERSION}</Text>
          </View>
        </View>
      </LinkLoopBanner>
      </FadeIn>

      <View style={styles.content}>
        <FadeIn delay={stagger(1, 100)}>
        {/* Account Settings */}
        <GlassCard style={styles.settingsCard}>
          <Text style={styles.sectionTitle}>Account Settings</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>{'\uD83D\uDC64'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Display Name</Text>
                {editingName ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                    <TextInput
                      style={[styles.nameInput, { borderColor: accent }]}
                      value={newName}
                      onChangeText={setNewName}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleSaveName}
                    />
                    <TouchableOpacity onPress={handleSaveName} disabled={savingName} style={[styles.nameSaveBtn, { backgroundColor: accent }]}>
                      <Text style={styles.nameSaveBtnText}>{savingName ? '...' : 'Save'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setEditingName(false); setNewName(user?.name || ''); }} style={styles.nameCancelBtn}>
                      <Text style={styles.nameCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setEditingName(true)}>
                    <Text style={[styles.settingValue, { color: accent }]}>{user?.name || 'Not set'} ✏️</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>{'\uD83D\uDCE7'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Email</Text>
                <Text style={styles.settingValue} numberOfLines={1}>{user?.email || 'Not set'}</Text>
              </View>
            </View>
          </View>

          {/* Warrior Display Name — only visible to Loop Members */}
          {isMember && (
            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingIcon}>💙</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingTitle}>Warrior Name</Text>
                  <Text style={styles.settingDescription}>Customize how your warrior's name appears</Text>
                  {editingWarriorName ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <TextInput
                        style={[styles.nameInput, { borderColor: accent }]}
                        value={newWarriorName}
                        onChangeText={setNewWarriorName}
                        placeholder="e.g. Shayla, My Daughter"
                        placeholderTextColor="#666"
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={handleSaveWarriorName}
                      />
                      <TouchableOpacity onPress={handleSaveWarriorName} disabled={savingWarriorName} style={[styles.nameSaveBtn, { backgroundColor: accent }]}>
                        <Text style={styles.nameSaveBtnText}>{savingWarriorName ? '...' : 'Save'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setEditingWarriorName(false); setNewWarriorName(user?.warriorDisplayName || ''); }} style={styles.nameCancelBtn}>
                        <Text style={styles.nameCancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => setEditingWarriorName(true)}>
                      <Text style={[styles.settingValue, { color: accent }]}>{user?.warriorDisplayName || 'Use default name'} ✏️</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}
        </GlassCard>

        {/* Alert Thresholds */}
        <GlassCard style={styles.settingsCard}>
          <Text style={styles.sectionTitle}>🎯 Alert Thresholds</Text>
          <Text style={[styles.settingDescription, { marginBottom: 14 }]}>
            {isMember
              ? 'Set your personal alert levels. You\'ll only get push notifications when glucose crosses YOUR thresholds.'
              : 'Set your low and high glucose alert levels. Circle members can also set their own thresholds independently.'}
          </Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>📉</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Low Alert (mg/dL)</Text>
                <Text style={styles.settingDescription}>Get alerted when glucose drops below this</Text>
              </View>
            </View>
            <TextInput
              style={[styles.thresholdInput, { borderColor: accent }]}
              value={lowThreshold}
              onChangeText={setLowThreshold}
              keyboardType="number-pad"
              maxLength={3}
              selectTextOnFocus
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>📈</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>High Alert (mg/dL)</Text>
                <Text style={styles.settingDescription}>Get alerted when glucose goes above this</Text>
              </View>
            </View>
            <TextInput
              style={[styles.thresholdInput, { borderColor: accent }]}
              value={highThreshold}
              onChangeText={setHighThreshold}
              keyboardType="number-pad"
              maxLength={3}
              selectTextOnFocus
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>⏱️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>High Alert Delay (min)</Text>
                <Text style={styles.settingDescription}>Wait this many minutes above your high threshold before alerting. Set to 0 for immediate. Lows always alert immediately.</Text>
              </View>
            </View>
            <TextInput
              style={[styles.thresholdInput, { borderColor: accent }]}
              value={highAlertDelay}
              onChangeText={setHighAlertDelay}
              keyboardType="number-pad"
              maxLength={3}
              selectTextOnFocus
              placeholder="0"
              placeholderTextColor="#666"
            />
          </View>

          <TouchableOpacity
            style={[styles.nameSaveBtn, { backgroundColor: accent, alignSelf: 'flex-end', marginTop: 10, paddingHorizontal: 20, paddingVertical: 10 }]}
            onPress={handleSaveThresholds}
            disabled={savingThresholds}
          >
            <Text style={styles.nameSaveBtnText}>{savingThresholds ? 'Saving...' : 'Save Alert Settings'}</Text>
          </TouchableOpacity>
        </GlassCard>

        {/* Push Notification Preferences */}
        <GlassCard style={styles.settingsCard}>
          <Text style={styles.sectionTitle}>{'\uD83D\uDD14'} Notification Preferences</Text>
          <Text style={[styles.settingDescription, { marginBottom: 12 }]}>
            Control which push notifications you receive
          </Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>{'\uD83D\uDCC9'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Glucose Alerts</Text>
                <Text style={styles.settingDescription}>Low, high, urgent & rapid changes</Text>
              </View>
            </View>
            <Switch
              value={pushPrefs.glucoseAlerts}
              onValueChange={(val) => {
                setPushPrefs(p => ({ ...p, glucoseAlerts: val }));
                usersAPI.savePushPreferences({ glucoseAlerts: val }).catch(console.log);
              }}
              trackColor={{ false: '#3A3A3C', true: accent }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>{'\u2705'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Acknowledgments</Text>
                <Text style={styles.settingDescription}>Someone acknowledged an alert</Text>
              </View>
            </View>
            <Switch
              value={pushPrefs.acknowledgments}
              onValueChange={(val) => {
                setPushPrefs(p => ({ ...p, acknowledgments: val }));
                usersAPI.savePushPreferences({ acknowledgments: val }).catch(console.log);
              }}
              trackColor={{ false: '#3A3A3C', true: accent }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>{'\u2611\uFE0F'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Alert Resolved</Text>
                <Text style={styles.settingDescription}>Warrior resolved an active alert</Text>
              </View>
            </View>
            <Switch
              value={pushPrefs.alertResolved}
              onValueChange={(val) => {
                setPushPrefs(p => ({ ...p, alertResolved: val }));
                usersAPI.savePushPreferences({ alertResolved: val }).catch(console.log);
              }}
              trackColor={{ false: '#3A3A3C', true: accent }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>{'\uD83D\uDCAC'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Direct Messages</Text>
                <Text style={styles.settingDescription}>1-on-1 chat messages</Text>
              </View>
            </View>
            <Switch
              value={pushPrefs.newMessages}
              onValueChange={(val) => {
                setPushPrefs(p => ({ ...p, newMessages: val }));
                usersAPI.savePushPreferences({ newMessages: val }).catch(console.log);
              }}
              trackColor={{ false: '#3A3A3C', true: accent }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>{'\uD83D\uDC65'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Group Messages</Text>
                <Text style={styles.settingDescription}>Care Circle group chat messages</Text>
              </View>
            </View>
            <Switch
              value={pushPrefs.groupMessages}
              onValueChange={(val) => {
                setPushPrefs(p => ({ ...p, groupMessages: val }));
                usersAPI.savePushPreferences({ groupMessages: val }).catch(console.log);
              }}
              trackColor={{ false: '#3A3A3C', true: accent }}
              thumbColor="#fff"
            />
          </View>
        </GlassCard>

        {/* Pause Alerts — Members only */}
        {isMember && (
          <GlassCard style={styles.settingsCard}>
            <Text style={styles.sectionTitle}>⏸️ Pause Alerts</Text>
            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingIcon}>🔇</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingTitle}>Pause My Alerts</Text>
                  <Text style={styles.settingDescription}>
                    {alertsPaused
                      ? 'Your alerts are paused. You won\'t receive glucose notifications.'
                      : 'Temporarily stop receiving glucose alerts from this circle.'}
                  </Text>
                </View>
              </View>
              <Switch
                value={alertsPaused}
                onValueChange={handleTogglePauseAlerts}
                disabled={pauseLoading}
                trackColor={{ false: '#3A3A3C', true: '#FF9800' }}
                thumbColor="#fff"
              />
            </View>
          </GlassCard>
        )}

        {/* Export Data — Warriors only */}
        {!isMember && (
          <GlassCard style={styles.settingsCard}>
            <Text style={styles.sectionTitle}>📤 Export Data</Text>
            <TouchableOpacity
              style={[styles.settingItem, { justifyContent: 'center' }]}
              onPress={handleExportData}
              disabled={exporting}
            >
              <View style={styles.settingInfo}>
                <Text style={styles.settingIcon}>📊</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingTitle}>{exporting ? 'Exporting...' : 'Export Glucose Data (CSV)'}</Text>
                  <Text style={styles.settingDescription}>Download last 30 days of glucose readings</Text>
                </View>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </GlassCard>
        )}

        {/* Theme Picker */}
        <GlassCard style={styles.settingsCard}>
          <Text style={styles.sectionTitle}>🎨 App Theme</Text>
          <Text style={[styles.settingDescription, { marginBottom: 16 }]}>
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
        </GlassCard>

        {/* App Info */}
        <GlassCard style={styles.settingsCard}>
          <Text style={styles.sectionTitle}>App Information</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>📱</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Version</Text>
                <Text style={styles.settingValue}>{APP_VERSION}</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity style={styles.settingItem} onPress={() => Linking.openURL('https://kcunningham408.github.io/vibecmd-pages/linkloop/privacy.html')}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>🔒</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Privacy Policy</Text>
                <Text style={styles.settingDescription}>View our privacy policy</Text>
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={() => Linking.openURL('https://kcunningham408.github.io/vibecmd-pages/linkloop/terms.html')}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>📋</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Terms of Service</Text>
                <Text style={styles.settingDescription}>View terms and conditions</Text>
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={() => Linking.openURL('https://kcunningham408.github.io/vibecmd-pages/linkloop/support.html')}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>💬</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Support</Text>
                <Text style={styles.settingDescription}>Get help or report an issue</Text>
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </GlassCard>

        {/* Apple Watch Pairing */}
        <GlassCard style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: accent }]}>⌚ Apple Watch</Text>
          <Text style={[styles.settingDescription, { marginBottom: 12 }]}>
            Generate a pairing code to connect your Apple Watch to LinkLoop.
          </Text>

          {watchCode ? (
            <View style={{ alignItems: 'center', marginVertical: 8 }}>
              <Text style={{ fontSize: 36, fontWeight: '800', letterSpacing: 8, color: accent, fontFamily: 'Courier' }}>
                {watchCode}
              </Text>
              <Text style={[styles.settingDescription, { marginTop: 8 }]}>
                Enter this code on your Watch.{'\n'}Expires in 10 minutes.
              </Text>
              <TouchableOpacity onPress={handleWatchPair} style={{ marginTop: 12 }}>
                <Text style={{ color: accent, fontWeight: '600' }}>Generate New Code</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.pairButton, { backgroundColor: accent }]}
              onPress={handleWatchPair}
              disabled={watchCodeLoading}
            >
              <Text style={styles.pairButtonText}>
                {watchCodeLoading ? 'Generating...' : 'Generate Pairing Code'}
              </Text>
            </TouchableOpacity>
          )}
        </GlassCard>

        {/* Sign Out */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutIcon}>🚪</Text>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Delete Account */}
        <TouchableOpacity style={styles.deleteAccountButton} onPress={handleDeleteAccount}>
          <Text style={styles.deleteAccountIcon}>⚠️</Text>
          <Text style={styles.deleteAccountText}>Delete Account</Text>
        </TouchableOpacity>

        {/* Disclaimer */}
        <GlassCard style={styles.disclaimerCard}>
          <Text style={styles.disclaimerIcon}>💚</Text>
          <Text style={styles.disclaimerText}>
            LinkLoop is a personal wellness journal for logging your T1D data. It is not a medical device and does not provide medical advice.
          </Text>
        </GlassCard>
        </FadeIn>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  content: { padding: 20 },

  // ── Hero Banner ──
  heroDecoCircle1: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroDecoCircle2: {
    position: 'absolute',
    bottom: -30,
    left: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  avatarRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  avatar: {
    width: 98,
    height: 98,
    borderRadius: 49,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 42, fontWeight: TYPE.bold, color: '#fff' },
  heroName: { fontSize: TYPE.h2, fontWeight: TYPE.extrabold, color: '#fff', marginBottom: 4, letterSpacing: -0.3 },
  heroEmail: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.7)', marginBottom: 12 },
  heroBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 18,
  },
  heroBadgeText: { fontSize: TYPE.sm, fontWeight: TYPE.bold, color: '#fff' },
  heroStatsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    width: '100%',
    justifyContent: 'space-evenly',
  },
  heroStat: { alignItems: 'center', flex: 1 },
  heroStatLabel: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.6)', fontWeight: TYPE.medium, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroStatValue: { fontSize: TYPE.md, color: '#fff', fontWeight: TYPE.bold, textAlign: 'center' },

  settingsCard: { borderRadius: 12, padding: 20, marginBottom: 20 },
  sectionTitle: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 15 },
  settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  settingInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  settingIcon: { fontSize: TYPE.h3, marginRight: 14 },
  settingTitle: { fontSize: 15, fontWeight: TYPE.semibold, color: '#fff', marginBottom: 2 },
  settingValue: { fontSize: 13, color: '#A0A0A0' },
  settingDescription: { fontSize: TYPE.sm, color: '#888' },
  chevron: { fontSize: TYPE.h3, color: '#555', fontWeight: '300' },
  dexcomActionButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#2A1A1A', borderWidth: 1, borderColor: '#3A2020' },
  dexcomDisconnectText: { fontSize: 13, color: '#FF6B6B', fontWeight: TYPE.semibold },
  dexcomConnectButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#1A2235', borderWidth: 1, borderColor: '#4A90D9' },
  dexcomConnectText: { fontSize: 13, color: '#4A90D9', fontWeight: TYPE.semibold },
  logoutButton: { backgroundColor: 'rgba(255,60,60,0.08)', borderRadius: 12, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,60,60,0.15)' },
  logoutIcon: { fontSize: 20, marginRight: 10 },
  logoutText: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#FF6B6B' },
  pairButton: { borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center' },
  pairButtonText: { fontSize: TYPE.md, fontWeight: TYPE.bold, color: '#fff' },
  deleteAccountButton: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  deleteAccountIcon: { fontSize: TYPE.xl, marginRight: 10 },
  deleteAccountText: { fontSize: TYPE.md, fontWeight: TYPE.semibold, color: '#888' },
  disclaimerCard: { borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 30 },
  disclaimerIcon: { fontSize: 20, marginRight: 10, marginTop: 2 },
  disclaimerText: { fontSize: TYPE.sm, color: '#888', flex: 1, lineHeight: 18 },
  nameInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: TYPE.md, color: '#fff', borderWidth: 1, borderColor: '#4A90D9' },
  nameSaveBtn: { backgroundColor: '#4A90D9', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 8 },
  nameSaveBtnText: { color: '#fff', fontSize: 13, fontWeight: TYPE.semibold },
  nameCancelBtn: { paddingHorizontal: 10, paddingVertical: 6, marginLeft: 4 },
  nameCancelBtnText: { color: '#888', fontSize: 13 },
  thresholdInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff', textAlign: 'center', width: 70, borderWidth: 1, borderColor: '#4A90D9' },

  // Theme Picker
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  themeOption: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
  },
  themeColorRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  themeColorDot: { width: 24, height: 24, borderRadius: 12 },
  themeOptionLabel: { fontSize: 13, color: '#A0A0A0', fontWeight: TYPE.medium },
  themeActiveCheck: { position: 'absolute', top: 10, right: 12, fontSize: TYPE.lg, fontWeight: TYPE.bold },
  themePreview: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  themePreviewLabel: { fontSize: TYPE.sm, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  themePreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  themePreviewBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  themePreviewBtnText: { color: '#fff', fontSize: 13, fontWeight: TYPE.bold },
  themePreviewBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  themePreviewBadgeText: { fontSize: TYPE.sm, fontWeight: TYPE.semibold },
  themePreviewDot: { width: 16, height: 16, borderRadius: 8 },
});
