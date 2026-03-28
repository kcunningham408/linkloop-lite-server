import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNavigation } from '@react-navigation/native';
import GlassCard from '../components/GlassCard';
import ScreenHeader from '../components/ScreenHeader';
import { FadeIn, stagger } from '../config/animations';
import { haptic } from '../config/haptics';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { insightsAPI } from '../services/api';

const TIME_RANGES = [
  { label: '24h', hours: 24 },
  { label: '3 Days', hours: 72 },
  { label: '7 Days', hours: 168 },
];

const TYPE_COLORS = {
  success: { bg: '#1E3422', border: '#4CAF50', badge: '#4CAF50' },
  warning: { bg: '#2E1E34', border: '#FF7B93', badge: '#FF7B93' },
  alert:   { bg: '#341E1E', border: '#D32F2F', badge: '#D32F2F' },
  info:    { bg: '#1E1E32', border: '#B0B0B0', badge: '#B0B0B0' },
  streak:  { bg: '#2E1E34', border: '#FF7B93', badge: '#FF7B93' },
};

const TYPE_LABELS = {
  success: '✅ Great',
  warning: '⚠️ Watch',
  alert: '🚨 Notable',
  info: 'ℹ️ Info',
  streak: '🔥 Streak',
};

const CATEGORY_ICONS = {
  trend: '📈', pattern: '🔄', streak: '🔥', spike: '⚡',
  timing: '🕐', comparison: '📊', stability: '❤️', milestone: '🏆', general: '🤖',
};

