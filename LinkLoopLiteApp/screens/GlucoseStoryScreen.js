import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator, RefreshControl, ScrollView,
    StyleSheet, Text, View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlassCard from '../components/GlassCard';
import ScreenHeader from '../components/ScreenHeader';
import { FadeIn, stagger } from '../config/animations';
import { haptic } from '../config/haptics';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { insightsAPI } from '../services/api';

const QUALITY_COLORS = {
  great: { bg: '#1A2E1A', border: '#4CAF50', text: '#4CAF50', label: 'Great' },
  good: { bg: '#1E2E1A', border: '#8BC34A', text: '#8BC34A', label: 'Good' },
  mixed: { bg: '#2A1E2E', border: '#FF7B93', text: '#FF7B93', label: 'Mixed' },
  tough: { bg: '#2E1A1A', border: '#FF6B6B', text: '#FF6B6B', label: 'Tough' },
};

export default function GlucoseStoryScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getAccent } = useTheme();
  const isMember = user?.role === 'member';
  const accent = getAccent(isMember);

  const [story, setStory] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStory = useCallback(async () => {
    try {
      const data = await insightsAPI.getGlucoseStory();
      setStory(data.story || null);
      setBlocks(data.blocks || []);
    } catch (err) {
      console.log('Glucose story load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadStory(); }, [loadStory]);

  const onRefresh = () => { haptic.light(); setRefreshing(true); loadStory(); };

  const activeBlocks = blocks.filter(b => b.hasData);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[accent]} tintColor={accent} />}
    >
      <ScreenHeader
        title="📖 Your Glucose Story"
        subtitle="Today's glucose journey, told chapter by chapter"
      />

      <View style={styles.content}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={styles.loadingText}>Writing your story...</Text>
          </View>
        ) : !story || activeBlocks.length === 0 ? (
          <FadeIn delay={0}>
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📖</Text>
              <Text style={styles.emptyTitle}>Your Story Awaits</Text>
              <Text style={styles.emptyText}>
                Log at least 3 glucose readings today and I'll write the story of your day — chapter by chapter.
              </Text>
            </View>
          </FadeIn>
        ) : (
          <>
            {/* Day overview */}
            <FadeIn delay={stagger(0, 80)}>
              <GlassCard accent={accent} glow>
                <View style={styles.overviewCard}>
                  <Text style={styles.overviewTitle}>
                    {story.userName}'s Day
                  </Text>
                  <Text style={styles.overviewDate}>
                    {new Date(story.date).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                  </Text>
                  <View style={styles.overviewStats}>
                    <View style={styles.overviewStat}>
                      <Text style={[styles.overviewStatValue, { color: accent }]}>{story.tir}%</Text>
                      <Text style={styles.overviewStatLabel}>In Range</Text>
                    </View>
                    <View style={styles.overviewDivider} />
                    <View style={styles.overviewStat}>
                      <Text style={[styles.overviewStatValue, { color: '#FF7B93' }]}>{story.avg}</Text>
                      <Text style={styles.overviewStatLabel}>Avg mg/dL</Text>
                    </View>
                    <View style={styles.overviewDivider} />
                    <View style={styles.overviewStat}>
                      <Text style={[styles.overviewStatValue, { color: '#C8C8C8' }]}>{story.readingCount}</Text>
                      <Text style={styles.overviewStatLabel}>Readings</Text>
                    </View>
                  </View>
                </View>
              </GlassCard>
            </FadeIn>

            {/* Timeline */}
            <FadeIn delay={stagger(1, 80)}>
              <Text style={styles.timelineTitle}>Your Day's Chapters</Text>
            </FadeIn>

            {blocks.map((block, index) => {
              if (!block.hasData) {
                // Inactive block — show as dimmed
                return (
                  <FadeIn key={block.key} delay={stagger(index + 2, 80)}>
                    <View style={styles.blockWrapper}>
                      {/* Timeline connector */}
                      {index > 0 && <View style={styles.timelineConnector} />}
                      <View style={styles.timelineDot} />

                      <View style={[styles.blockCard, styles.blockCardInactive]}>
                        <View style={styles.blockHeader}>
                          <Text style={styles.blockEmoji}>{block.emoji}</Text>
                          <Text style={styles.blockLabel}>{block.label}</Text>
                        </View>
                        <Text style={styles.blockInactiveText}>No readings yet</Text>
                      </View>
                    </View>
                  </FadeIn>
                );
              }

              const quality = QUALITY_COLORS[block.quality] || QUALITY_COLORS.mixed;

              return (
                <FadeIn key={block.key} delay={stagger(index + 2, 80)}>
                  <View style={styles.blockWrapper}>
                    {/* Timeline connector */}
                    {index > 0 && <View style={[styles.timelineConnector, { backgroundColor: quality.border + '40' }]} />}
                    <View style={[styles.timelineDot, { backgroundColor: quality.border }]} />

                    <View style={[styles.blockCard, { backgroundColor: quality.bg, borderLeftColor: quality.border }]}>
                      {/* Block header */}
                      <View style={styles.blockHeader}>
                        <Text style={styles.blockEmoji}>{block.emoji}</Text>
                        <Text style={styles.blockLabel}>{block.label}</Text>
                        <View style={[styles.qualityBadge, { backgroundColor: quality.border + '20' }]}>
                          <Text style={[styles.qualityBadgeText, { color: quality.text }]}>
                            {quality.label}
                          </Text>
                        </View>
                      </View>

                      {/* AI Narrative */}
                      {block.narrative && (
                        <Text style={styles.blockNarrative}>{block.narrative}</Text>
                      )}

                      {/* Stats row */}
                      <View style={styles.blockStats}>
                        <View style={styles.blockStatItem}>
                          <Text style={[styles.blockStatValue, { color: quality.text }]}>{block.stats.tir}%</Text>
                          <Text style={styles.blockStatLabel}>TIR</Text>
                        </View>
                        <View style={styles.blockStatItem}>
                          <Text style={[styles.blockStatValue, { color: '#FF7B93' }]}>{block.stats.avg}</Text>
                          <Text style={styles.blockStatLabel}>Avg</Text>
                        </View>
                        <View style={styles.blockStatItem}>
                          <Text style={styles.blockStatValue}>{block.stats.min}-{block.stats.max}</Text>
                          <Text style={styles.blockStatLabel}>Range</Text>
                        </View>
                        <View style={styles.blockStatItem}>
                          <Text style={styles.blockStatValue}>{block.stats.count}</Text>
                          <Text style={styles.blockStatLabel}>Readings</Text>
                        </View>
                      </View>

                      {/* Mood badges */}
                      {block.moods && block.moods.length > 0 && (
                        <View style={styles.moodRow}>
                          {block.moods.map((m, mi) => (
                            <View key={mi} style={styles.moodChip}>
                              <Text style={styles.moodChipText}>
                                {m.emoji} {m.label}{m.note ? ` — "${m.note}"` : ''}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* TIR bar */}
                      <View style={styles.blockBarBg}>
                        <View style={[styles.blockBarFill, {
                          width: `${Math.max(block.stats.tir, 3)}%`,
                          backgroundColor: quality.border,
                        }]} />
                      </View>
                    </View>
                  </View>
                </FadeIn>
              );
            })}

            {/* Disclaimer */}
            <FadeIn delay={stagger(blocks.length + 2, 80)}>
              <GlassCard>
                <View style={styles.disclaimerRow}>
                  <Text style={styles.disclaimerIcon}>💚</Text>
                  <Text style={styles.disclaimerText}>
                    Your glucose story is based on the data you logged. It's a wellness narrative — not medical advice.
                  </Text>
                </View>
              </GlassCard>
            </FadeIn>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 16, paddingBottom: 40 },

  // Loading / Empty
  loadingBox: { alignItems: 'center', paddingVertical: 60 },
  loadingText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.45)', marginTop: 15 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 60, marginBottom: 15 },
  emptyTitle: { fontSize: TYPE.xxl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 8 },
  emptyText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },

  // Overview
  overviewCard: { alignItems: 'center', paddingVertical: 8 },
  overviewTitle: { fontSize: TYPE.h2, fontWeight: TYPE.bold, color: '#fff', marginBottom: 4 },
  overviewDate: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.45)', marginBottom: 16 },
  overviewStats: { flexDirection: 'row', alignItems: 'center' },
  overviewStat: { flex: 1, alignItems: 'center' },
  overviewStatValue: { fontSize: TYPE.h2, fontWeight: TYPE.bold },
  overviewStatLabel: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.45)', marginTop: 4 },
  overviewDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.1)' },

  // Timeline
  timelineTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff', marginTop: 24, marginBottom: 16 },

  blockWrapper: { position: 'relative', marginLeft: 20, paddingLeft: 24, marginBottom: 16 },
  timelineConnector: { position: 'absolute', left: 6, top: -16, width: 2, height: 16, backgroundColor: 'rgba(255,255,255,0.1)' },
  timelineDot: { position: 'absolute', left: 0, top: 16, width: 14, height: 14, borderRadius: 7, backgroundColor: '#4A4A66', borderWidth: 2, borderColor: '#141422' },

  // Block card
  blockCard: { borderRadius: 14, padding: 16, borderLeftWidth: 4, borderLeftColor: '#4A4A66' },
  blockCardInactive: { backgroundColor: 'rgba(10,18,40,0.60)', borderLeftColor: '#333' },
  blockHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  blockEmoji: { fontSize: TYPE.h3, marginRight: 8 },
  blockLabel: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff', flex: 1 },
  qualityBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  qualityBadgeText: { fontSize: TYPE.xs, fontWeight: TYPE.bold },
  blockInactiveText: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.40)' },

  // Narrative
  blockNarrative: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.55)', lineHeight: 22, marginBottom: 12, fontStyle: 'italic' },

  // Block stats
  blockStats: { flexDirection: 'row', marginBottom: 10 },
  blockStatItem: { flex: 1, alignItems: 'center' },
  blockStatValue: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: 'rgba(255,255,255,0.40)' },
  blockStatLabel: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.40)', marginTop: 2 },

  // Mood
  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  moodChip: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  moodChipText: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.40)' },

  // TIR bar
  blockBarBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2 },
  blockBarFill: { height: 4, borderRadius: 2 },

  // Disclaimer
  disclaimerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  disclaimerIcon: { fontSize: TYPE.xxl, marginRight: 10, marginTop: 2 },
  disclaimerText: { flex: 1, fontSize: TYPE.sm, color: 'rgba(255,255,255,0.45)', lineHeight: 18 },
});
