import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn, stagger } from '../config/animations';
import { haptic } from '../config/haptics';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { authAPI } from '../services/api';

export default function WatchSyncScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { palette } = useTheme();
  const isMember = user?.role === 'member';
  const accent = isMember ? palette.member : palette.warrior;

  const [watchCode, setWatchCode] = useState(null);
  const [watchCodeLoading, setWatchCodeLoading] = useState(false);

  const handleWatchPair = async () => {
    try {
      setWatchCodeLoading(true);
      const data = await authAPI.generateWatchPairCode();
      setWatchCode(data.code);
      haptic.success();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not generate code');
    } finally {
      setWatchCodeLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}>
      <View style={styles.content}>

        {/* ── Pairing Card ── */}
        <FadeIn delay={stagger(0, 100)}>
          <View style={[styles.pairCard, { borderLeftColor: accent }]}>
            <View style={styles.pairHeader}>
              <Text style={{ fontSize: 36 }}>⌚</Text>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.pairTitle}>Pair Your Watch</Text>
                <Text style={styles.pairDesc}>
                  Generate a 6-digit code, then enter it on your Apple Watch
                </Text>
              </View>
            </View>

            {watchCode ? (
              <View style={styles.codeContainer}>
                <View style={[styles.codeBox, { borderColor: accent + '40' }]}>
                  <Text style={[styles.codeText, { color: accent }]}>{watchCode}</Text>
                </View>
                <Text style={styles.codeHint}>
                  Enter this on your Watch. Expires in 10 min.
                </Text>
                <TouchableOpacity onPress={handleWatchPair} style={styles.regenerateBtn}>
                  <Text style={[styles.regenerateText, { color: accent }]}>Generate New Code</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.pairButton, { backgroundColor: accent }]}
                onPress={handleWatchPair}
                disabled={watchCodeLoading}
              >
                <Text style={styles.pairButtonText}>
                  {watchCodeLoading ? 'Generating...' : 'Generate Pairing Code'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </FadeIn>

        {/* ── Features ── */}
        <FadeIn delay={stagger(1, 100)}>
          <View style={styles.opaqueCard}>
            <Text style={styles.cardHeaderTitle}>FEATURES</Text>
            <View style={styles.rowDivider} />

            {[
              { icon: '🔵', title: 'Watch Face Complications', desc: 'Glucose number on your watch face — circular, rectangular, and inline' },
              { icon: '⚡', title: 'Live Push from iPhone', desc: 'Latest reading pushed every 60 seconds' },
              { icon: '📈', title: 'Trend Graph', desc: '3-hour glucose trend on your wrist' },
              { icon: '🔔', title: 'Haptic Alerts', desc: 'Tap on the wrist for high or low glucose' },
            ].map((f, idx, arr) => (
              <View key={idx}>
                <View style={styles.featureRow}>
                  <View style={[styles.featureIconCircle, { backgroundColor: accent + '15' }]}>
                    <Text style={{ fontSize: 18 }}>{f.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                    <Text style={styles.featureDesc}>{f.desc}</Text>
                  </View>
                </View>
                {idx < arr.length - 1 && <View style={styles.rowDivider} />}
              </View>
            ))}
          </View>
        </FadeIn>

        {/* ── Setup Steps ── */}
        <FadeIn delay={stagger(2, 100)}>
          <View style={styles.opaqueCard}>
            <Text style={styles.cardHeaderTitle}>HOW TO SET UP</Text>
            <View style={styles.rowDivider} />

            {[
              { title: 'Install LinkLoop on your Watch', desc: 'Open the Watch app on your iPhone and install' },
              { title: 'Generate a pairing code', desc: 'Tap the button above to get a 6-digit code' },
              { title: 'Enter code on your Watch', desc: 'Open LinkLoop on your Watch and enter it' },
              { title: 'Add complications', desc: 'Long-press watch face → Edit → add LinkLoop' },
            ].map((step, idx, arr) => (
              <View key={idx}>
                <View style={styles.stepRow}>
                  <View style={[styles.stepBadge, { backgroundColor: accent }]}>
                    <Text style={styles.stepNumber}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepDesc}>{step.desc}</Text>
                  </View>
                </View>
                {idx < arr.length - 1 && <View style={styles.rowDivider} />}
              </View>
            ))}
          </View>
        </FadeIn>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 16 },

  /* Pair card */
  pairCard: {
    backgroundColor: 'rgba(10,18,40,0.94)',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderLeftWidth: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pairHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  pairTitle: { fontSize: TYPE.xl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 4 },
  pairDesc: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.5)', lineHeight: 18 },

  codeContainer: { alignItems: 'center', marginTop: 4 },
  codeBox: {
    borderWidth: 2,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  codeText: { fontSize: 32, fontWeight: '800', letterSpacing: 8 },
  codeHint: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 10, lineHeight: 18 },
  regenerateBtn: { marginTop: 12, paddingVertical: 6 },
  regenerateText: { fontWeight: TYPE.semibold, fontSize: TYPE.md },

  pairButton: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  pairButtonText: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff' },

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

  /* Feature rows */
  featureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  featureIconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  featureTitle: { fontSize: 15, fontWeight: TYPE.semibold, color: '#fff', marginBottom: 2 },
  featureDesc: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.4)', lineHeight: 16 },

  /* Step rows */
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  stepBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  stepNumber: { fontSize: 14, fontWeight: TYPE.bold, color: '#fff' },
  stepTitle: { fontSize: 15, fontWeight: TYPE.semibold, color: '#fff', marginBottom: 2 },
  stepDesc: { fontSize: TYPE.sm, color: 'rgba(255,255,255,0.4)', lineHeight: 16 },
});
