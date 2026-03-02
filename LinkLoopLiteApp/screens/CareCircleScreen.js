import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Clipboard, Linking, Modal, Platform, RefreshControl, ScrollView, Share, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import GlassCard from '../components/GlassCard';
import ScreenHeader from '../components/ScreenHeader';
import { FadeIn, stagger } from '../config/animations';
import { haptic } from '../config/haptics';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
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
  const { getAccent } = useTheme();
  const isMember = user?.role === 'member';
  const accent = getAccent(isMember);
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
  const onRefresh = () => { haptic.light(); setRefreshing(true); loadMembers(); loadBadges(); };

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
    haptic.medium();
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
    haptic.warning();
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
      contentContainerStyle={{ paddingBottom: 90 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[accent]} />}
    >
      <ScreenHeader
        title={isMember ? 'Care Circle' : 'Your Care Circle'}
        subtitle={isMember
          ? "You're part of a Care Circle — here's who else is in the loop"
          : 'Share your glucose data and updates with trusted caregivers'}
      />

      <View style={styles.content}>
        <FadeIn delay={stagger(0, 100)}>
        {/* Notifications Banner */}
        <GlassCard accent={activeAlertCount > 0 ? '#FF6B6B' : accent} glow={activeAlertCount > 0} style={{ marginBottom: 20 }} noPadding>
        <TouchableOpacity
          style={styles.alertBanner}
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
        </GlassCard>

        {/* Add Member — compact inline button at the top */}
        {!isMember && (
          <GlassCard accent={accent} style={{ marginBottom: 20 }} noPadding>
          <TouchableOpacity style={styles.addMemberRow} onPress={() => setShowInviteModal(true)}>
            <View style={[styles.addMemberIcon, { backgroundColor: accent }]}>
              <Text style={{ fontSize: TYPE.xl, color: '#fff' }}>+</Text>
            </View>
            <Text style={[styles.addMemberText, { color: accent }]}>Add Circle Member</Text>
            <Text style={[styles.addMemberChevron, { color: accent }]}>›</Text>
          </TouchableOpacity>
          </GlassCard>
        )}

        {/* Members Section — warrior only (members see the roster below) */}
        {!isMember && (
        <View style={styles.membersSection}>
          <Text style={styles.sectionTitle}>Circle Members ({activeMembers.length})</Text>

          {loading ? (
            <ActivityIndicator size="large" color={accent} style={{ paddingVertical: 40 }} />
          ) : activeMembers.length === 0 && pendingMembers.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>👥</Text>
              <Text style={styles.emptyTitle}>No circle members yet</Text>
              <Text style={styles.emptyText}>Invite family, friends, or caregivers to stay connected.</Text>
            </View>
          ) : (
            activeMembers.map((member) => (
              <GlassCard key={member._id} accent={accent} style={{ marginBottom: 12 }} noPadding>
              <View style={styles.memberCard}>
                <View style={styles.memberCardTop}>
                  <Text style={styles.memberEmoji}>{member.memberEmoji}</Text>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName} numberOfLines={1}>{member.memberName}</Text>
                    <Text style={styles.memberRelationship} numberOfLines={1}>
                      {RELATIONSHIPS.find(r => r.value === member.relationship)?.label || 'Circle Member'}
                    </Text>
                  </View>
                  <View style={styles.memberToggles}>
                    <View style={styles.toggleRow}>
                      <Text style={styles.toggleLabel}>Glucose</Text>
                      <Switch
                        value={member.permissions?.viewGlucose ?? true}
                        onValueChange={() => handleTogglePermission(member._id, 'viewGlucose', member.permissions?.viewGlucose)}
                        trackColor={{ false: '#ccc', true: accent }}
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
                    style={[styles.messageButton, { borderColor: accent }]}
                    onPress={() => navigation.navigate('Chat', {
                      circleId: member._id,
                      memberName: member.memberName,
                      memberEmoji: member.memberEmoji || '\uD83D\uDC64',
                      relationship: member.relationship,
                    })}
                  >
                    <Text style={[styles.messageButtonText, { color: accent }]}>{'\uD83D\uDCAC'} Message</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveMember(member._id, member.memberName)}
                  >
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
              </GlassCard>
            ))
          )}

          {pendingMembers.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Pending ({pendingMembers.length})</Text>
              {pendingMembers.map((member) => (
                <GlassCard key={member._id} accent="#FFA500" style={{ marginBottom: 12, opacity: 0.85 }} noPadding>
                <View style={styles.pendingCard}>
                  <Text style={styles.memberEmoji}>{member.memberEmoji}</Text>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName} numberOfLines={1}>{member.memberName}</Text>
                    <Text style={{ fontSize: 13, color: '#FFA500', fontStyle: 'italic', marginBottom: 6 }}>Waiting to join…</Text>
                    {member.inviteCode ? (
                      <TouchableOpacity
                        style={[styles.copyCodeButton, { borderColor: accent }]}
                        onPress={() => {
                          Clipboard.setString(member.inviteCode);
                          Alert.alert('Copied!', `Code ${member.inviteCode} copied to clipboard.`);
                        }}
                      >
                        <Text style={[styles.copyCodeText, { color: accent }]}>📋 {member.inviteCode}</Text>
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
                </GlassCard>
              ))}
            </>
          )}
        </View>
        )}

        {/* Sharing Settings — warriors only, real values from DB */}
        {!isMember && (
          <GlassCard accent={accent} style={{ marginBottom: 20 }}>
            <Text style={styles.sectionTitle}>Sharing Settings</Text>

            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Share Real-Time Glucose</Text>
                <Text style={styles.settingDescription}>Allow circle members to see your current glucose reading</Text>
              </View>
              <Switch
                value={shareGlucose}
                onValueChange={() => handleToggleSetting('shareRealTimeGlucose', shareGlucose, setShareGlucose)}
                trackColor={{ false: '#ccc', true: accent }}
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
          </GlassCard>
        )}

        {/* Quick Actions — Join is only for members who are NOT yet linked */}
        {isMember && !user?.linkedOwnerId && (
          <View style={{ marginBottom: 20 }}>
            {/* Hero for unlinked members */}
            <GlassCard accent={accent} style={{ marginBottom: 20 }}>
              <View style={styles.memberHero}>
                <Text style={styles.memberHeroEmoji}>🔗</Text>
                <Text style={styles.memberHeroTitle}>Join a Care Circle</Text>
                <Text style={styles.memberHeroSub}>Enter an invite code from a T1D warrior to join their circle and stay in the loop.</Text>
              </View>
            </GlassCard>

            <GlassCard accent={accent} glow noPadding>
            <TouchableOpacity style={styles.actionButtonPrimary} onPress={() => setShowJoinModal(true)}>
              <Text style={styles.actionButtonIcon}>�</Text>
              <Text style={[styles.actionButtonPrimaryText, { color: accent }]}>Enter Invite Code</Text>
            </TouchableOpacity>
            </GlassCard>
          </View>
        )}

        {/* ─── MEMBER VIEW: Linked to a circle ─── */}
        {isMember && user?.linkedOwnerId && (
          <View style={{ marginBottom: 0 }}>

            {/* Warrior Hero Card */}
            {(() => {
              const warrior = roster.find(m => m.isWarrior);
              return warrior ? (
                <GlassCard accent={accent} glow style={{ marginBottom: 20 }}>
                  <View style={styles.warriorHero}>
                    <Text style={styles.warriorHeroEmoji}>{warrior.emoji || '💪'}</Text>
                    <Text style={styles.warriorHeroName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{warrior.name}'s Circle</Text>
                    <Text style={styles.warriorHeroSub}>You're supporting {warrior.name} as part of their T1D care team</Text>
                    <View style={[styles.warriorBadge, { backgroundColor: accent + '20', borderColor: accent + '40' }]}>
                      <Text style={[styles.warriorBadgeText, { color: accent }]}>💪 T1D Warrior</Text>
                    </View>
                  </View>
                </GlassCard>
              ) : null;
            })()}

            {/* Circle Roster */}
            <View style={styles.membersSection}>
              <Text style={styles.sectionTitle}>
                Circle Team ({roster.filter(m => !m.isWarrior).length})
              </Text>
              {loading ? (
                <ActivityIndicator size="large" color={accent} style={{ paddingVertical: 40 }} />
              ) : roster.filter(m => !m.isWarrior).length === 0 ? (
                <GlassCard accent={accent} style={{ marginBottom: 12 }}>
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyEmoji}>👥</Text>
                    <Text style={styles.emptyTitle}>Just you for now</Text>
                    <Text style={styles.emptyText}>You're the only member in this Care Circle right now. Others can join with an invite code.</Text>
                  </View>
                </GlassCard>
              ) : (
                roster.filter(m => !m.isWarrior).map((member, idx) => (
                  <GlassCard key={idx} accent={member.isYou ? accent : accent} glow={member.isYou} style={{ marginBottom: 12 }} noPadding>
                  <View style={styles.rosterCard}>
                    <Text style={styles.rosterEmoji}>{member.emoji || '👤'}</Text>
                    <View style={styles.rosterInfo}>
                      <View style={styles.rosterNameRow}>
                        <Text style={styles.rosterName} numberOfLines={1}>
                          {member.name}
                        </Text>
                        {member.isYou && (
                          <View style={[styles.youBadge, { backgroundColor: accent + '25', borderColor: accent + '50' }]}>
                            <Text style={[styles.youBadgeText, { color: accent }]}>You</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.rosterRelationship}>
                        {RELATIONSHIPS.find(r => r.value === member.relationship)?.emoji || '👤'}{' '}
                        {RELATIONSHIPS.find(r => r.value === member.relationship)?.label || 'Circle Member'}
                      </Text>
                    </View>
                  </View>
                  </GlassCard>
                ))
              )}
            </View>

            {/* Group Chat Button */}
            <GlassCard accent={accent} style={{ marginBottom: 20 }} noPadding>
              <TouchableOpacity
                style={styles.groupChatButton}
                onPress={() => navigation.navigate('Chat', {
                  circleId: 'group',
                  memberName: 'Group Chat',
                  memberEmoji: '💬',
                  relationship: 'group',
                })}
              >
                <Text style={styles.groupChatEmoji}>💬</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupChatTitle}>Circle Group Chat</Text>
                  <Text style={styles.groupChatSub}>Message everyone in the circle</Text>
                </View>
                <Text style={[styles.groupChatArrow, { color: accent }]}>›</Text>
              </TouchableOpacity>
            </GlassCard>
          </View>
        )}

        {/* Info Card */}
        <GlassCard accent={accent} style={{ marginBottom: 20 }}>
          <View style={styles.infoCardInner}>
            <Text style={styles.infoCardIcon}>🛡️</Text>
            <Text style={[styles.infoCardTitle, { color: accent }]}>Stay Connected</Text>
            <Text style={styles.infoCardDescription}>Your Care Circle helps you share updates with the people who care about you most.</Text>
          </View>
        </GlassCard>
        </FadeIn>
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
                <TouchableOpacity key={r.value} style={[styles.relChip, newRelationship === r.value && [styles.relChipActive, { backgroundColor: accent, borderColor: accent }]]} onPress={() => setNewRelationship(r.value)}>
                  <Text style={styles.relEmoji}>{r.emoji}</Text>
                  <Text style={[styles.relLabel, newRelationship === r.value && styles.relLabelActive]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowInviteModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveButton, { backgroundColor: accent }]} onPress={handleCreateInvite} disabled={saving}>
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
            <View style={[styles.codeBox, { borderColor: accent }]}>
              <Text style={[styles.codeText, { color: accent }]}>{inviteCode}</Text>
            </View>

            <TouchableOpacity style={[styles.textInviteButton, { backgroundColor: accent }]} onPress={handleTextInvite}>
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
              <TouchableOpacity style={[styles.saveButton, { backgroundColor: accent }]} onPress={handleJoinCircle} disabled={saving}>
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
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  content: { padding: 20 },

  /* Alert Banner — now inside GlassCard so strip bg/border/shadow */
  alertBanner: { padding: 16, flexDirection: 'row', alignItems: 'center' },
  alertBannerIcon: { fontSize: TYPE.h2, marginRight: 12 },
  alertBannerTitle: { fontSize: 15, fontWeight: TYPE.bold, color: '#fff' },
  alertBannerSub: { fontSize: TYPE.sm, color: '#888', marginTop: 2 },
  alertBannerArrow: { fontSize: TYPE.h2, color: '#555', fontWeight: '300' },

  /* Members */
  membersSection: { marginBottom: 20 },
  sectionTitle: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 15 },
  emptyState: { alignItems: 'center', paddingVertical: 30 },
  emptyEmoji: { fontSize: 50, marginBottom: 10 },
  emptyTitle: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 6 },
  emptyText: { fontSize: TYPE.md, color: '#888', textAlign: 'center' },

  /* Member Card — inner content; GlassCard handles outer chrome */
  memberCard: { padding: 15 },
  memberCardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  memberEmoji: { fontSize: 36, marginRight: 12, marginTop: 2 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 17, fontWeight: TYPE.semibold, color: '#fff', marginBottom: 3 },
  memberRelationship: { fontSize: 13, color: '#A0A0A0' },
  memberCardActions: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', gap: 10 },
  messageButton: { flex: 1, backgroundColor: 'rgba(74,144,217,0.15)', borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1 },
  messageButtonText: { fontSize: 13, fontWeight: TYPE.semibold },
  removeButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(255,107,107,0.12)', borderWidth: 1, borderColor: 'rgba(255,107,107,0.25)' },
  removeButtonText: { fontSize: TYPE.sm, color: '#FF6B6B', fontWeight: TYPE.medium },
  memberToggles: { alignItems: 'flex-end', gap: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleLabel: { fontSize: 11, color: '#A0A0A0' },

  /* Pending Card — inner content */
  pendingCard: { padding: 15, flexDirection: 'row', alignItems: 'flex-start' },
  copyCodeButton: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', borderWidth: 1 },
  copyCodeText: { fontSize: 13, fontWeight: TYPE.semibold, letterSpacing: 1 },

  /* Add Member Row — inner content */
  addMemberRow: { padding: 14, flexDirection: 'row', alignItems: 'center' },
  addMemberIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  addMemberText: { flex: 1, fontSize: 15, fontWeight: TYPE.semibold },
  addMemberChevron: { fontSize: TYPE.h3, fontWeight: '300' },

  /* Setting Items — inside GlassCard now */
  settingItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  settingInfo: { flex: 1, marginRight: 15 },
  settingTitle: { fontSize: 15, fontWeight: TYPE.semibold, color: '#fff', marginBottom: 4 },
  settingDescription: { fontSize: TYPE.sm, color: '#A0A0A0', lineHeight: 16 },

  /* Quick Actions */
  quickActions: { marginBottom: 20 },
  actionButtonPrimary: { borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  actionButtonIcon: { fontSize: TYPE.xl, marginRight: 8 },
  actionButtonPrimaryText: { fontSize: TYPE.lg, fontWeight: TYPE.bold },

  /* Info Card — inner content */
  infoCardInner: { alignItems: 'center' },
  infoCardIcon: { fontSize: 40, marginBottom: 10 },
  infoCardTitle: { fontSize: TYPE.xl, fontWeight: TYPE.bold, marginBottom: 8 },
  infoCardDescription: { fontSize: TYPE.md, color: '#A0A0A0', textAlign: 'center' },

  /* Modals — darker glass feel */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#12121A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 25, paddingBottom: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderBottomWidth: 0 },
  modalTitle: { fontSize: TYPE.xxl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 20, textAlign: 'center' },
  inputLabel: { fontSize: TYPE.md, fontWeight: TYPE.semibold, color: '#E0E0E0', marginBottom: 8, marginTop: 10 },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 14, fontSize: TYPE.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', color: '#fff' },
  codeInput: { fontSize: TYPE.h3, textAlign: 'center', letterSpacing: 4, fontWeight: TYPE.bold },
  relGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  relChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  relChipActive: {},
  relEmoji: { fontSize: TYPE.lg, marginRight: 6 },
  relLabel: { fontSize: 13, color: '#A0A0A0' },
  relLabelActive: { color: '#fff', fontWeight: TYPE.semibold },
  modalButtons: { flexDirection: 'row', marginTop: 25, gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center' },
  cancelButtonText: { fontSize: TYPE.lg, color: '#A0A0A0', fontWeight: TYPE.semibold },
  saveButton: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  saveButtonText: { fontSize: TYPE.lg, color: '#fff', fontWeight: TYPE.bold },
  codeLabel: { fontSize: TYPE.md, color: '#A0A0A0', textAlign: 'center', marginBottom: 10 },
  codeBox: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 20, borderWidth: 2 },
  codeText: { fontSize: TYPE.h1, fontWeight: TYPE.bold, letterSpacing: 6 },
  textInviteButton: { borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  textInviteIcon: { fontSize: TYPE.h2, marginRight: 12 },
  textInviteTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff' },
  textInviteSubtitle: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  textInviteArrow: { fontSize: TYPE.h2, color: 'rgba(255,255,255,0.6)', fontWeight: '300' },
  shareButton: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 12 },
  shareButtonText: { color: '#A0A0A0', fontSize: TYPE.lg, fontWeight: TYPE.semibold },
  doneButton: { paddingVertical: 14, alignItems: 'center' },
  doneButtonText: { fontSize: TYPE.lg, color: '#A0A0A0' },

  /* ─── Member View ─── */

  /* Unlinked hero */
  memberHero: { alignItems: 'center', paddingVertical: 10 },
  memberHeroEmoji: { fontSize: 56, marginBottom: 12 },
  memberHeroTitle: { fontSize: TYPE.h3, fontWeight: TYPE.bold, color: '#fff', marginBottom: 8 },
  memberHeroSub: { fontSize: TYPE.md, color: '#A0A0A0', textAlign: 'center', lineHeight: 20 },

  /* Warrior hero card */
  warriorHero: { alignItems: 'center', paddingVertical: 8 },
  warriorHeroEmoji: { fontSize: 60, marginBottom: 10 },
  warriorHeroName: { fontSize: TYPE.h3, fontWeight: TYPE.bold, color: '#fff', marginBottom: 6 },
  warriorHeroSub: { fontSize: TYPE.md, color: '#A0A0A0', textAlign: 'center', lineHeight: 20, marginBottom: 12 },
  warriorBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  warriorBadgeText: { fontSize: TYPE.sm, fontWeight: TYPE.semibold },

  /* Roster cards */
  rosterCard: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  rosterEmoji: { fontSize: 36, marginRight: 14 },
  rosterInfo: { flex: 1 },
  rosterNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  rosterName: { fontSize: 17, fontWeight: TYPE.semibold, color: '#fff' },
  rosterRelationship: { fontSize: 13, color: '#A0A0A0' },
  youBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  youBadgeText: { fontSize: 11, fontWeight: TYPE.bold },

  /* Group chat button */
  groupChatButton: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  groupChatEmoji: { fontSize: 32, marginRight: 14 },
  groupChatTitle: { fontSize: 16, fontWeight: TYPE.semibold, color: '#fff' },
  groupChatSub: { fontSize: TYPE.sm, color: '#A0A0A0', marginTop: 2 },
  groupChatArrow: { fontSize: TYPE.h2, fontWeight: '300' },
});
