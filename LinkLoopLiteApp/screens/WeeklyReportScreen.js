import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator, RefreshControl, ScrollView, Share,
    StyleSheet, Text, TouchableOpacity, View
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

export default function WeeklyReportScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getAccent } = useTheme();
  const isMember = user?.role === 'member';
  const accent = getAccent(isMember);

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadReport = useCallback(async () => {
    try {
      const data = await insightsAPI.getWeeklyReport();
      setReport(data.report || null);
    } catch (err) {
      console.log('Weekly report load error:', err?.message || err);
      setReport(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadReport(); }, [loadReport]);

  const onRefresh = () => { haptic.light(); setRefreshing(true); loadReport(); };

  const shareReport = async () => {
    if (!report) return;
    haptic.medium();
    const tw = report.thisWeek;
    const trends = report.trends;
    let msg = `∞ LinkLoop — Weekly Report Card\n📅 ${report.userName}'s Week\n\n`;
    msg += `📊 ${tw.readingCount} readings\n`;
    msg += `🎯 ${tw.tir}% Time in Range\n`;
    msg += `📈 Avg: ${tw.avg} mg/dL\n`;
    msg += `🔻 ${tw.lowCount} lows · 🔺 ${tw.highCount} highs\n`;
    if (trends) {
      msg += `\n${trends.tirChange >= 0 ? '⬆️' : '⬇️'} TIR ${trends.tirChange >= 0 ? '+' : ''}${trends.tirChange}% vs last week\n`;
    }
    if (report.bestDay) {
      msg += `\n⭐ Best day: ${report.bestDay.dayName} (${report.bestDay.tir}% TIR)`;
    }
    try { await Share.share({ message: msg }); } catch {}
  };

  const getTrendIcon = (val) => {
    if (val > 0) return '⬆️';
    if (val < 0) return '⬇️';
    return '➡️';
  };

  const getTrendColor = (val, goodDirection = 'up') => {
    if (val === 0) return '#C8C8C8';
    if (goodDirection === 'up') return val > 0 ? '#4CAF50' : '#FF6B6B';
    return val < 0 ? '#4CAF50' : '#FF6B6B';
  };

  const getGradeEmoji = (tir) => {
    if (tir >= 90) return '🌟';
    if (tir >= 80) return '⭐';
    if (tir >= 70) return '✅';
    if (tir >= 50) return '🔄';
    return '💪';
  };

  const getGradeLabel = (tir) => {
    if (tir >= 90) return 'Outstanding';
    if (tir >= 80) return 'Excellent';
    if (tir >= 70) return 'Great';
    if (tir >= 50) return 'Building';
    return 'Keep Going';
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[accent]} tintColor={accent} />}
    >
      <ScreenHeader
        title="📊 Weekly Report"
        subtitle="Your glucose week at a glance"
      />

      <View style={styles.content}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={styles.loadingText}>Generating your report...</Text>
          </View>
        ) : !report ? (
          <FadeIn delay={0}>
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📊</Text>
              <Text style={styles.emptyTitle}>No Report Yet</Text>
              <Text style={styles.emptyText}>
                Log glucose readings throughout the week to generate your personalized weekly report card!
              </Text>
            </View>
          </FadeIn>
        ) : (
          <>
            {/* Grade Card */}
            <FadeIn delay={stagger(0, 80)}>
              <GlassCard accent={accent} glow>
                <View style={styles.gradeCard}>
                  <Text style={styles.gradeEmoji}>{getGradeEmoji(report.thisWeek.tir)}</Text>
                  <Text style={styles.gradeLabel}>{getGradeLabel(report.thisWeek.tir)}</Text>
                  <Text style={styles.gradeSub}>
                    {report.thisWeek.tir}% Time in Range · {report.thisWeek.readingCount} readings
                  </Text>
                  <Text style={styles.dateRange}>
                    {new Date(report.weekOf).toLocaleDateString([], { month: 'short', day: 'numeric' })} — {new Date(report.endDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
              </GlassCard>
            </FadeIn>

            {/* AI Narrative */}
            {report.aiNarrative && (
              <FadeIn delay={stagger(1, 80)}>
                <GlassCard accent={accent}>
                  <View style={styles.narrativeCard}>
                    <Text style={styles.narrativeIcon}>🤖</Text>
                    <Text style={styles.narrativeText}>{report.aiNarrative}</Text>
                  </View>
                </GlassCard>
              </FadeIn>
            )}

            {/* Key Stats */}
            <FadeIn delay={stagger(2, 80)}>
              <GlassCard>
                <Text style={styles.sectionTitle}>This Week's Numbers</Text>
                <View style={styles.statsGrid}>
                  <StatBox label="Avg Glucose" value={`${report.thisWeek.avg}`} unit="mg/dL" color="#FF7B93" />
                  <StatBox label="TIR" value={`${report.thisWeek.tir}%`} color="#4CAF50" />
                  <StatBox label="Lows" value={`${report.thisWeek.lowCount}`} color="#FF6B6B" />
                  <StatBox label="Highs" value={`${report.thisWeek.highCount}`} color="#FF7B93" />
                  <StatBox label="CV" value={`${report.thisWeek.cv}%`} color="#B0B0B0" />
                  <StatBox label="Est. GMI" value={`${report.thisWeek.gmi}%`} color={accent} />
                </View>
              </GlassCard>
            </FadeIn>

            {/* Trends vs Last Week */}
            {report.trends && (
              <FadeIn delay={stagger(3, 80)}>
                <GlassCard>
                  <Text style={styles.sectionTitle}>vs. Last Week</Text>
                  <View style={styles.trendsGrid}>
                    <TrendRow
                      label="Time in Range"
                      value={report.trends.tirChange}
                      suffix="%"
                      good="up"
                    />
                    <TrendRow
                      label="Avg Glucose"
                      value={report.trends.avgChange}
                      suffix=" mg/dL"
                      good="down"
                    />
                    <TrendRow
                      label="Variability (CV)"
                      value={report.trends.cvChange}
                      suffix="%"
                      good="down"
                    />
                    <TrendRow
                      label="Readings Logged"
                      value={report.trends.readingsChange}
                      suffix=""
                      good="up"
                    />
                  </View>
                </GlassCard>
              </FadeIn>
            )}

            {/* Daily Breakdown */}
            {report.dailyBreakdown && report.dailyBreakdown.length > 0 && (
              <FadeIn delay={stagger(4, 80)}>
                <GlassCard>
                  <Text style={styles.sectionTitle}>Day by Day</Text>
                  {report.dailyBreakdown.map((day, i) => {
                    const isBest = report.bestDay && day.date === report.bestDay.date;
                    const isToughest = report.toughestDay && day.date === report.toughestDay.date && report.dailyBreakdown.length > 1;
                    return (
                      <View key={day.date} style={[styles.dayRow, i < report.dailyBreakdown.length - 1 && styles.dayRowBorder]}>
                        <View style={styles.dayInfo}>
                          <Text style={styles.dayName}>
                            {day.dayName}
                            {isBest ? ' ⭐' : isToughest ? ' 💪' : ''}
                          </Text>
                          <Text style={styles.dayDate}>{day.readingCount} readings</Text>
                        </View>
                        <View style={styles.dayStats}>
                          <Text style={[styles.dayTir, { color: day.tir >= 70 ? '#4CAF50' : day.tir >= 50 ? '#FF7B93' : '#FF6B6B' }]}>
                            {day.tir}%
                          </Text>
                          <Text style={styles.dayAvg}>avg {day.avg}</Text>
                        </View>
                        {/* Mini TIR bar */}
                        <View style={styles.dayBarBg}>
                          <View style={[styles.dayBarFill, {
                            width: `${Math.max(day.tir, 3)}%`,
                            backgroundColor: day.tir >= 70 ? '#4CAF50' : day.tir >= 50 ? '#FF7B93' : '#FF6B6B',
                          }]} />
                        </View>
                      </View>
                    );
                  })}
                </GlassCard>
              </FadeIn>
            )}

            {/* Mood Summary */}
            {report.moodSummary && report.moodSummary.count > 0 && (
              <FadeIn delay={stagger(5, 80)}>
                <GlassCard>
                  <Text style={styles.sectionTitle}>Mood This Week</Text>
                  <View style={styles.moodRow}>
                    <Text style={styles.moodStat}>
                      {report.moodSummary.count} mood entries
                    </Text>
                    <Text style={styles.moodTop}>
                      Most frequent: {report.moodSummary.topMood}
                    </Text>
                  </View>
                </GlassCard>
              </FadeIn>
            )}

            {/* Share Button */}
            <FadeIn delay={stagger(6, 80)}>
              <TouchableOpacity style={[styles.shareBtn, { backgroundColor: accent }]} onPress={shareReport} activeOpacity={0.8}>
                <Text style={styles.shareBtnText}>📤 Share Report</Text>
              </TouchableOpacity>
            </FadeIn>

            {/* Disclaimer */}
            <FadeIn delay={stagger(7, 80)}>
              <GlassCard>
                <View style={styles.disclaimerRow}>
                  <Text style={styles.disclaimerIcon}>💚</Text>
                  <Text style={styles.disclaimerText}>
                    This report is based on the data you logged in your wellness journal. It's not a medical report — always work with your care team for health decisions.
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

function StatBox({ label, value, unit, color }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      {unit && <Text style={styles.statUnit}>{unit}</Text>}
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TrendRow({ label, value, suffix, good }) {
  const icon = value > 0 ? '⬆️' : value < 0 ? '⬇️' : '➡️';
  const isGood = good === 'up' ? value > 0 : good === 'down' ? value < 0 : false;
  const isBad = good === 'up' ? value < 0 : good === 'down' ? value > 0 : false;
  const color = value === 0 ? '#C8C8C8' : isGood ? '#4CAF50' : isBad ? '#FF6B6B' : '#B0B0B0';

  return (
    <View style={styles.trendRow}>
      <Text style={styles.trendLabel}>{label}</Text>
      <Text style={[styles.trendValue, { color }]}>
        {icon} {value > 0 ? '+' : ''}{value}{suffix}
      </Text>
    </View>
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

  // Grade Card
  gradeCard: { alignItems: 'center', paddingVertical: 10 },
  gradeEmoji: { fontSize: 60, marginBottom: 8 },
  gradeLabel: { fontSize: TYPE.h2, fontWeight: TYPE.bold, color: '#fff', marginBottom: 4 },
  gradeSub: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.40)', marginBottom: 6 },
  dateRange: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.40)' },

  // AI Narrative
  narrativeCard: { flexDirection: 'row', alignItems: 'flex-start' },
  narrativeIcon: { fontSize: TYPE.h2, marginRight: 12, marginTop: 2 },
  narrativeText: { flex: 1, fontSize: TYPE.md, color: 'rgba(255,255,255,0.55)', lineHeight: 22, fontStyle: 'italic' },

  // Section
  sectionTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff', marginBottom: 14 },

  // Stats Grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  statBox: { width: '33.3%', alignItems: 'center', paddingVertical: 10 },
  statValue: { fontSize: TYPE.h2, fontWeight: TYPE.bold },
  statUnit: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.40)', marginTop: 1 },
  statLabel: { fontSize: TYPE.xs, color: 'rgba(255,255,255,0.45)', marginTop: 4 },

  // Trends
  trendsGrid: {},
  trendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  trendLabel: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.40)' },
  trendValue: { fontSize: TYPE.md, fontWeight: TYPE.bold },

  // Daily breakdown
  dayRow: { paddingVertical: 12 },
  dayRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  dayInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  dayName: { fontSize: TYPE.md, fontWeight: TYPE.bold, color: '#fff' },
  dayDate: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.40)' },
  dayStats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  dayTir: { fontSize: TYPE.lg, fontWeight: TYPE.bold },
  dayAvg: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.45)' },
  dayBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3 },
  dayBarFill: { height: 6, borderRadius: 3 },

  // Mood
  moodRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  moodStat: { fontSize: TYPE.md, color: 'rgba(255,255,255,0.40)' },
  moodTop: { fontSize: TYPE.md, color: '#fff', fontWeight: TYPE.semibold },

  // Share
  shareBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginVertical: 16 },
  shareBtnText: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff' },

  // Disclaimer
  disclaimerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  disclaimerIcon: { fontSize: TYPE.xxl, marginRight: 10, marginTop: 2 },
  disclaimerText: { flex: 1, fontSize: TYPE.sm, color: 'rgba(255,255,255,0.45)', lineHeight: 18 },
});
