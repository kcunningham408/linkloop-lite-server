import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Clipboard, Linking, Modal, Platform, RefreshControl, ScrollView, Share, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { alertsAPI, circleAPI } from '../services/api';

// TODO: Replace with actual App Store / Play Store URLs when live
const APP_DOWNLOAD_URL = 'https://apps.apple.com/app/linkloop/id6746382498'; // App Store listing

const RELATIONSHIPS = [
  { value: 'parent', label: 'Parent', emoji: '👨‍👩‍👧' },
  { value: 'sibling', label: 'Sibling', emoji: '🧑‍🤝‍🧑' },
  { value: 'friend', label: 'Friend', emoji: '🤝' },
  { value: 'school_nurse', label: 'School Nurse', emoji: '👩‍⚕️' },
  { value: 'coach', label: 'Coach', emoji: '🏃' },
  { value: 't1d_buddy', label: 'T1D Buddy', emoji: '💙' },
  { value: 'other', label: 'Other', emoji: '👤' },
];

export default function CareCircleScreen() {
  const { user, updateUser, checkAuth } = useAuth();
  const isMember = user?.role === 'member';
  const navigation = useNavigation();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newRelationship, setNewRelationship] = useState('parent');
  const [saving, setSaving] = useState(false);
  const [activeAlertCount, setActiveAlertCount] = useState(0);
  const [roster, setRoster] = useState([]);

  // Real sharing settings — seeded from the server-stored user settings
  const [shareGlucose, setShareGlucose] = useState(user?.settings?.shareRealTimeGlucose ?? true);
  const [shareLowAlerts, setShareLowAlerts] = useState(user?.settings?.lowAlerts ?? true);
  const [shareHighAlerts, setShareHighAlerts] = useState(user?.settings?.highAlerts ?? true);

  const handleToggleSetting = async (key, currentVal, setter) => {
    const newVal = !currentVal;
    setter(newVal); // optimistic update
    try {
      await updateUser({ settings: { [key]: newVal } });
    } catch (err) {
      setter(currentVal); // revert on failure
      Alert.alert('Error', 'Could not save setting. Please try again.');
    }
  };

  const loadMembers = useCallback(async () => {
    try {
      if (isMember) {
        // Members see the roster instead
        const rosterData = await circleAPI.getRoster();
        setRoster(rosterData);
      } else {
        const data = await circleAPI.getMembers();
        setMembers(data);
      }
    } catch (err) {
      console.log('Load circle error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isMember]);

  const loadBadges = useCallback(async () => {
    try {
      const active = await alertsAPI.getActiveAlerts().catch(() => ({ activeCount: 0 }));
      setActiveAlertCount(active.activeCount || 0);
    } catch (err) {
      console.log('Load badges error:', err);
    }
  }, []);

  useEffect(() => { loadMembers(); loadBadges(); }, [loadMembers, loadBadges]);
  const onRefresh = () => { setRefreshing(true); loadMembers(); loadBadges(); };

  const handleCreateInvite = async () => {
    if (!newName.trim()) { Alert.alert('Error', 'Please enter a name'); return; }
    setSaving(true);
    try {
      const rel = RELATIONSHIPS.find(r => r.value === newRelationship);
      const data = await circleAPI.createInvite(newName.trim(), rel?.emoji || '👤', newRelationship, { viewGlucose: true, receiveLowAlerts: true, receiveHighAlerts: false });
      setInviteCode(data.inviteCode);
      setShowInviteModal(false);
      setShowCodeModal(true);
      setNewName('');
      loadMembers();
    } catch (err) { Alert.alert('Error', err.message || 'Could not create invite'); }
    finally { setSaving(false); }
  };

  const handleJoinCircle = async () => {
    if (!joinCode.trim()) { Alert.alert('Error', 'Please enter an invite code'); return; }
    setSaving(true);
    try {
      const data = await circleAPI.joinCircle(joinCode.trim());
      // Refresh user profile so role + linkedOwnerId update immediately in the app
      await checkAuth();
      Alert.alert('Success!', 'Joined ' + data.owner.name + "'s Care Circle");
      setShowJoinModal(false);
      setJoinCode('');
      loadMembers();
    } catch (err) { Alert.alert('Error', err.message || 'Invalid invite code'); }
    finally { setSaving(false); }
  };

  const getInviteMessage = () => {
    const userName = user?.name || 'Someone';
    return `Hey! ${userName} invited you to join their Care Circle on LinkLoop — a T1D wellness app that keeps your support team in the loop.\n\n` +
      `📲 Download LinkLoop:\n${APP_DOWNLOAD_URL}\n\n` +
      `🔑 Your invite code: ${inviteCode}\n\n` +
      `Open the app → Care Circle → "Join a Circle" → enter the code above.`;
  };

  const handleShareCode = async () => {
    try {
      await Share.share({
        message: getInviteMessage(),
      });
    } catch (err) {}
  };

  const handleTextInvite = async () => {
    const message = getInviteMessage();
    const encoded = encodeURIComponent(message);
    // iOS uses &body=, Android uses ?body=
    const separator = Platform.OS === 'ios' ? '&' : '?';
    const smsUrl = `sms:${separator}body=${encoded}`;
    try {
      const supported = await Linking.canOpenURL(smsUrl);
      if (supported) {
        await Linking.openURL(smsUrl);
      } else {
        // Fallback to Share sheet if SMS isn't available
        handleShareCode();
      }
    } catch (err) {
      // Fallback to Share sheet
      handleShareCode();
    }
  };

  const handleTogglePermission = async (memberId, permKey, currentVal) => {
    try { await circleAPI.updateMember(memberId, { permissions: { [permKey]: !currentVal } }); loadMembers(); }
    catch (err) { Alert.alert('Error', 'Could not update permissions'); }
  };

  const handleRemoveMember = (memberId, name) => {
    Alert.alert(
      'Remove from Circle',
      `Are you sure you want to remove ${name} from your Care Circle?\n\nThey will lose access to your glucose data, alerts, and group chat.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove ' + name,
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirm Removal',
              `This will immediately remove ${name}. They can only rejoin with a new invite code.`,
              [
                { text: 'Keep in Circle', style: 'cancel' },
                {
                  text: 'Yes, Remove',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await circleAPI.removeMember(memberId);
                      loadMembers();
                      Alert.alert('Done', `${name} has been removed from your Care Circle.`);
                    } catch (err) {
                      Alert.alert('Error', 'Could not remove member. Please try again.');
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

  const activeMembers = members.filter(m => m.status === 'active');
  const pendingMembers = members.filter(m => m.status === 'pending');

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4A90D9']} />}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{isMember ? 'Care Circle' : 'Your Care Circle'}</Text>
        <Text style={styles.headerSubtitle}>
          {isMember
            ? 'You\'re part of a Care Circle — here\'s who else is in the loop'
            : 'Share your glucose data and updates with trusted caregivers'}
        </Text>
      </View>

      <View style={styles.content}>
        {/* Notifications Banner */}
        <TouchableOpacity
          style={[styles.alertBanner, activeAlertCount > 0 && styles.alertBannerActive]}
          onPress={() => navigation.navigate('Alerts')}
        >
          <Text style={styles.alertBannerIcon}>{activeAlertCount > 0 ? '🔔' : '✅'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.alertBannerTitle}>
              {activeAlertCount > 0 ? `${activeAlertCount} New Notification${activeAlertCount > 1 ? 's' : ''}` : 'No New Notifications'}
            </Text>
            <Text style={styles.alertBannerSub}>
              {activeAlertCount > 0 ? 'Tap to view & acknowledge' : 'View notification history'}
            </Text>
          </View>
          <Text style={styles.alertBannerArrow}>›</Text>
        </TouchableOpacity>

        {/* Add Member — compact inline button at the top */}
        {!isMember && (
          <TouchableOpacity style={styles.addMemberRow} onPress={() => setShowInviteModal(true)}>
            <View style={styles.addMemberIcon}>
              <Text style={{ fontSize: 18, color: '#fff' }}>+</Text>
            </View>
            <Text style={styles.addMemberText}>Add Circle Member</Text>
            <Text style={styles.addMemberChevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* Members Section — warrior only (members see the roster below) */}
        {!isMember && (
        <View style={styles.membersSection}>
          <Text style={styles.sectionTitle}>Circle Members ({activeMembers.length})</Text>

          {loading ? (
            <ActivityIndicator size="large" color="#4A90D9" style={{ paddingVertical: 40 }} />
          ) : activeMembers.length === 0 && pendingMembers.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>👥</Text>
              <Text style={styles.emptyTitle}>No circle members yet</Text>
              <Text style={styles.emptyText}>Invite family, friends, or caregivers to stay connected.</Text>
            </View>
          ) : (
            activeMembers.map((member) => (
              <View key={member._id} style={styles.memberCard}>
                <View style={styles.memberCardTop}>
                  <Text style={styles.memberEmoji}>{member.memberEmoji}</Text>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{member.memberName}</Text>
                    <Text style={styles.memberRelationship}>
                      {RELATIONSHIPS.find(r => r.value === member.relationship)?.label || 'Circle Member'}
                    </Text>
                  </View>
                  <View style={styles.memberToggles}>
                    <View style={styles.toggleRow}>
                      <Text style={styles.toggleLabel}>Glucose</Text>
                      <Switch
                        value={member.permissions?.viewGlucose ?? true}
                        onValueChange={() => handleTogglePermission(member._id, 'viewGlucose', member.permissions?.viewGlucose)}
                        trackColor={{ false: '#ccc', true: '#4A90D9' }}
                        thumbColor="#fff"
                      />
                    </View>
                    <View style={styles.toggleRow}>
                      <Text style={styles.toggleLabel}>Low Alert</Text>
                      <Switch
                        value={member.permissions?.receiveLowAlerts ?? true}
                        onValueChange={() => handleTogglePermission(member._id, 'receiveLowAlerts', member.permissions?.receiveLowAlerts)}
                        trackColor={{ false: '#ccc', true: '#FF6B6B' }}
                        thumbColor="#fff"
                      />
                    </View>
                  </View>
                </View>
                <View style={styles.memberCardActions}>
                  <TouchableOpacity
                    style={styles.messageButton}
                    onPress={() => navigation.navigate('Chat', {
                      circleId: member._id,
                      memberName: member.memberName,
                      memberEmoji: member.memberEmoji || '\uD83D\uDC64',
                      relationship: member.relationship,
                    })}
                  >
                    <Text style={styles.messageButtonText}>{'\uD83D\uDCAC'} Message</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveMember(member._id, member.memberName)}
                  >
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {pendingMembers.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Pending ({pendingMembers.length})</Text>
              {pendingMembers.map((member) => (
                <View key={member._id} style={styles.pendingCard}>
                  <Text style={styles.memberEmoji}>{member.memberEmoji}</Text>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{member.memberName}</Text>
                    <Text style={{ fontSize: 13, color: '#FFA500', fontStyle: 'italic', marginBottom: 6 }}>Waiting to join…</Text>
                    {member.inviteCode ? (
                      <TouchableOpacity
                        style={styles.copyCodeButton}
                        onPress={() => {
                          Clipboard.setString(member.inviteCode);
                          Alert.alert('Copied!', `Code ${member.inviteCode} copied to clipboard.`);
                        }}
                      >
                        <Text style={styles.copyCodeText}>📋 {member.inviteCode}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                    onPress={() => handleRemoveMember(member._id, member.memberName)}
                  >
                    <Text style={{ fontSize: 13, color: '#FF6B6B' }}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}
        </View>
        )}

        {/* Sharing Settings — warriors only, real values from DB */}
        {!isMember && (
          <View style={styles.sharingSettings}>
            <Text style={styles.sectionTitle}>Sharing Settings</Text>

            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Share Real-Time Glucose</Text>
                <Text style={styles.settingDescription}>Allow circle members to see your current glucose reading</Text>
              </View>
              <Switch
                value={shareGlucose}
                onValueChange={() => handleToggleSetting('shareRealTimeGlucose', shareGlucose, setShareGlucose)}
                trackColor={{ false: '#ccc', true: '#4A90D9' }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Low Glucose Alerts</Text>
                <Text style={styles.settingDescription}>Notify circle when glucose drops below {user?.settings?.lowThreshold ?? 70} mg/dL</Text>
              </View>
              <Switch
                value={shareLowAlerts}
                onValueChange={() => handleToggleSetting('lowAlerts', shareLowAlerts, setShareLowAlerts)}
                trackColor={{ false: '#ccc', true: '#FF6B6B' }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>High Glucose Alerts</Text>
                <Text style={styles.settingDescription}>Notify circle when glucose goes above {user?.settings?.highThreshold ?? 180} mg/dL</Text>
              </View>
              <Switch
                value={shareHighAlerts}
                onValueChange={() => handleToggleSetting('highAlerts', shareHighAlerts, setShareHighAlerts)}
                trackColor={{ false: '#ccc', true: '#FFA500' }}
                thumbColor="#fff"
              />
            </View>
          </View>
        )}

        {/* Quick Actions — Join is only for members who are NOT yet linked */}
        {isMember && !user?.linkedOwnerId && (
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.actionButtonPrimary} onPress={() => setShowJoinModal(true)}>
              <Text style={styles.actionButtonIcon}>🔗</Text>
              <Text style={styles.actionButtonPrimaryText}>Join a Circle</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Circle Roster — Members see who else is in the circle */}
        {isMember && user?.linkedOwnerId && (
          <View style={styles.membersSection}>
            <Text style={styles.sectionTitle}>Circle Members ({roster.length})</Text>
            {loading ? (
              <ActivityIndicator size="large" color="#4A90D9" style={{ paddingVertical: 40 }} />
            ) : roster.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>👥</Text>
                <Text style={styles.emptyTitle}>No other members</Text>
                <Text style={styles.emptyText}>You're the only member in this Care Circle right now.</Text>
              </View>
            ) : (
              roster.map((member, idx) => (
                <View key={idx} style={[styles.memberCard, member.isYou && { borderColor: '#4A90D9' }]}>
                  <View style={styles.memberCardTop}>
                    <Text style={styles.memberEmoji}>{member.emoji || '👤'}</Text>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>
                        {member.name}{member.isYou ? ' (You)' : ''}
                      </Text>
                      <Text style={styles.memberRelationship}>
                        {RELATIONSHIPS.find(r => r.value === member.relationship)?.label || 'Circle Member'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoCardIcon}>🛡️</Text>
          <Text style={styles.infoCardTitle}>Stay Connected</Text>
          <Text style={styles.infoCardDescription}>Your Care Circle helps you share updates with the people who care about you most.</Text>
        </View>
      </View>

      {/* Create Invite Modal */}
      <Modal visible={showInviteModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Invite to Care Circle</Text>
            <Text style={styles.inputLabel}>Their Name</Text>
            <TextInput style={styles.input} placeholder="e.g. Mom, Dr. Smith" value={newName} onChangeText={setNewName} />
            <Text style={styles.inputLabel}>Relationship</Text>
            <View style={styles.relGrid}>
              {RELATIONSHIPS.map(r => (
                <TouchableOpacity key={r.value} style={[styles.relChip, newRelationship === r.value && styles.relChipActive]} onPress={() => setNewRelationship(r.value)}>
                  <Text style={styles.relEmoji}>{r.emoji}</Text>
                  <Text style={[styles.relLabel, newRelationship === r.value && styles.relLabelActive]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowInviteModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleCreateInvite} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Create Invite</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Invite Code Display */}
      <Modal visible={showCodeModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🎉 Invite Created!</Text>
            <Text style={styles.codeLabel}>Share this code with your circle member:</Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{inviteCode}</Text>
            </View>

            <TouchableOpacity style={styles.textInviteButton} onPress={handleTextInvite}>
              <Text style={styles.textInviteIcon}>📱</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.textInviteTitle}>Text Invite</Text>
                <Text style={styles.textInviteSubtitle}>Send download link + code via text message</Text>
              </View>
              <Text style={styles.textInviteArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareButton} onPress={handleShareCode}>
              <Text style={styles.shareButtonText}>📤 Share Another Way</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.doneButton} onPress={() => setShowCodeModal(false)}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Join Circle Modal */}
      <Modal visible={showJoinModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Join a Care Circle</Text>
            <Text style={styles.inputLabel}>Enter Invite Code</Text>
            <TextInput style={[styles.input, styles.codeInput]} placeholder="e.g. A1B2C3D4" value={joinCode} onChangeText={setJoinCode} autoCapitalize="characters" maxLength={8} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowJoinModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleJoinCircle} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Join</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111111' },
  header: { backgroundColor: '#1C1C1E', padding: 20, paddingTop: 30 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  headerSubtitle: { fontSize: 14, color: '#A0A0A0' },
  content: { padding: 20 },
  alertBanner: { backgroundColor: '#1C1C1E', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#2C2C2E' },
  alertBannerActive: { borderColor: '#FF6B6B', borderWidth: 2, backgroundColor: '#2A1A1A' },
  alertBannerIcon: { fontSize: 28, marginRight: 12 },
  alertBannerTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  alertBannerSub: { fontSize: 12, color: '#888', marginTop: 2 },
  alertBannerArrow: { fontSize: 28, color: '#555', fontWeight: '300' },
  membersSection: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 15 },
  emptyState: { alignItems: 'center', paddingVertical: 30 },
  emptyEmoji: { fontSize: 50, marginBottom: 10 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center' },
  memberCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 15, marginBottom: 12, borderWidth: 1, borderColor: '#2C2C2E' },
  memberCardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  memberEmoji: { fontSize: 36, marginRight: 12, marginTop: 2 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 17, fontWeight: '600', color: '#fff', marginBottom: 3 },
  memberRelationship: { fontSize: 13, color: '#A0A0A0' },
  memberCardActions: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#2C2C2E', gap: 10 },
  messageButton: { flex: 1, backgroundColor: '#1A2C4A', borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#4A90D9' },
  messageButtonText: { fontSize: 13, color: '#4A90D9', fontWeight: '600' },
  removeButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#2A1A1A', borderWidth: 1, borderColor: '#3A2020' },
  removeButtonText: { fontSize: 12, color: '#FF6B6B', fontWeight: '500' },
  memberToggles: { alignItems: 'flex-end', gap: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleLabel: { fontSize: 11, color: '#A0A0A0' },
  pendingCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 15, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderStyle: 'dashed', borderColor: '#FFA500', opacity: 0.85 },
  copyCodeButton: { backgroundColor: '#2C2C2E', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#4A90D9' },
  copyCodeText: { fontSize: 13, color: '#4A90D9', fontWeight: '600', letterSpacing: 1 },
  addMemberRow: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#2C2C2E' },
  addMemberIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#4A90D9', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  addMemberText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#4A90D9' },
  addMemberChevron: { fontSize: 24, color: '#4A90D9', fontWeight: '300' },
  sharingSettings: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#2C2C2E' },
  settingItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  settingInfo: { flex: 1, marginRight: 15 },
  settingTitle: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 4 },
  settingDescription: { fontSize: 12, color: '#A0A0A0', lineHeight: 16 },
  quickActions: { marginBottom: 20 },
  actionButtonPrimary: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#4A90D9' },
  actionButtonIcon: { fontSize: 18, marginRight: 8 },
  actionButtonPrimaryText: { color: '#4A90D9', fontSize: 16, fontWeight: 'bold' },
  infoCard: { backgroundColor: '#1A2235', borderRadius: 12, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#2A3A50', marginBottom: 20 },
  infoCardIcon: { fontSize: 40, marginBottom: 10 },
  infoCardTitle: { fontSize: 18, fontWeight: 'bold', color: '#4A90D9', marginBottom: 8 },
  infoCardDescription: { fontSize: 14, color: '#A0A0A0', textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 25, paddingBottom: 40 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 20, textAlign: 'center' },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#E0E0E0', marginBottom: 8, marginTop: 10 },
  input: { backgroundColor: '#2C2C2E', borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1, borderColor: '#3A3A3C', color: '#fff' },
  codeInput: { fontSize: 24, textAlign: 'center', letterSpacing: 4, fontWeight: 'bold' },
  relGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  relChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#2C2C2E', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#3A3A3C' },
  relChipActive: { backgroundColor: '#4A90D9', borderColor: '#4A90D9' },
  relEmoji: { fontSize: 16, marginRight: 6 },
  relLabel: { fontSize: 13, color: '#A0A0A0' },
  relLabelActive: { color: '#fff', fontWeight: '600' },
  modalButtons: { flexDirection: 'row', marginTop: 25, gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#2C2C2E', alignItems: 'center' },
  cancelButtonText: { fontSize: 16, color: '#A0A0A0', fontWeight: '600' },
  saveButton: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#4A90D9', alignItems: 'center' },
  saveButtonText: { fontSize: 16, color: '#fff', fontWeight: 'bold' },
  codeLabel: { fontSize: 14, color: '#A0A0A0', textAlign: 'center', marginBottom: 10 },
  codeBox: { backgroundColor: '#2C2C2E', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 20, borderWidth: 2, borderColor: '#4A90D9' },
  codeText: { fontSize: 32, fontWeight: 'bold', color: '#4A90D9', letterSpacing: 6 },
  textInviteButton: { backgroundColor: '#4A90D9', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  textInviteIcon: { fontSize: 28, marginRight: 12 },
  textInviteTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  textInviteSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  textInviteArrow: { fontSize: 28, color: 'rgba(255,255,255,0.6)', fontWeight: '300' },
  shareButton: { backgroundColor: '#2C2C2E', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 12 },
  shareButtonText: { color: '#A0A0A0', fontSize: 16, fontWeight: '600' },
  doneButton: { paddingVertical: 14, alignItems: 'center' },
  doneButtonText: { fontSize: 16, color: '#A0A0A0' },
});
