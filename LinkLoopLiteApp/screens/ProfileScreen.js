import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn, stagger } from '../config/animations';
import { haptic } from '../config/haptics';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const APP_VERSION = Constants.expoConfig?.version || Constants.manifest?.version || '1.1.0';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user, logout, deleteAccount, updateUser, checkAuth } = useAuth();
  const { palette } = useTheme();
  const isMember = user?.role === 'member';
  const accent = isMember ? palette.member : palette.warrior;
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);
  const [editingWarriorName, setEditingWarriorName] = useState(false);
  const [newWarriorName, setNewWarriorName] = useState(user?.warriorDisplayName || '');
  const [savingWarriorName, setSavingWarriorName] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await checkAuth(); } catch (e) {}
    setRefreshing(false);
  };

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

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  const txtShadow = { textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 90 + insets.bottom, paddingTop: insets.top + 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} colors={[accent]} />}
    >
      {/* ── Page Title ── */}
      <View style={styles.pageHeader}>
        <Text style={[styles.pageTitle, txtShadow]}>Profile</Text>
      </View>

      <View style={styles.content}>

        {/* ── Profile Card ── */}
        <FadeIn delay={stagger(0, 100)}>
          <View style={[styles.profileCard, { borderLeftColor: accent }]}>
            <View style={styles.profileRow}>
              <View style={[styles.avatarCircle, { borderColor: accent + '60' }]}>
                <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase() || '∞'}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={styles.profileName} numberOfLines={1}>{user?.name || 'LinkLoop User'}</Text>
                <Text style={styles.profileEmail} numberOfLines={1}>{user?.email || ''}</Text>
                <View style={[styles.roleBadge, { backgroundColor: accent + '20' }]}>
                  <Text style={[styles.roleBadgeText, { color: accent }]}>
                    {isMember ? '∞ Loop Member' : '💙 T1D Warrior'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Stats row */}
            <View style={styles.statsRow}>
              {memberSince && (
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>JOINED</Text>
                  <Text style={styles.statValue}>{memberSince}</Text>
                </View>
              )}
              <View style={styles.stat}>
                <Text style={styles.statLabel}>ROLE</Text>
                <Text style={styles.statValue}>{isMember ? 'Member' : 'Warrior'}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>VERSION</Text>
                <Text style={styles.statValue}>v{APP_VERSION}</Text>
              </View>
            </View>
          </View>
        </FadeIn>

        {/* ── Account Settings ── */}
        <FadeIn delay={stagger(1, 100)}>
          <View style={styles.opaqueCard}>
            <Text style={styles.cardHeaderTitle}>ACCOUNT</Text>
            <View style={styles.rowDivider} />

            <View style={styles.settingItem}>
              <View style={[styles.settingIcon, { backgroundColor: accent + '20' }]}>
                <Text style={{ fontSize: 18 }}>👤</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Display Name</Text>
                {editingName ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
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

            <View style={styles.rowDivider} />

            <View style={styles.settingItem}>
              <View style={[styles.settingIcon, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                <Text style={{ fontSize: 18 }}>📧</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Email</Text>
                <Text style={styles.settingValue} numberOfLines={1}>{user?.email || 'Not set'}</Text>
              </View>
            </View>

            {isMember && (
              <>
                <View style={styles.rowDivider} />
                <View style={styles.settingItem}>
                  <View style={[styles.settingIcon, { backgroundColor: accent + '20' }]}>
                    <Text style={{ fontSize: 18 }}>💙</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingTitle}>Warrior Name</Text>
                    <Text style={styles.settingDesc}>Customize how your warrior's name appears</Text>
                    {editingWarriorName ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                        <TextInput
                          style={[styles.nameInput, { borderColor: accent }]}
                          value={newWarriorName}
                          onChangeText={setNewWarriorName}
                          placeholder="e.g. Shayla, My Daughter"
                          placeholderTextColor="rgba(255,255,255,0.3)"
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
              </>
            )}
          </View>
        </FadeIn>

        {/* ── Quick Access ── */}
        <FadeIn delay={stagger(2, 100)}>
          <View style={styles.opaqueCard}>
            <Text style={styles.cardHeaderTitle}>QUICK ACCESS</Text>
            <View style={styles.rowDivider} />

            <TouchableOpacity
              style={styles.navRow}
              onPress={() => { haptic.light(); navigation.navigate('WatchSync'); }}
              activeOpacity={0.65}
            >
              <View style={[styles.navIconCircle, { backgroundColor: accent + '20' }]}>
                <Text style={{ fontSize: 20 }}>⌚</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.navRowTitle}>Apple Watch</Text>
                <Text style={styles.navRowSub}>Pair · complications · live glucose</Text>
              </View>
              <Text style={[styles.chevron, { color: accent }]}>›</Text>
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            <TouchableOpacity
              style={styles.navRow}
              onPress={() => { haptic.light(); navigation.navigate('Settings'); }}
              activeOpacity={0.65}
            >
              <View style={[styles.navIconCircle, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                <Text style={{ fontSize: 20 }}>⚙️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.navRowTitle}>Settings</Text>
                <Text style={styles.navRowSub}>Thresholds · notifications · theme</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>
        </FadeIn>

        {/* ── App Info ── */}
        <FadeIn delay={stagger(3, 100)}>
          <View style={styles.opaqueCard}>
            <Text style={styles.cardHeaderTitle}>APP INFO</Text>
            <View style={styles.rowDivider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Version</Text>
              <Text style={styles.infoValue}>{APP_VERSION}</Text>
            </View>

            <View style={styles.rowDivider} />

            <TouchableOpacity style={styles.navRow} onPress={() => Linking.openURL('https://kcunningham408.github.io/vibecmd-pages/linkloop/privacy.html')}>
              <View style={[styles.navIconCircle, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                <Text style={{ fontSize: 18 }}>🔒</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.navRowTitle}>Privacy Policy</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            <TouchableOpacity style={styles.navRow} onPress={() => Linking.openURL('https://kcunningham408.github.io/vibecmd-pages/linkloop/terms.html')}>
              <View style={[styles.navIconCircle, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                <Text style={{ fontSize: 18 }}>📋</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.navRowTitle}>Terms of Service</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            <TouchableOpacity style={styles.navRow} onPress={() => Linking.openURL('https://kcunningham408.github.io/vibecmd-pages/linkloop/support.html')}>
              <View style={[styles.navIconCircle, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                <Text style={{ fontSize: 18 }}>🛟</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.navRowTitle}>Support</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>
        </FadeIn>

        {/* ── Actions ── */}
        <FadeIn delay={stagger(4, 100)}>
          <View style={styles.actionsCard}>
            <TouchableOpacity style={styles.signOutBtn} onPress={handleLogout} activeOpacity={0.7}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.7}>
              <Text style={styles.deleteText}>Delete Account</Text>
            </TouchableOpacity>
          </View>

          {/* Disclaimer */}
          <View style={styles.disclaimerRow}>
            <Text style={styles.disclaimerText}>
              LinkLoop is a personal wellness journal for logging your T1D data. It is not a medical device and does not provide medical advice.
            </Text>
          </View>
        </FadeIn>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 16 },

  /* Page header */
  pageHeader: { paddingHorizontal: 20, paddingBottom: 12 },
  pageTitle: { fontSize: 28, fontWeight: TYPE.bold, color: '#fff' },

  /* Profile card */
  profileCard: {
    backgroundColor: 'rgba(10,18,40,0.94)',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderLeftWidth: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: TYPE.bold, color: '#fff' },
  profileName: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 2 },
  profileEmail: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.5)', marginBottom: 6 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start' },
  roleBadgeText: { fontSize: 12, fontWeight: TYPE.bold },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  stat: { alignItems: 'center', flex: 1 },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: TYPE.bold, letterSpacing: 1, marginBottom: 3 },
  statValue: { fontSize: TYPE.md, color: '#fff', fontWeight: TYPE.semibold },

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

  /* Setting items */
  settingItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  settingIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  settingTitle: { fontSize: 15, fontWeight: TYPE.semibold, color: '#fff', marginBottom: 2 },
  settingValue: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  settingDesc: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.4)', marginBottom: 4 },

  /* Nav rows */
  navRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  navIconCircle: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  navRowTitle: { fontSize: 15, fontWeight: TYPE.semibold, color: '#fff', marginBottom: 2 },
  navRowSub: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.4)' },
  chevron: { fontSize: 22, color: 'rgba(255,255,255,0.3)', fontWeight: '300' },

  /* Info row */
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  infoLabel: { fontSize: 15, fontWeight: TYPE.semibold, color: '#fff' },
  infoValue: { fontSize: 15, color: 'rgba(255,255,255,0.5)' },

  /* Action buttons */
  actionsCard: {
    backgroundColor: 'rgba(10,18,40,0.94)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  signOutBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  signOutText: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff' },
  deleteBtn: {
    backgroundColor: 'rgba(239,68,68,0.18)',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
  },
  deleteText: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#EF4444' },

  /* Disclaimer */
  disclaimerRow: { paddingVertical: 10, paddingHorizontal: 4, marginBottom: 20 },
  disclaimerText: { fontSize: 11, color: 'rgba(255,255,255,0.25)', lineHeight: 16, textAlign: 'center' },

  /* Name editing */
  nameInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: TYPE.md, color: '#fff', borderWidth: 1 },
  nameSaveBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 8 },
  nameSaveBtnText: { color: '#fff', fontSize: 13, fontWeight: TYPE.semibold },
  nameCancelBtn: { paddingHorizontal: 10, paddingVertical: 6, marginLeft: 4 },
  nameCancelBtnText: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
});
