import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { insightsAPI } from '../services/api';

const TIME_RANGES = [
  { label: '24h', hours: 24 },
  { label: '3 Days', hours: 72 },
  { label: '7 Days', hours: 168 },
];

const TYPE_COLORS = {
  success: { bg: '#1A2E1A', border: '#4CAF50', badge: '#4CAF50' },
  warning: { bg: '#2E2A1A', border: '#FFA500', badge: '#FFA500' },
  alert:   { bg: '#2E1A1A', border: '#D32F2F', badge: '#D32F2F' },
  info:    { bg: '#1C1C1E', border: '#888', badge: '#888' },
  streak:  { bg: '#2E2A1A', border: '#FFA500', badge: '#FFA500' },
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4A90D9']} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>✨ AI Insights</Text>
        <Text style={styles.headerSubtitle}>Pattern analysis & trend notifications powered by AI</Text>
      </View>

      <View style={styles.content}>
        {/* Daily Motivation Card — always visible */}
        <View style={styles.motivationCard}>
          {motivationLoading ? (
            <View style={styles.motivationLoading}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.motivationLoadingText}>Loading your daily boost...</Text>
            </View>
          ) : motivation ? (
            <>
              <Text style={styles.motivationLabel}>✨ Daily Motivation</Text>
              <Text style={styles.motivationText}>{motivation}</Text>
            </>
          ) : (
            <>
              <Text style={styles.motivationLabel}>✨ Daily Motivation</Text>
              <Text style={styles.motivationText}>{"T1D doesn\u2019t define you \u2014 but how you handle it sure says a lot about who you are. \uD83D\uDCAA"}</Text>
            </>
          )}
        </View>

        {/* Time Range Selector */}
        <View style={styles.rangeRow}>
          {TIME_RANGES.map(range => (
            <TouchableOpacity
              key={range.hours}
              style={[styles.rangeTab, selectedRange === range.hours && styles.rangeTabActive]}
              onPress={() => setSelectedRange(range.hours)}
            >
              <Text style={[styles.rangeTabText, selectedRange === range.hours && styles.rangeTabTextActive]}>
                {range.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary Bar */}
        {summary && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <SummaryPill label="Readings" value={summary.readingCount} color="#666" />
              <SummaryPill label="Avg" value={summary.average + ''} color="#FFA500" />
              <SummaryPill label="TIR" value={summary.timeInRange + '%'} color="#4CAF50" />
              <SummaryPill label="Range" value={summary.min + '-' + summary.max} color="#666" />
            </View>
          </View>
        )}

        {/* Tab Switcher: Insights vs Trends */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'insights' && styles.tabActive]}
            onPress={() => setActiveTab('insights')}
          >
            <Text style={[styles.tabText, activeTab === 'insights' && styles.tabTextActive]}>📋 Insights</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'trends' && styles.tabActive]}
            onPress={() => setActiveTab('trends')}
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
                  <View style={[styles.statusBadge, { backgroundColor: '#2E1A1A' }]}>
                    <Text style={[styles.statusBadgeText, { color: '#D32F2F' }]}>🚨 {alertCount} Notable</Text>
                  </View>
                )}
                {warningCount > 0 && (
                  <View style={[styles.statusBadge, { backgroundColor: '#2E2A1A' }]}>
                    <Text style={[styles.statusBadgeText, { color: '#FFA500' }]}>⚠️ {warningCount} Watch</Text>
                  </View>
                )}
                {successCount > 0 && (
                  <View style={[styles.statusBadge, { backgroundColor: '#1A2E1A' }]}>
                    <Text style={[styles.statusBadgeText, { color: '#4CAF50' }]}>✅ {successCount} Great</Text>
                  </View>
                )}
              </View>
            )}

            {/* AI Summary Card */}
            {!loading && insights.length > 0 && (
              <View style={styles.aiCard}>
                <View style={styles.aiCardHeader}>
                  <Text style={styles.aiCardIcon}>🤖</Text>
                  <Text style={styles.aiCardTitle}>AI Analysis</Text>
                  <Text style={styles.aiCardBadge}>Groq AI</Text>
                </View>
                {aiSummary ? (
                  <>
                    <Text style={styles.aiCardText}>{aiSummary}</Text>
                    <TouchableOpacity style={styles.refreshButton} onPress={refreshAISummary}>
                      <Text style={styles.refreshButtonText}>🔄 New Insight</Text>
                    </TouchableOpacity>
                  </>
                ) : aiLoading ? (
                  <View style={styles.aiLoadingRow}>
                    <ActivityIndicator size="small" color="#4A90D9" />
                    <Text style={styles.aiLoadingText}>Analyzing your patterns...</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.refreshButton} onPress={refreshAISummary}>
                    <Text style={styles.refreshButtonText}>✨ Generate AI Insight</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Insights List */}
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#4A90D9" />
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
                    onPress={() => setExpandedId(isExpanded ? null : insight.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.insightTop}>
                      <Text style={styles.insightIcon}>{insight.icon}</Text>
                      <View style={styles.insightBody}>
                        <View style={styles.insightTitleRow}>
                          <Text style={styles.insightTitle}>{insight.title}</Text>
                          <View style={[styles.typeBadge, { backgroundColor: colors.badge + '20' }]}>
                            <Text style={[styles.typeBadgeText, { color: colors.badge }]}>
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
            <View style={styles.trendsHeader}>
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
            </View>

            {trendsLoading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#4A90D9" />
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
                          <Text style={styles.trendTitle}>{trend.title}</Text>
                          <View style={[styles.categoryBadge, { backgroundColor: colors.badge + '15' }]}>
                            <Text style={[styles.categoryBadgeText, { color: colors.badge }]}>
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
              <TouchableOpacity style={styles.refreshButton} onPress={refreshAITrends}>
                <Text style={styles.refreshButtonText}>🔄 New Trends</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerIcon}>💚</Text>
          <Text style={styles.disclaimerText}>
            Insights and trends are based on patterns in the data you log. They are observations — not medical advice or recommendations. Always work with your care team for health decisions.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function SummaryPill({ label, value, color }) {
  return (
    <View style={styles.summaryPill}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111111' },
  header: { backgroundColor: '#1C1C1E', padding: 25, paddingTop: 30 },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  headerSubtitle: { fontSize: 14, color: '#A0A0A0' },
  content: { padding: 20 },

  // Daily motivation
  motivationCard: { backgroundColor: '#4A90D9', borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#3A7BC8' },
  motivationLabel: { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  motivationText: { fontSize: 16, color: '#fff', lineHeight: 24, fontStyle: 'italic' },
  motivationLoading: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  motivationLoadingText: { fontSize: 13, color: '#fff', marginLeft: 10 },

  // Time range
  rangeRow: { flexDirection: 'row', backgroundColor: '#2C2C2E', borderRadius: 12, padding: 4, marginBottom: 20 },
  rangeTab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  rangeTabActive: { backgroundColor: '#4A90D9' },
  rangeTabText: { fontSize: 14, color: '#A0A0A0', fontWeight: '600' },
  rangeTabTextActive: { color: '#fff' },

  // Summary
  summaryCard: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#2C2C2E' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryPill: { alignItems: 'center', flex: 1 },
  summaryValue: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  summaryLabel: { fontSize: 11, color: '#888' },

  // Tab switcher
  tabRow: { flexDirection: 'row', backgroundColor: '#1C1C1E', borderRadius: 12, padding: 4, marginBottom: 20, borderWidth: 1, borderColor: '#2C2C2E' },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: '#4A90D9' },
  tabText: { fontSize: 14, color: '#A0A0A0', fontWeight: '700' },
  tabTextActive: { color: '#fff' },

  // Status badges
  statusRow: { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  statusBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  statusBadgeText: { fontSize: 13, fontWeight: '700' },

  // Loading / empty
  loadingBox: { alignItems: 'center', paddingVertical: 60 },
  loadingText: { fontSize: 14, color: '#888', marginTop: 15 },
  emptyState: { alignItems: 'center', paddingVertical: 50 },
  emptyEmoji: { fontSize: 60, marginBottom: 15 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 22 },

  // Insight cards
  insightCard: { borderRadius: 12, padding: 18, marginBottom: 14, borderLeftWidth: 5 },
  insightTop: { flexDirection: 'row', alignItems: 'flex-start' },
  insightIcon: { fontSize: 32, marginRight: 14 },
  insightBody: { flex: 1 },
  insightTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  insightTitle: { fontSize: 16, fontWeight: '700', color: '#fff', flex: 1, marginRight: 8 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  insightSummary: { fontSize: 14, color: '#C0C0C0', lineHeight: 21 },
  insightDetail: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  insightDetailText: { fontSize: 13, color: '#A0A0A0', lineHeight: 20, fontStyle: 'italic' },
  expandHint: { fontSize: 11, color: '#666', textAlign: 'center', marginTop: 10 },

  // AI card
  aiCard: { backgroundColor: '#1A2235', borderRadius: 14, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: '#2A3A50' },
  aiCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  aiCardIcon: { fontSize: 24, marginRight: 8 },
  aiCardTitle: { fontSize: 17, fontWeight: '700', color: '#fff', flex: 1 },
  aiCardBadge: { backgroundColor: '#4A90D9', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, fontSize: 11, fontWeight: '700', color: '#fff', overflow: 'hidden' },
  aiCardText: { fontSize: 14, color: '#C0C0C0', lineHeight: 22 },
  aiLoadingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  aiLoadingText: { fontSize: 13, color: '#4A90D9', marginLeft: 10 },
  aiButton: { backgroundColor: '#4A90D9', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  aiButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  refreshButton: { alignSelf: 'center', marginTop: 14, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20, backgroundColor: '#2A3A50', borderWidth: 1, borderColor: '#4A90D9' },
  refreshButtonText: { fontSize: 14, color: '#4A90D9', fontWeight: '700' },

  // Trends tab
  trendsHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C1E', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#2C2C2E' },
  trendsHeaderIcon: { fontSize: 30, marginRight: 12 },
  trendsHeaderTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  trendsHeaderSub: { fontSize: 12, color: '#888', marginTop: 2 },
  trendsRefreshBtn: { padding: 8, borderRadius: 20, backgroundColor: '#1A2235' },
  trendsRefreshText: { fontSize: 18 },

  // Trend cards
  trendCard: { borderRadius: 12, padding: 16, marginBottom: 12, borderLeftWidth: 5 },
  trendTop: { flexDirection: 'row', alignItems: 'flex-start' },
  trendIcon: { fontSize: 28, marginRight: 12 },
  trendBody: { flex: 1 },
  trendTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  trendTitle: { fontSize: 15, fontWeight: '700', color: '#fff', flex: 1, marginRight: 8 },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  categoryBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  trendMessage: { fontSize: 14, color: '#C0C0C0', lineHeight: 21 },

  // Disclaimer
  disclaimerBox: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'flex-start', marginTop: 10, marginBottom: 30, borderWidth: 1, borderColor: '#2C2C2E' },
  disclaimerIcon: { fontSize: 22, marginRight: 10, marginTop: 2 },
  disclaimerText: { flex: 1, fontSize: 12, color: '#888', lineHeight: 18 },
});
