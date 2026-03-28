import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Clipboard, Dimensions, Linking, Modal, Platform, RefreshControl, ScrollView, Share, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn, stagger } from '../config/animations';
import { haptic } from '../config/haptics';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useViewing } from '../context/ViewingContext';
import { alertsAPI, circleAPI } from '../services/api';

const SCREEN_W = Dimensions.get('window').width;

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
  const insets = useSafeAreaInsets();
  const { user, updateUser, checkAuth } = useAuth();
  const { getAccent, getGradient } = useTheme();
  const { isViewingOther, viewingId } = useViewing();
  const isMember = isViewingOther || user?.role === 'member';
  const isLinked = !!(viewingId || user?.linkedOwnerId || user?.activeViewingId);
  const accent = getAccent(isMember);
  const gradient = getGradient(isMember);
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

  // ── Premium avatar circle helper ──
  const AvatarCircle = ({ emoji, size = 52, accentColor = accent }) => (
    <View style={[styles.avatarCircle, { width: size, height: size, borderRadius: size / 2, borderColor: accentColor + '50' }]}>
      <View style={[styles.avatarCircleInner, { width: size - 6, height: size - 6, borderRadius: (size - 6) / 2 }]}>
        <Text style={{ fontSize: size * 0.45 }}>{emoji}</Text>
      </View>
    </View>
  );

  // ── Section header helper ──
  const SectionLabel = ({ label, count }) => (
    <View style={styles.sectionLabelRow}>
      <View style={[styles.sectionDot, { backgroundColor: accent }]} />
      <Text style={styles.sectionLabel}>{label}</Text>
      {count !== undefined && (
        <View style={[styles.countBadge, { backgroundColor: accent + '20', borderColor: accent + '40' }]}>
          <Text style={[styles.countBadgeText, { color: accent }]}>{count}</Text>
        </View>
      )}
    </View>
  );

  const txtShadow = { textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 90 + insets.bottom, paddingTop: insets.top + 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} colors={[accent]} />}
    >
      {/* ── Page Title ── */}
      <View style={styles.pageHeader}>
        <Text style={[styles.pageTitle, txtShadow]}>{isMember ? 'Care Circle' : 'Your Care Circle'}</Text>
        <Text style={[styles.pageSubtitle, txtShadow]}>
          {isMember ? "You're part of a Care Circle" : 'Share with trusted caregivers'}
        </Text>
      </View>

      <View style={styles.content}>

        {/* ═══ WARRIOR VIEW ═══ */}
        {!isMember && (
          <>
            {/* ── Circle Members ── */}
            <FadeIn delay={stagger(0, 100)}>
              {loading ? (
                <ActivityIndicator size="large" color={accent} style={{ paddingVertical: 40 }} />
              ) : activeMembers.length === 0 && pendingMembers.length === 0 ? (
                <View style={styles.opaqueCard}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardHeaderTitle}>CIRCLE MEMBERS</Text>
                    <TouchableOpacity
                      style={[styles.inviteBtnSmall, { backgroundColor: accent }]}
                      onPress={() => setShowInviteModal(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.inviteBtnSmallText}>+ Invite</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.rowDivider} />
                  <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                    <Text style={{ fontSize: 44, marginBottom: 10 }}>👥</Text>
                    <Text style={styles.emptyTitle}>No circle members yet</Text>
                    <Text style={styles.emptyText}>Invite family, friends, or caregivers to stay connected.</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.opaqueCard}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardHeaderTitle}>CIRCLE MEMBERS</Text>
                    <TouchableOpacity
                      style={[styles.inviteBtnSmall, { backgroundColor: accent }]}
                      onPress={() => setShowInviteModal(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.inviteBtnSmallText}>+ Invite</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.rowDivider} />
                  {activeMembers.map((member, idx) => (
                    <View key={member._id}>
                      <View style={styles.memberRow}>
                        <View style={styles.memberRowLeft}>
                          <View style={[styles.avatarCircle, { borderColor: accent + '50' }]}>
                            <Text style={{ fontSize: 22 }}>{member.memberEmoji}</Text>
                          </View>
                          <View style={styles.memberRowInfo}>
                            <Text style={styles.memberRowName} numberOfLines={1}>{member.memberName}</Text>
                            <Text style={styles.memberRowRelation}>
                              {RELATIONSHIPS.find(r => r.value === member.relationship)?.label || 'Circle Member'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.memberRowActions}>
                          <TouchableOpacity
                            style={[styles.iconBtn, { backgroundColor: accent + '20' }]}
                            onPress={() => navigation.navigate('Chat', {
                              circleId: member._id,
                              memberName: member.memberName,
                              memberEmoji: member.memberEmoji || '👤',
                              relationship: member.relationship,
                            })}
                          >
                            <Text style={{ fontSize: 16 }}>💬</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.removeBtn}
                            onPress={() => handleRemoveMember(member._id, member.memberName)}
                          >
                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Compact permission toggles */}
                      <View style={styles.permToggles}>
                        <View style={styles.permToggleItem}>
                          <Text style={styles.permToggleLabel}>Glucose</Text>
                          <Switch
                            value={member.permissions?.viewGlucose ?? true}
                            onValueChange={() => handleTogglePermission(member._id, 'viewGlucose', member.permissions?.viewGlucose)}
                            trackColor={{ false: 'rgba(255,255,255,0.10)', true: accent + '90' }}
                            thumbColor="#fff"
                            style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
                          />
                        </View>
                        <View style={styles.permToggleItem}>
                          <Text style={styles.permToggleLabel}>Alerts</Text>
                          <Switch
                            value={member.permissions?.receiveLowAlerts ?? true}
                            onValueChange={() => handleTogglePermission(member._id, 'receiveLowAlerts', member.permissions?.receiveLowAlerts)}
                            trackColor={{ false: 'rgba(255,255,255,0.10)', true: accent + '90' }}
                            thumbColor="#fff"
                            style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
                          />
                        </View>
                      </View>

                      {idx < activeMembers.length - 1 && <View style={styles.rowDivider} />}
                    </View>
                  ))}

                  {/* Pending members inline */}
                  {pendingMembers.length > 0 && (
                    <>
                      <View style={styles.rowDivider} />
                      <Text style={styles.pendingSectionLabel}>PENDING</Text>
                      {pendingMembers.map((member, idx) => (
                        <View key={member._id}>
                          <View style={styles.memberRow}>
                            <View style={styles.memberRowLeft}>
                              <View style={[styles.avatarCircle, { borderColor: '#FF7B93' + '50' }]}>
                                <Text style={{ fontSize: 22 }}>{member.memberEmoji}</Text>
                              </View>
                              <View style={styles.memberRowInfo}>
                                <Text style={styles.memberRowName} numberOfLines={1}>{member.memberName}</Text>
                                <Text style={[styles.memberRowRelation, { color: '#FF7B93' }]}>⏳ Waiting to join…</Text>
                              </View>
                            </View>
                            <View style={styles.memberRowActions}>
                              {member.inviteCode && (
                                <TouchableOpacity
                                  style={[styles.codeChip, { borderColor: accent + '40' }]}
                                  onPress={() => { Clipboard.setString(member.inviteCode); Alert.alert('Copied!', `Code ${member.inviteCode} copied.`); }}
                                >
                                  <Text style={[styles.codeChipText, { color: accent }]}>📋 {member.inviteCode}</Text>
                                </TouchableOpacity>
                              )}
                              <TouchableOpacity
                                style={styles.removeBtn}
                                onPress={() => handleRemoveMember(member._id, member.memberName)}
                              >
                                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>✕</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                          {idx < pendingMembers.length - 1 && <View style={styles.rowDivider} />}
                        </View>
                      ))}
                    </>
                  )}
                </View>
              )}
            </FadeIn>

            {/* ── Sharing Settings ── */}
            <FadeIn delay={stagger(1, 100)}>
              <View style={styles.opaqueCard}>
                <Text style={styles.cardHeaderTitle}>SHARING SETTINGS</Text>
                <View style={[styles.rowDivider, { marginTop: 8 }]} />
                {[
                  { key: 'shareRealTimeGlucose', title: 'Real-Time Glucose', desc: 'Circle sees your current reading', icon: '📊', value: shareGlucose, setter: setShareGlucose, color: accent },
                  { key: 'lowAlerts', title: 'Low Glucose Alerts', desc: `Notify below ${user?.settings?.lowThreshold ?? 70} mg/dL`, icon: '🔴', value: shareLowAlerts, setter: setShareLowAlerts, color: '#FF6B6B' },
                  { key: 'highAlerts', title: 'High Glucose Alerts', desc: `Notify above ${user?.settings?.highThreshold ?? 180} mg/dL`, icon: '🟠', value: shareHighAlerts, setter: setShareHighAlerts, color: '#FF7B93' },
                ].map((setting, idx) => (
                  <View key={setting.key}>
                    <View style={styles.settingRow}>
                      <View style={[styles.settingIcon, { backgroundColor: setting.color + '20' }]}>
                        <Text style={{ fontSize: 18 }}>{setting.icon}</Text>
                      </View>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={styles.settingTitle}>{setting.title}</Text>
                        <Text style={styles.settingDesc}>{setting.desc}</Text>
                      </View>
                      <Switch
                        value={setting.value}
                        onValueChange={() => handleToggleSetting(setting.key, setting.value, setting.setter)}
                        trackColor={{ false: 'rgba(255,255,255,0.12)', true: setting.color }}
                        thumbColor="#fff"
                        style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                      />
                    </View>
                    {idx < 2 && <View style={styles.rowDivider} />}
                  </View>
                ))}
              </View>
            </FadeIn>
          </>
        )}

        {/* ═══ MEMBER VIEW: Unlinked ═══ */}
        {isMember && !isLinked && (
          <FadeIn delay={stagger(0, 100)}>
            <View style={styles.opaqueCard}>
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <Text style={{ fontSize: 48, marginBottom: 14 }}>🔗</Text>
                <Text style={styles.emptyTitle}>Join a Care Circle</Text>
                <Text style={styles.emptyText}>Enter an invite code from a T1D warrior to join their circle.</Text>
                <TouchableOpacity
                  style={[styles.inviteBtnSmall, { backgroundColor: accent, marginTop: 18, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 12 }]}
                  onPress={() => setShowJoinModal(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.inviteBtnSmallText}>🔑 Enter Invite Code</Text>
                </TouchableOpacity>
              </View>
            </View>
          </FadeIn>
        )}

        {/* ═══ MEMBER VIEW: Linked ═══ */}
        {isMember && isLinked && (
          <>
            {/* Warrior card */}
            {(() => {
              const warrior = roster.find(m => m.isWarrior);
              return warrior ? (
                <FadeIn delay={stagger(0, 100)}>
                  <View style={[styles.warriorCard, { borderLeftColor: accent }]}>
                    <View style={styles.warriorCardContent}>
                      <View style={[styles.avatarCircle, { borderColor: accent + '60', width: 56, height: 56, borderRadius: 28 }]}>
                        <Text style={{ fontSize: 28 }}>{warrior.emoji || '💪'}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <Text style={styles.warriorName}>{warrior.name}'s Circle</Text>
                        <Text style={styles.warriorSub}>You're supporting {warrior.name}</Text>
                        <View style={[styles.warriorBadge, { backgroundColor: accent + '20' }]}>
                          <Text style={[styles.warriorBadgeText, { color: accent }]}>💪 T1D Warrior</Text>
                        </View>
                      </View>
                    </View>
                    {/* Message warrior inline */}
                    <TouchableOpacity
                      style={[styles.messageBtn, { backgroundColor: accent + '20' }]}
                      onPress={() => {
                        haptic.light();
                        navigation.navigate('Chat', {
                          circleId: warrior.userId,
                          memberName: warrior.name,
                          memberEmoji: warrior.emoji || '💪',
                          relationship: 'warrior',
                        });
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>💬</Text>
                      <Text style={[styles.messageBtnText, { color: accent }]}>Message {warrior.name}</Text>
                    </TouchableOpacity>
                  </View>
                </FadeIn>
              ) : null;
            })()}

            {/* Circle Team */}
            <FadeIn delay={stagger(1, 100)}>
              <Text style={[styles.sectionTitle, txtShadow]}>CIRCLE TEAM</Text>
              {loading ? (
                <ActivityIndicator size="large" color={accent} style={{ paddingVertical: 40 }} />
              ) : roster.filter(m => !m.isWarrior).length === 0 ? (
                <View style={styles.opaqueCard}>
                  <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                    <Text style={{ fontSize: 44, marginBottom: 10 }}>👥</Text>
                    <Text style={styles.emptyTitle}>Just you for now</Text>
                    <Text style={styles.emptyText}>You're the only member. Others can join with an invite code.</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.opaqueCard}>
                  {roster.filter(m => !m.isWarrior).map((member, idx, arr) => (
                    <View key={idx}>
                      <View style={styles.memberRow}>
                        <View style={styles.memberRowLeft}>
                          <View style={[styles.avatarCircle, { borderColor: member.isYou ? accent + '60' : 'rgba(255,255,255,0.2)' }]}>
                            <Text style={{ fontSize: 22 }}>{member.emoji || '👤'}</Text>
                          </View>
                          <View style={styles.memberRowInfo}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={styles.memberRowName} numberOfLines={1}>{member.name}</Text>
                              {member.isYou && (
                                <View style={[styles.youBadge, { backgroundColor: accent + '20' }]}>
                                  <Text style={[styles.youBadgeText, { color: accent }]}>You</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.memberRowRelation}>
                              {RELATIONSHIPS.find(r => r.value === member.relationship)?.emoji || '👤'}{' '}
                              {RELATIONSHIPS.find(r => r.value === member.relationship)?.label || 'Circle Member'}
                            </Text>
                          </View>
                        </View>
                      </View>
                      {idx < arr.length - 1 && <View style={styles.rowDivider} />}
                    </View>
                  ))}
                </View>
              )}
            </FadeIn>

            {/* Group Chat */}
            <FadeIn delay={stagger(2, 100)}>
              <TouchableOpacity
                style={styles.groupChatBtn}
                onPress={() => navigation.navigate('Chat', {
                  circleId: 'group',
                  memberName: 'Group Chat',
                  memberEmoji: '💬',
                  relationship: 'group',
                })}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 20 }}>💬</Text>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.groupChatTitle}>Circle Group Chat</Text>
                  <Text style={styles.groupChatSub}>Message everyone</Text>
                </View>
                <Text style={{ fontSize: 22, color: 'rgba(255,255,255,0.4)' }}>›</Text>
              </TouchableOpacity>
            </FadeIn>
          </>
        )}
      </View>

      {/* ═══ MODALS ═══ */}

      {/* Create Invite Modal */}
      <Modal visible={showInviteModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Invite to Care Circle</Text>

            <Text style={styles.inputLabel}>Their Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Mom, Dr. Smith"
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={newName}
              onChangeText={setNewName}
            />

            <Text style={styles.inputLabel}>Relationship</Text>
            <View style={styles.relGrid}>
              {RELATIONSHIPS.map(r => (
                <TouchableOpacity
                  key={r.value}
                  style={[
                    styles.relChip,
                    newRelationship === r.value && { backgroundColor: accent, borderColor: accent },
                  ]}
                  onPress={() => setNewRelationship(r.value)}
                >
                  <Text style={styles.relEmoji}>{r.emoji}</Text>
                  <Text style={[styles.relLabel, newRelationship === r.value && styles.relLabelActive]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowInviteModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: accent }]}
                onPress={handleCreateInvite}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Create Invite</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Invite Code Display Modal */}
      <Modal visible={showCodeModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>🎉 Invite Created!</Text>
            <Text style={styles.codeLabel}>Share this code with your circle member:</Text>

            <View style={[styles.codeBox, { borderColor: accent + '60' }]}>
              <Text style={[styles.codeText, { color: accent }]}>{inviteCode}</Text>
            </View>

            <TouchableOpacity
              style={[styles.textInviteButton, { backgroundColor: accent }]}
              onPress={handleTextInvite}
            >
              <Text style={{ fontSize: 22, marginRight: 12 }}>📱</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.textInviteTitle}>Text Invite</Text>
                <Text style={styles.textInviteSubtitle}>Send download link + code via text</Text>
              </View>
              <Text style={styles.textInviteArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryBtn} onPress={handleShareCode}>
              <Text style={styles.secondaryBtnText}>📤 Share Another Way</Text>
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
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Join a Care Circle</Text>

            <Text style={styles.inputLabel}>Enter Invite Code</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="e.g. A1B2C3D4"
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="characters"
              maxLength={8}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowJoinModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: accent }]}
                onPress={handleJoinCircle}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Join</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 16 },

  /* Page header */
  pageHeader: { paddingHorizontal: 20, paddingBottom: 12 },
  pageTitle: { fontSize: 28, fontWeight: TYPE.bold, color: '#fff', marginBottom: 4 },
  pageSubtitle: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.7)' },

  /* Section titles */
  sectionTitle: { fontSize: 13, fontWeight: TYPE.bold, color: 'rgba(255,255,255,0.55)', marginBottom: 10, marginTop: 16, textTransform: 'uppercase', letterSpacing: 1.5 },

  /* Card header (inside card) */
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardHeaderTitle: { fontSize: 13, fontWeight: TYPE.bold, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 1.5 },
  inviteBtnSmall: { borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14, alignItems: 'center' },
  inviteBtnSmallText: { fontSize: 13, fontWeight: TYPE.bold, color: '#fff' },

  /* Opaque card */
  opaqueCard: { backgroundColor: 'rgba(10,18,40,0.94)', borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },

  /* Member rows */
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  memberRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  memberRowInfo: { flex: 1, marginLeft: 12 },
  memberRowName: { fontSize: 16, fontWeight: TYPE.semibold, color: '#fff', marginBottom: 2 },
  memberRowRelation: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  memberRowActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  rowDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 2 },

  /* Avatar */
  avatarCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },

  /* Icon buttons */
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  removeBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },

  /* Permission toggles */
  permToggles: { flexDirection: 'row', gap: 14, paddingLeft: 56, paddingBottom: 2, marginTop: -4 },
  permToggleItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  permToggleLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },

  /* Pending */
  pendingSectionLabel: { fontSize: 11, fontWeight: TYPE.bold, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, textTransform: 'uppercase', paddingTop: 10, paddingBottom: 6 },
  codeChip: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  codeChipText: { fontSize: 12, fontWeight: TYPE.semibold, letterSpacing: 1 },

  /* Sharing settings */
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  settingIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  settingTitle: { fontSize: 15, fontWeight: TYPE.semibold, color: '#fff', marginBottom: 2 },
  settingDesc: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.45)' },

  /* Empty states */
  emptyTitle: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 6 },
  emptyText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },

  /* Warrior card (member view) */
  warriorCard: { backgroundColor: 'rgba(10,18,40,0.94)', borderRadius: 18, padding: 18, marginBottom: 16, borderLeftWidth: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8 },
  warriorCardContent: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  warriorName: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 2 },
  warriorSub: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.55)', marginBottom: 6 },
  warriorBadge: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start' },
  warriorBadgeText: { fontSize: TYPE.sm, fontWeight: TYPE.semibold },
  messageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12 },
  messageBtnText: { fontSize: TYPE.md, fontWeight: TYPE.semibold },

  /* You badge */
  youBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  youBadgeText: { fontSize: 11, fontWeight: TYPE.bold },

  /* Group chat */
  groupChatBtn: { backgroundColor: 'rgba(10,18,40,0.94)', borderRadius: 18, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  groupChatTitle: { fontSize: 16, fontWeight: TYPE.semibold, color: '#fff' },
  groupChatSub: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.5)', marginTop: 2 },

  /* ═══ MODALS ═══ */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: 'rgba(20,20,32,0.95)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderBottomWidth: 0,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: TYPE.xxl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 20, textAlign: 'center' },
  inputLabel: { fontSize: TYPE.md, fontWeight: TYPE.semibold, color: 'rgba(255,255,255,0.7)', marginBottom: 8, marginTop: 10 },
  input: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, fontSize: TYPE.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', color: '#fff' },
  codeInput: { fontSize: TYPE.h3, textAlign: 'center', letterSpacing: 4, fontWeight: TYPE.bold },

  /* Relationship chips */
  relGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  relChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  relEmoji: { fontSize: TYPE.lg, marginRight: 6 },
  relLabel: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  relLabelActive: { color: '#fff', fontWeight: TYPE.semibold },

  /* Modal buttons */
  modalButtons: { flexDirection: 'row', marginTop: 25, gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center' },
  cancelButtonText: { fontSize: TYPE.lg, color: 'rgba(255,255,255,0.6)', fontWeight: TYPE.semibold },
  primaryButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryButtonText: { fontSize: TYPE.lg, color: '#fff', fontWeight: TYPE.bold },

  /* Code display modal */
  codeLabel: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginBottom: 12 },
  codeBox: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 22, alignItems: 'center', marginBottom: 20, borderWidth: 2 },
  codeText: { fontSize: TYPE.h1, fontWeight: TYPE.bold, letterSpacing: 6 },
  textInviteButton: { borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  textInviteTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff' },
  textInviteSubtitle: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  textInviteArrow: { fontSize: TYPE.h2, color: 'rgba(255,255,255,0.8)', fontWeight: '300' },
  secondaryBtn: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 12 },
  secondaryBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: TYPE.lg, fontWeight: TYPE.semibold },
  doneButton: { paddingVertical: 14, alignItems: 'center' },
  doneButtonText: { fontSize: TYPE.lg, color: 'rgba(255,255,255,0.5)' },
});
