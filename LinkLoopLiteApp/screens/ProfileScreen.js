import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { circleAPI, glucoseAPI, usersAPI } from '../services/api';

const APP_VERSION = Constants.expoConfig?.version || Constants.manifest?.version || '1.1.0';

export default function ProfileScreen() {
  const { user, logout, deleteAccount, updateUser } = useAuth();
  const isMember = user?.role === 'member';
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
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const handleDeleteAccount = () => {
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
    setSavingName(true);
    try {
      await updateUser({ name: newName.trim() });
      setEditingName(false);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not update name');
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveWarriorName = async () => {
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

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile & Settings</Text>
        <Text style={styles.headerSubtitle}>Manage your account and app preferences</Text>
      </View>

      <View style={styles.content}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase() || '∞'}</Text>
          </View>
          <Text style={styles.profileName}>{user?.name || 'LinkLoop User'}</Text>
          <Text style={styles.profileEmail}>{user?.email || ''}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, isMember && { borderColor: '#34C759' }]}>
              <Text style={[styles.badgeText, isMember && { color: '#34C759' }]}>
                {isMember ? '∞ Loop Member' : '💙 T1D Warrior'}
              </Text>
            </View>
          </View>
        </View>

        {/* Account Settings */}
        <View style={styles.settingsCard}>
          <Text style={styles.sectionTitle}>Account Settings</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingIcon}>{'\uD83D\uDC64'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Display Name</Text>
                {editingName ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                    <TextInput
                      style={[styles.nameInput]}
                      value={newName}
                      onChangeText={setNewName}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleSaveName}
                    />
                    <TouchableOpacity onPress={handleSaveName} disabled={savingName} style={styles.nameSaveBtn}>
                      <Text style={styles.nameSaveBtnText}>{savingName ? '...' : 'Save'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setEditingName(false); setNewName(user?.name || ''); }} style={styles.nameCancelBtn}>
                      <Text style={styles.nameCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setEditingName(true)}>
                    <Text style={[styles.settingValue, { color: '#4A90D9' }]}>{user?.name || 'Not set'} ✏️</Text>
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
                        style={[styles.nameInput]}
                        value={newWarriorName}
                        onChangeText={setNewWarriorName}
                        placeholder="e.g. Shayla, My Daughter"
                        placeholderTextColor="#666"
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={handleSaveWarriorName}
                      />
                      <TouchableOpacity onPress={handleSaveWarriorName} disabled={savingWarriorName} style={styles.nameSaveBtn}>
                        <Text style={styles.nameSaveBtnText}>{savingWarriorName ? '...' : 'Save'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setEditingWarriorName(false); setNewWarriorName(user?.warriorDisplayName || ''); }} style={styles.nameCancelBtn}>
                        <Text style={styles.nameCancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => setEditingWarriorName(true)}>
                      <Text style={[styles.settingValue, { color: '#4A90D9' }]}>{user?.warriorDisplayName || 'Use default name'} ✏️</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Alert Thresholds */}
        <View style={styles.settingsCard}>
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
              style={styles.thresholdInput}
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
              style={styles.thresholdInput}
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
              style={styles.thresholdInput}
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
            style={[styles.nameSaveBtn, { alignSelf: 'flex-end', marginTop: 10, paddingHorizontal: 20, paddingVertical: 10 }]}
            onPress={handleSaveThresholds}
            disabled={savingThresholds}
          >
            <Text style={styles.nameSaveBtnText}>{savingThresholds ? 'Saving...' : 'Save Alert Settings'}</Text>
          </TouchableOpacity>
        </View>

        {/* Push Notification Preferences */}
        <View style={styles.settingsCard}>
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
              trackColor={{ false: '#3A3A3C', true: '#4A90D9' }}
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
              trackColor={{ false: '#3A3A3C', true: '#4A90D9' }}
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
              trackColor={{ false: '#3A3A3C', true: '#4A90D9' }}
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
              trackColor={{ false: '#3A3A3C', true: '#4A90D9' }}
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
              trackColor={{ false: '#3A3A3C', true: '#4A90D9' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Pause Alerts — Members only */}
        {isMember && (
          <View style={styles.settingsCard}>
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
          </View>
        )}

        {/* Export Data — Warriors only */}
        {!isMember && (
          <View style={styles.settingsCard}>
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
          </View>
        )}

        {/* App Info */}
        <View style={styles.settingsCard}>
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
        </View>

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
        <View style={styles.disclaimerCard}>
          <Text style={styles.disclaimerIcon}>💚</Text>
          <Text style={styles.disclaimerText}>
            LinkLoop is a personal wellness journal for logging your T1D data. It is not a medical device and does not provide medical advice.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111111' },
  header: { backgroundColor: '#1C1C1E', padding: 20, paddingTop: 30 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  headerSubtitle: { fontSize: 14, color: '#A0A0A0' },
  content: { padding: 20 },
  profileCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 25, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#2C2C2E' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#4A90D9', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { fontSize: 36, fontWeight: 'bold', color: '#fff' },
  profileName: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  profileEmail: { fontSize: 14, color: '#A0A0A0', marginBottom: 12 },
  badgeRow: { flexDirection: 'row' },
  badge: { backgroundColor: '#1A2235', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#4A90D9' },
  badgeText: { fontSize: 13, color: '#4A90D9', fontWeight: '600' },
  settingsCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#2C2C2E' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 15 },
  settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  settingInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  settingIcon: { fontSize: 24, marginRight: 14 },
  settingTitle: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 2 },
  settingValue: { fontSize: 13, color: '#A0A0A0' },
  settingDescription: { fontSize: 12, color: '#888' },
  chevron: { fontSize: 24, color: '#555', fontWeight: '300' },
  dexcomActionButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#2A1A1A', borderWidth: 1, borderColor: '#3A2020' },
  dexcomDisconnectText: { fontSize: 13, color: '#FF6B6B', fontWeight: '600' },
  dexcomConnectButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#1A2235', borderWidth: 1, borderColor: '#4A90D9' },
  dexcomConnectText: { fontSize: 13, color: '#4A90D9', fontWeight: '600' },
  logoutButton: { backgroundColor: '#2A1A1A', borderRadius: 12, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#3A2020' },
  logoutIcon: { fontSize: 20, marginRight: 10 },
  logoutText: { fontSize: 16, fontWeight: 'bold', color: '#FF6B6B' },
  deleteAccountButton: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#2C2C2E' },
  deleteAccountIcon: { fontSize: 18, marginRight: 10 },
  deleteAccountText: { fontSize: 14, fontWeight: '600', color: '#888' },
  disclaimerCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 30, borderWidth: 1, borderColor: '#2C2C2E' },
  disclaimerIcon: { fontSize: 20, marginRight: 10, marginTop: 2 },
  disclaimerText: { fontSize: 12, color: '#888', flex: 1, lineHeight: 18 },
  nameInput: { flex: 1, backgroundColor: '#2C2C2E', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, color: '#fff', borderWidth: 1, borderColor: '#4A90D9' },
  nameSaveBtn: { backgroundColor: '#4A90D9', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 8 },
  nameSaveBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  nameCancelBtn: { paddingHorizontal: 10, paddingVertical: 6, marginLeft: 4 },
  nameCancelBtnText: { color: '#888', fontSize: 13 },
  thresholdInput: { backgroundColor: '#2C2C2E', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 18, fontWeight: 'bold', color: '#fff', textAlign: 'center', width: 70, borderWidth: 1, borderColor: '#4A90D9' },
});
