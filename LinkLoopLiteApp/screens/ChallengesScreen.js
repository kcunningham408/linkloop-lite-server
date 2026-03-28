import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert, Modal, RefreshControl, ScrollView,
    StyleSheet, Text,
    TouchableOpacity, View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlassCard from '../components/GlassCard';
import ScreenHeader from '../components/ScreenHeader';
import { FadeIn, stagger } from '../config/animations';
import { haptic } from '../config/haptics';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { challengesAPI } from '../services/api';

const STATUS_COLORS = {
  active: { bg: '#1C2E1A', border: '#4CAF50', text: '#4CAF50', label: '🟢 Active' },
  completed: { bg: '#1A2E2A', border: '#4A90D9', text: '#4A90D9', label: '🎉 Completed' },
  failed: { bg: '#2E1A1A', border: '#FF6B6B', text: '#FF6B6B', label: '⏰ Expired' },
  cancelled: { bg: '#1E1E32', border: '#666', text: '#B0B0B0', label: '❌ Cancelled' },
};

const CHEER_EMOJIS = ['🎉', '🔥', '💪', '⭐', '👏', '🙌', '❤️', '🏆'];

export default function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getAccent } = useTheme();
  const isMember = user?.role === 'member';
  const accent = getAccent(isMember);

  const [challenges, setChallenges] = useState([]);
  const [stats, setStats] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [checking, setChecking] = useState(null);
  const [cheeringId, setCheeringId] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const challengeData = await challengesAPI.getAll();
      setChallenges(challengeData.challenges || []);
      setStats(challengeData.stats || null);
    } catch (err) {
      console.log('Challenges load error:', err);
    }

    // Load templates separately so a challenge fetch error doesn't block templates
    if (!isMember) {
      try {
        const templateData = await challengesAPI.getTemplates();
        setTemplates(templateData.templates || []);
      } catch (err) {
        console.log('Templates load error:', err);
      }
    }

    setLoading(false);
    setRefreshing(false);
  }, [isMember]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { haptic.light(); setRefreshing(true); loadData(); };

  const handleCreateFromTemplate = async (template) => {
    haptic.medium();
    try {
      await challengesAPI.create({
        title: template.title,
        description: template.description,
        emoji: template.emoji,
        type: template.type,
        target: template.target,
        durationDays: template.durationDays,
      });
      setShowCreate(false);
      loadData();
      Alert.alert('🎯 Challenge Started!', `${template.emoji} ${template.title} — Let's go!`);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not create challenge');
    }
  };

  const handleCheckProgress = async (challengeId) => {
    haptic.medium();
    setChecking(challengeId);
    try {
      const result = await challengesAPI.check(challengeId);
      if (result.challenge?.status === 'completed') {
        haptic.success();
        Alert.alert('🎉 Challenge Complete!', 'Amazing work — you crushed it!');
      }
      loadData();
    } catch (err) {
      Alert.alert('Error', 'Could not check progress');
    } finally {
      setChecking(null);
    }
  };

  const handleCheer = async (challengeId) => {
    haptic.success();
    setCheeringId(challengeId);
    try {
      const randomEmoji = CHEER_EMOJIS[Math.floor(Math.random() * CHEER_EMOJIS.length)];
      await challengesAPI.cheer(challengeId, randomEmoji);
      loadData();
    } catch (err) {
      if (err.message?.includes('already cheered')) {
        Alert.alert('Already Cheered', "You've already sent your support! 🎉");
      } else {
        Alert.alert('Error', 'Could not send cheer');
      }
    } finally {
      setCheeringId(null);
    }
  };

  const handleCancel = (challengeId) => {
    Alert.alert('Cancel Challenge', 'Are you sure you want to cancel this challenge?', [
      { text: 'Keep Going', style: 'cancel' },
      {
        text: 'Cancel Challenge', style: 'destructive',
        onPress: async () => {
          haptic.medium();
          try {
            await challengesAPI.cancel(challengeId);
            loadData();
          } catch (err) {
            Alert.alert('Error', 'Could not cancel challenge');
          }
        }
      }
    ]);
  };

  const activeChallenges = challenges.filter(c => c.status === 'active');
  const pastChallenges = challenges.filter(c => c.status !== 'active');

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[accent]} tintColor={accent} />}
      >
        <ScreenHeader
          title="🏆 Challenges"
          subtitle={isMember ? "Cheer on your warrior's goals" : 'Set goals, track progress, earn wins'}
        />

        <View style={styles.content}>
          {loading ? (
            <ActivityIndicator size="large" color={accent} style={{ paddingVertical: 60 }} />
          ) : (
            <>
              {/* Stats Bar */}
              {stats && stats.total > 0 && (
                <FadeIn delay={stagger(0, 80)}>
                  <GlassCard>
                    <View style={styles.statsRow}>
                      <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: '#4CAF50' }]}>{stats.completed}</Text>
                        <Text style={styles.statLabel}>Won</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: '#FF6B6B' }]}>{stats.failed}</Text>
                        <Text style={styles.statLabel}>Expired</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: accent }]}>{stats.active}</Text>
                        <Text style={styles.statLabel}>Active</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: '#FF7B93' }]}>{stats.winRate}%</Text>
                        <Text style={styles.statLabel}>Win Rate</Text>
                      </View>
                    </View>
                  </GlassCard>
                </FadeIn>
              )}

              {/* Create Button (warriors only) */}
              {!isMember && (
                <FadeIn delay={stagger(1, 80)}>
                  <TouchableOpacity
                    style={[styles.createBtn, { backgroundColor: accent }]}
                    onPress={() => { haptic.medium(); setShowCreate(true); }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.createBtnText}>+ New Challenge</Text>
                  </TouchableOpacity>
                </FadeIn>
              )}

              {/* Active Challenges */}
              {activeChallenges.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>🔥 Active Challenges</Text>
                  {activeChallenges.map((challenge, i) => (
                    <FadeIn key={challenge._id} delay={stagger(i + 2, 80)}>
                      <ChallengeCard
                        challenge={challenge}
                        accent={accent}
                        isMember={isMember}
                        checking={checking === challenge._id}
                        cheering={cheeringId === challenge._id}
                        onCheck={() => handleCheckProgress(challenge._id)}
                        onCheer={() => handleCheer(challenge._id)}
                        onCancel={() => handleCancel(challenge._id)}
                      />
                    </FadeIn>
                  ))}
                </>
              )}

              {/* Empty state */}
              {challenges.length === 0 && (
                <FadeIn delay={stagger(2, 80)}>
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyEmoji}>🏆</Text>
                    <Text style={styles.emptyTitle}>
                      {isMember ? 'No Challenges Yet' : 'Start Your First Challenge'}
                    </Text>
                    <Text style={styles.emptyText}>
                      {isMember
                        ? "When your warrior starts a challenge, you'll see it here and can cheer them on!"
                        : 'Set a goal, track your progress, and let your Care Circle cheer you on!'}
                    </Text>
                  </View>
                </FadeIn>
              )}

              {/* Past Challenges */}
              {pastChallenges.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>📋 Past Challenges</Text>
                  {pastChallenges.map((challenge, i) => (
                    <FadeIn key={challenge._id} delay={stagger(i + activeChallenges.length + 3, 60)}>
                      <ChallengeCard
                        challenge={challenge}
                        accent={accent}
                        isMember={isMember}
                        isPast
                      />
                    </FadeIn>
                  ))}
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Create Challenge Modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Start a Challenge</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Choose a challenge template to get started:</Text>
            <ScrollView style={styles.templateList}>
              {templates.map((t, i) => (
                <TouchableOpacity
                  key={t.key}
                  style={styles.templateCard}
                  onPress={() => handleCreateFromTemplate(t)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.templateEmoji}>{t.emoji}</Text>
                  <View style={styles.templateInfo}>
                    <Text style={styles.templateTitle}>{t.title}</Text>
                    <Text style={styles.templateDesc}>{t.description}</Text>
                    <Text style={styles.templateMeta}>
                      {t.durationDays} days · Target: {t.target.value}{t.target.unit}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ChallengeCard({ challenge, accent, isMember, isPast, checking, cheering, onCheck, onCheer, onCancel }) {
  const baseStyle = STATUS_COLORS[challenge.status] || STATUS_COLORS.active;
  const statusStyle = challenge.status === 'completed'
    ? { ...baseStyle, border: accent, text: accent }
    : baseStyle;
  const progress = challenge.progress?.current || 0;
  const target = challenge.target?.value || 100;
  const pct = challenge.type === 'tir'
    ? Math.min(100, Math.round((progress / target) * 100))
    : Math.min(100, Math.round((progress / target) * 100));

  const daysLeft = Math.max(0, Math.ceil((new Date(challenge.endDate) - Date.now()) / (1000 * 60 * 60 * 24)));

  const hasCheered = challenge.cheers?.length > 0;

  return (
    <View style={[styles.challengeCard, { backgroundColor: statusStyle.bg, borderLeftColor: statusStyle.border }]}>
      {/* Header */}
      <View style={styles.challengeHeader}>
        <Text style={styles.challengeEmoji}>{challenge.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.challengeTitle}>{challenge.title}</Text>
          {challenge.description ? (
            <Text style={styles.challengeDesc}>{challenge.description}</Text>
          ) : null}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.border + '20' }]}>
          <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>{statusStyle.label}</Text>
        </View>
      </View>

      {/* Progress */}
      <View style={styles.progressSection}>
        <View style={styles.progressInfo}>
          <Text style={styles.progressText}>
            {challenge.type === 'tir'
              ? `${progress}% avg TIR → ${target}% goal`
              : `${progress} / ${target} ${challenge.target?.unit || ''}`}
          </Text>
          {challenge.status === 'active' && (
            <Text style={styles.daysLeft}>{daysLeft}d left</Text>
          )}
          {challenge.status === 'completed' && challenge.completedAt && (
            <Text style={[styles.daysLeft, { color: accent }]}>
              ✅ {new Date(challenge.completedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </Text>
          )}
        </View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, {
            width: `${Math.max(pct, 2)}%`,
            backgroundColor: statusStyle.border,
          }]} />
        </View>
        <Text style={[styles.progressPct, { color: statusStyle.text }]}>{pct}%</Text>
      </View>

      {/* Cheers */}
      {challenge.cheers && challenge.cheers.length > 0 && (
        <View style={styles.cheersRow}>
          {challenge.cheers.slice(0, 5).map((c, i) => (
            <View key={i} style={styles.cheerBubble}>
              <Text style={styles.cheerEmoji}>{c.emoji}</Text>
              <Text style={styles.cheerName}>{c.name?.split(' ')[0]}</Text>
            </View>
          ))}
          {challenge.cheers.length > 5 && (
            <Text style={styles.cheerMore}>+{challenge.cheers.length - 5}</Text>
          )}
        </View>
      )}

      {/* Actions */}
      {!isPast && (
        <View style={styles.actionRow}>
          {!isMember && onCheck && (
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: accent }]}
              onPress={onCheck}
              disabled={checking}
            >
              {checking ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <Text style={[styles.actionBtnText, { color: accent }]}>🔄 Check Progress</Text>
              )}
            </TouchableOpacity>
          )}
          {isMember && onCheer && (
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: '#FF7B93', backgroundColor: 'rgba(255,123,147,0.08)' }]}
              onPress={onCheer}
              disabled={cheering}
            >
              {cheering ? (
                <ActivityIndicator size="small" color="#FF7B93" />
              ) : (
                <Text style={[styles.actionBtnText, { color: '#FF7B93' }]}>🎉 Cheer!</Text>
              )}
            </TouchableOpacity>
          )}
          {!isMember && onCancel && (
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: '#FF6B6B' }]}
              onPress={onCancel}
            >
              <Text style={[styles.actionBtnText, { color: '#FF6B6B' }]}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 16, paddingBottom: 40 },

  // Stats
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: TYPE.h2, fontWeight: TYPE.bold },
  statLabel: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.45)', marginTop: 4 },

  // Create button
  createBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginVertical: 16 },
  createBtnText: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff' },

  // Section title
  sectionTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff', marginTop: 20, marginBottom: 14 },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 50 },
  emptyEmoji: { fontSize: 60, marginBottom: 15 },
  emptyTitle: { fontSize: TYPE.xxl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 8 },
  emptyText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },

  // Challenge Card
  challengeCard: { borderRadius: 14, padding: 16, marginBottom: 14, borderLeftWidth: 5 },
  challengeHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  challengeEmoji: { fontSize: TYPE.h1, marginRight: 12 },
  challengeTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff' },
  challengeDesc: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.55)', marginTop: 2, lineHeight: 18 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginLeft: 8 },
  statusBadgeText: { fontSize: TYPE.xs, fontWeight: TYPE.bold },

  // Progress
  progressSection: { marginBottom: 10 },
  progressInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressText: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.40)' },
  daysLeft: { fontSize: TYPE.sm, color: '#FF7B93', fontWeight: TYPE.bold },
  progressBarBg: { height: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, marginBottom: 4 },
  progressBarFill: { height: 8, borderRadius: 4 },
  progressPct: { fontSize: TYPE.xs, fontWeight: TYPE.bold, textAlign: 'right' },

  // Cheers
  cheersRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  cheerBubble: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  cheerEmoji: { fontSize: TYPE.lg },
  cheerName: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  cheerMore: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.40)' },

  // Actions
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  actionBtnText: { fontSize: TYPE.sm, fontWeight: TYPE.bold },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'rgba(10,18,40,0.96)', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', padding: 20, paddingBottom: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: TYPE.xxl, fontWeight: TYPE.bold, color: '#fff' },
  modalClose: { fontSize: TYPE.h2, color: 'rgba(255,255,255,0.45)', padding: 8 },
  modalSubtitle: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.45)', marginBottom: 16 },
  templateList: { maxHeight: 500 },
  templateCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  templateEmoji: { fontSize: TYPE.h1, marginRight: 14 },
  templateInfo: { flex: 1 },
  templateTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff', marginBottom: 2 },
  templateDesc: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.55)', lineHeight: 18, marginBottom: 4 },
  templateMeta: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.40)' },
});