export default function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getAccent } = useTheme();
  const isMember = user?.role === 'member';
  const accent = getAccent(isMember);
  const navigation = useNavigation();

  const [insights, setInsights] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRange, setSelectedRange] = useState(72);
  const [expandedId, setExpandedId] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTrends, setAiTrends] = useState([]);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('insights'); // 'insights' | 'trends'
  const [motivation, setMotivation] = useState(null);
  const [motivationLoading, setMotivationLoading] = useState(true);

  const loadInsights = useCallback(async () => {
    try {
      const data = await insightsAPI.getInsights(selectedRange);
      setInsights(data.insights || []);
      setSummary(data.summary || null);
    } catch (err) {
      console.log('Insights load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedRange]);

  const loadAISummary = useCallback(async () => {
    setAiLoading(true);
    try {
      const data = await insightsAPI.getAISummary(selectedRange);
      setAiSummary(data.aiSummary || null);
    } catch (err) {
      console.log('AI summary load error:', err);
      setAiSummary(null);
    } finally {
      setAiLoading(false);
    }
  }, [selectedRange]);

  const loadAITrends = useCallback(async () => {
    setTrendsLoading(true);
    try {
      const data = await insightsAPI.getAITrends(selectedRange);
      setAiTrends(data.trends || []);
    } catch (err) {
      console.log('AI trends load error:', err);
      setAiTrends([]);
    } finally {
      setTrendsLoading(false);
    }
  }, [selectedRange]);

  const loadMotivation = useCallback(async () => {
    setMotivationLoading(true);
    try {
      const data = await insightsAPI.getDailyMotivation();
      setMotivation(data.motivation || null);
    } catch (err) {
      console.log('Motivation load error:', err);
      setMotivation(null);
    } finally {
      setMotivationLoading(false);
    }
  }, []);

  // Load motivation on mount (once per screen open)
  useEffect(() => {
    loadMotivation();
  }, []);

  useEffect(() => {
    setLoading(true);
    setAiSummary(null);
    setAiTrends([]);
    loadInsights();
  }, [loadInsights]);

  // Auto-load AI summary once insights are loaded (on the insights tab)
  useEffect(() => {
    if (activeTab === 'insights' && !aiSummary && !aiLoading && !loading && insights.length > 0) {
      loadAISummary();
    }
  }, [activeTab, loading, insights]);

  // Auto-load AI trends when switching to trends tab
  useEffect(() => {
    if (activeTab === 'trends' && aiTrends.length === 0 && !trendsLoading && !loading) {
      loadAITrends();
    }
  }, [activeTab, loading]);

  const onRefresh = () => {
    haptic.light();
    setRefreshing(true);
    setAiSummary(null);
    setAiTrends([]);
    setMotivation(null);
    loadMotivation();
    loadInsights();
  };

  const refreshAISummary = () => {
    setAiSummary(null);
    loadAISummary();
  };

  const refreshAITrends = () => {
    setAiTrends([]);
    loadAITrends();
  };

  const alertCount = insights.filter(i => i.type === 'alert').length;
  const warningCount = insights.filter(i => i.type === 'warning').length;
  const successCount = insights.filter(i => i.type === 'success').length;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[accent]} />}
    >
      {/* Header */}
      <ScreenHeader
        title="✨ AI Insights"
        subtitle="Pattern analysis & trends powered by AI"
      />

      <View style={[styles.content, { paddingBottom: 90 + insets.bottom }]}>
        {/* Daily Motivation Card */}
        <FadeIn delay={0}>
        <View style={styles.motivationCard}>
          <View style={[styles.motivationAccent, { backgroundColor: accent }]} />
          <View style={styles.motivationInner}>
            {motivationLoading ? (
              <View style={styles.motivationLoading}>
                <ActivityIndicator size="small" color={accent} />
                <Text style={[styles.motivationLoadingText, { color: accent }]}>Loading your daily boost...</Text>
              </View>
            ) : (
              <>
                <Text style={[styles.motivationLabel, { color: accent }]}>✨ Daily Motivation</Text>
                <Text style={styles.motivationText}>
                  {motivation || "T1D picked the wrong one. You show up every day. \uD83D\uDCAA"}
                </Text>
              </>
            )}
          </View>
        </View>
        </FadeIn>

        {/* Quick nav to new features */}
        <FadeIn delay={40}>
        <View style={styles.featureRow}>
          <TouchableOpacity style={[styles.featureBtn, { borderColor: accent + '30' }]} onPress={() => { haptic.light(); navigation.navigate('AskLoop'); }}>
            <Text style={styles.featureBtnEmoji}>🤖</Text>
            <Text style={[styles.featureBtnLabel, { color: accent }]}>Ask Loop</Text>
            <Text style={styles.featureBtnSub}>Chat with AI</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.featureBtn, { borderColor: accent + '30' }]} onPress={() => { haptic.light(); navigation.navigate('GlucoseStory'); }}>
            <Text style={styles.featureBtnEmoji}>📖</Text>
            <Text style={[styles.featureBtnLabel, { color: accent }]}>Your Story</Text>
            <Text style={styles.featureBtnSub}>Daily narrative</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.featureBtn, { borderColor: accent + '30' }]} onPress={() => { haptic.light(); navigation.navigate('WeeklyReport'); }}>
            <Text style={styles.featureBtnEmoji}>📊</Text>
            <Text style={[styles.featureBtnLabel, { color: accent }]}>Report</Text>
            <Text style={styles.featureBtnSub}>Weekly recap</Text>
          </TouchableOpacity>
        </View>
        </FadeIn>

        {/* Time Range Selector */}
        <FadeIn delay={80}>
        <View style={styles.rangeRow}>
          {TIME_RANGES.map(range => (
            <TouchableOpacity
              key={range.hours}
              style={[styles.rangeTab, selectedRange === range.hours && [styles.rangeTabActive, { backgroundColor: accent }]]}
              onPress={() => { haptic.selection(); setSelectedRange(range.hours); }}
            >
              <Text style={[styles.rangeTabText, selectedRange === range.hours && styles.rangeTabTextActive]}>
                {range.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        </FadeIn>

        <FadeIn delay={stagger(2, 100)}>
        {/* Tab Switcher */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'insights' && [styles.tabActive, { backgroundColor: accent }]]}
            onPress={() => { haptic.selection(); setActiveTab('insights'); }}
          >
            <Text style={[styles.tabText, activeTab === 'insights' && styles.tabTextActive]}>📋 Insights</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'trends' && [styles.tabActive, { backgroundColor: accent }]]}
            onPress={() => { haptic.selection(); setActiveTab('trends'); }}
          >
            <Text style={[styles.tabText, activeTab === 'trends' && styles.tabTextActive]}>📈 AI Trends</Text>
          </TouchableOpacity>
        </View>

        {/* ======== INSIGHTS TAB ======== */}
        {activeTab === 'insights' && (
          <>
            {/* Status Badges */}
            {insights.length > 0 && (
              <View style={styles.statusRow}>
                {alertCount > 0 && (
                  <View style={[styles.statusBadge, { backgroundColor: '#2A1010' }]}>
                    <Text style={[styles.statusBadgeText, { color: '#EF5350' }]}>🚨 {alertCount} Notable</Text>
                  </View>
                )}
                {warningCount > 0 && (
                  <View style={[styles.statusBadge, { backgroundColor: '#2A1E10' }]}>
                    <Text style={[styles.statusBadgeText, { color: '#FF8FA3' }]}>⚠️ {warningCount} Watch</Text>
                  </View>
                )}
                {successCount > 0 && (
                  <View style={[styles.statusBadge, { backgroundColor: '#102A14' }]}>
                    <Text style={[styles.statusBadgeText, { color: '#66BB6A' }]}>✅ {successCount} Great</Text>
                  </View>
                )}
              </View>
            )}

            {/* AI Summary Card */}
            {!loading && insights.length > 0 && (
              <GlassCard style={styles.aiCard}>
                <View style={styles.aiCardHeader}>
                  <Text style={styles.aiCardIcon}>🤖</Text>
                  <Text style={styles.aiCardTitle}>AI Analysis</Text>
                  <Text style={[styles.aiCardBadge, { backgroundColor: accent }]}>Groq AI</Text>
                </View>
                {aiSummary ? (
                  <>
                    <Text style={styles.aiCardText}>{aiSummary}</Text>
                    <TouchableOpacity style={[styles.refreshButton, { borderColor: accent }]} onPress={refreshAISummary}>
                      <Text style={[styles.refreshButtonText, { color: accent }]}>🔄 New Insight</Text>
                    </TouchableOpacity>
                  </>
                ) : aiLoading ? (
                  <View style={styles.aiLoadingRow}>
                    <ActivityIndicator size="small" color={accent} />
                    <Text style={[styles.aiLoadingText, { color: accent }]}>Analyzing your patterns...</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={[styles.refreshButton, { borderColor: accent }]} onPress={refreshAISummary}>
                    <Text style={[styles.refreshButtonText, { color: accent }]}>✨ Generate AI Insight</Text>
                  </TouchableOpacity>
                )}
              </GlassCard>
            )}

            {/* Insights List */}
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={accent} />
                <Text style={styles.loadingText}>Analyzing your patterns...</Text>
              </View>
            ) : insights.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>✨</Text>
                <Text style={styles.emptyTitle}>No insights yet</Text>
                <Text style={styles.emptyText}>Log glucose readings to unlock AI-powered pattern analysis.</Text>
              </View>
            ) : (
              insights.map((insight) => {
                const colors = TYPE_COLORS[insight.type] || TYPE_COLORS.info;
                const isExpanded = expandedId === insight.id;

                return (
                  <TouchableOpacity
                    key={insight.id}
                    style={[styles.insightCard, { backgroundColor: colors.bg, borderLeftColor: colors.border }]}
                    onPress={() => { haptic.light(); setExpandedId(isExpanded ? null : insight.id); }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.insightTop}>
                      <Text style={styles.insightIcon}>{insight.icon}</Text>
                      <View style={styles.insightBody}>
                        <View style={styles.insightTitleRow}>
                          <Text style={styles.insightTitle} numberOfLines={1}>{insight.title}</Text>
                          <View style={[styles.typeBadge, { backgroundColor: colors.badge + '20' }]}>
                            <Text style={[styles.typeBadgeText, { color: colors.badge }]} numberOfLines={1}>
                              {TYPE_LABELS[insight.type] || 'Info'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.insightSummary}>{insight.summary}</Text>
                      </View>
                    </View>

                    {isExpanded && insight.detail && (
                      <View style={styles.insightDetail}>
                        <Text style={styles.insightDetailText}>{insight.detail}</Text>
                      </View>
                    )}

                    {insight.detail && (
                      <Text style={styles.expandHint}>{isExpanded ? 'Tap to collapse ▲' : 'Tap for details ▼'}</Text>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}

        {/* ======== TRENDS TAB ======== */}
        {activeTab === 'trends' && (
          <>
            {/* Trends Header */}
            <GlassCard style={styles.trendsHeader}>
              <Text style={styles.trendsHeaderIcon}>📈</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.trendsHeaderTitle}>AI Trend Notifications</Text>
                <Text style={styles.trendsHeaderSub}>Patterns, streaks & alerts spotted by Groq AI</Text>
              </View>
              {aiTrends.length > 0 && (
                <TouchableOpacity onPress={refreshAITrends} style={styles.trendsRefreshBtn}>
                  <Text style={styles.trendsRefreshText}>🔄</Text>
                </TouchableOpacity>
              )}
            </GlassCard>

            {trendsLoading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={accent} />
                <Text style={styles.loadingText}>AI is scanning your data for trends...</Text>
              </View>
            ) : aiTrends.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>📈</Text>
                <Text style={styles.emptyTitle}>No trends yet</Text>
                <Text style={styles.emptyText}>Log glucose readings and AI will spot patterns, streaks, and trends for you.</Text>
              </View>
            ) : (
              aiTrends.map((trend) => {
                const colors = TYPE_COLORS[trend.type] || TYPE_COLORS.info;
                const catIcon = CATEGORY_ICONS[trend.category] || '🔍';

                return (
                  <View
                    key={trend.id}
                    style={[styles.trendCard, { backgroundColor: colors.bg, borderLeftColor: colors.border }]}
                  >
                    <View style={styles.trendTop}>
                      <Text style={styles.trendIcon}>{trend.icon}</Text>
                      <View style={styles.trendBody}>
                        <View style={styles.trendTitleRow}>
                          <Text style={styles.trendTitle} numberOfLines={1}>{trend.title}</Text>
                          <View style={[styles.categoryBadge, { backgroundColor: colors.badge + '15' }]}>
                            <Text style={[styles.categoryBadgeText, { color: colors.badge }]} numberOfLines={1}>
                              {catIcon} {trend.category}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.trendMessage}>{trend.message}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}

            {/* Refresh Trends Button */}
            {aiTrends.length > 0 && !trendsLoading && (
              <TouchableOpacity style={[styles.refreshButton, { borderColor: accent }]} onPress={refreshAITrends}>
                <Text style={[styles.refreshButtonText, { color: accent }]}>🔄 New Trends</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerText}>
            💚  Insights and trends are observations based on your data — not medical advice. Always work with your care team for health decisions.
          </Text>
        </View>
        </FadeIn>
      </View>
    </ScrollView>
  );
}

function SummaryPill({ label, value, color }) {
  return (
    <View style={styles.summaryPill}>
      <Text style={[styles.summaryValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{value}</Text>
      <Text style={styles.summaryLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 20 },

  // ── Daily Motivation ──────────────────────
  motivationCard: {
    flexDirection: 'row',
    backgroundColor: '#0E1530',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  motivationAccent: { width: 4, alignSelf: 'stretch' },
  motivationInner: { flex: 1, padding: 18 },
  motivationLabel: { fontSize: TYPE.xs, fontWeight: TYPE.bold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  motivationText: { fontSize: TYPE.md, color: '#fff', lineHeight: 22, fontStyle: 'italic' },
  motivationLoading: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  motivationLoadingText: { fontSize: TYPE.sm, marginLeft: 10 },

  // ── Feature Buttons ───────────────────────
  featureRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  featureBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#0E1530',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 6,
    borderWidth: 1,
  },
  featureBtnEmoji: { fontSize: 26, marginBottom: 6 },
  featureBtnLabel: { fontSize: TYPE.sm, fontWeight: TYPE.bold, marginBottom: 2 },
  featureBtnSub: { fontSize: 10, color: 'rgba(255,255,255,0.55)' },

  // ── Time Range ────────────────────────────
  rangeRow: { flexDirection: 'row', backgroundColor: '#0E1530', borderRadius: 14, padding: 4, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  rangeTab: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  rangeTabActive: {},
  rangeTabText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.60)', fontWeight: TYPE.semibold },
  rangeTabTextActive: { color: '#fff' },

  // ── Tab Switcher ──────────────────────────
  tabRow: { flexDirection: 'row', backgroundColor: '#0E1530', borderRadius: 14, padding: 4, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  tabActive: {},
  tabText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.60)', fontWeight: TYPE.bold },
  tabTextActive: { color: '#fff' },

  // ── Status Badges ─────────────────────────
  statusRow: { flexDirection: 'row', gap: 8, marginBottom: 18, flexWrap: 'wrap' },
  statusBadge: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  statusBadgeText: { fontSize: TYPE.sm, fontWeight: TYPE.bold },

  // ── Loading / Empty ───────────────────────
  loadingBox: { alignItems: 'center', paddingVertical: 60 },
  loadingText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.45)', marginTop: 15 },
  emptyState: { alignItems: 'center', paddingVertical: 50 },
  emptyEmoji: { fontSize: 60, marginBottom: 15 },
  emptyTitle: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 8 },
  emptyText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 22 },

  // ── Insight Cards ────────────────────────
  insightCard: { borderRadius: 14, padding: 18, marginBottom: 12, borderLeftWidth: 4 },
  insightTop: { flexDirection: 'row', alignItems: 'flex-start' },
  insightIcon: { fontSize: TYPE.h3, marginRight: 14 },
  insightBody: { flex: 1 },
  insightTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  insightTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff', flex: 1, marginRight: 8 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  typeBadgeText: { fontSize: 11, fontWeight: TYPE.bold },
  insightSummary: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.60)', lineHeight: 21 },
  insightDetail: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  insightDetailText: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.55)', lineHeight: 20, fontStyle: 'italic' },
  expandHint: { fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 10 },

  // ── AI Card ──────────────────────────────
  aiCard: { borderRadius: 16, padding: 18, marginBottom: 20 },
  aiCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  aiCardIcon: { fontSize: TYPE.h3, marginRight: 8 },
  aiCardTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff', flex: 1 },
  aiCardBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, fontSize: 11, fontWeight: TYPE.bold, color: '#fff', overflow: 'hidden' },
  aiCardText: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.60)', lineHeight: 22 },
  aiLoadingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  aiLoadingText: { fontSize: TYPE.sm, marginLeft: 10 },
  refreshButton: { alignSelf: 'center', marginTop: 14, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1 },
  refreshButtonText: { fontSize: TYPE.md, fontWeight: TYPE.bold },

  // ── Trends Tab ────────────────────────────
  trendsHeader: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, marginBottom: 16 },
  trendsHeaderIcon: { fontSize: 28, marginRight: 12 },
  trendsHeaderTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff' },
  trendsHeaderSub: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  trendsRefreshBtn: { padding: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' },
  trendsRefreshText: { fontSize: TYPE.lg },

  // ── Trend Cards ───────────────────────────
  trendCard: { borderRadius: 14, padding: 16, marginBottom: 12, borderLeftWidth: 4 },
  trendTop: { flexDirection: 'row', alignItems: 'flex-start' },
  trendIcon: { fontSize: TYPE.h3, marginRight: 12 },
  trendBody: { flex: 1 },
  trendTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  trendTitle: { fontSize: TYPE.md, fontWeight: TYPE.bold, color: '#fff', flex: 1, marginRight: 8 },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  categoryBadgeText: { fontSize: TYPE.xs, fontWeight: TYPE.bold, textTransform: 'capitalize' },
  trendMessage: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.55)', lineHeight: 21 },

  // ── Disclaimer ────────────────────────────
  disclaimerBox: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, marginTop: 10, marginBottom: 30, backgroundColor: '#0C1228' },
  disclaimerText: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.55)', lineHeight: 18, textAlign: 'center' },
});
