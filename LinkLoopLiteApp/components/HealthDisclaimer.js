import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import TYPE from '../config/typography';
import { useTheme } from '../context/ThemeContext';

const DISCLAIMER_KEY = '@linkloop_disclaimer_accepted';
const AI_CONSENT_KEY = '@linkloop_ai_consent_accepted';

export default function HealthDisclaimer() {
  const [visible, setVisible] = useState(false);
  const { palette } = useTheme();
  const accent = palette.warrior;

  useEffect(() => {
    checkDisclaimer();
  }, []);

  const checkDisclaimer = async () => {
    try {
      const accepted = await AsyncStorage.getItem(DISCLAIMER_KEY);
      const aiAccepted = await AsyncStorage.getItem(AI_CONSENT_KEY);
      if (!accepted || !aiAccepted) setVisible(true);
    } catch (err) {
      setVisible(true);
    }
  };

  const handleAccept = async () => {
    try {
      await AsyncStorage.setItem(DISCLAIMER_KEY, 'true');
      await AsyncStorage.setItem(AI_CONSENT_KEY, 'true');
    } catch (err) {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.icon}>💚</Text>
            <Text style={styles.title}>Welcome to LinkLoop</Text>

            <Text style={styles.text}>
              LinkLoop is a <Text style={styles.bold}>personal wellness journal</Text> designed to help you log and organize your Type 1 Diabetes information in one place.
            </Text>

            <Text style={styles.text}>
              LinkLoop is <Text style={styles.bold}>NOT a medical device</Text>. It is a personal logging and sharing tool — like a digital notebook for your T1D journey.
            </Text>

            <Text style={styles.text}>
              • Insights are pattern observations from your own entries{'\n'}
              • This app does not diagnose, treat, or monitor any condition{'\n'}
              • Always work with your care team for health decisions
            </Text>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>🤖 AI-Powered Insights</Text>
            <Text style={styles.text}>
              LinkLoop uses <Text style={styles.bold}>AI</Text> to provide personalized glucose insights, trend analysis, and the Ask Loop chat feature. To do this, your glucose readings, mood entries, and threshold settings are sent to <Text style={styles.bold}>Groq</Text> (a third-party AI service using <Text style={styles.bold}>Meta Llama</Text>). Your data is not used to train AI models.
            </Text>

            <View style={styles.divider} />

            <Text style={styles.textSmall}>
              By tapping "I Agree" below, you acknowledge that LinkLoop is a personal wellness journal, consent to AI data processing described above, and agree to our{' '}
              <Text
                style={styles.link}
                onPress={() => Linking.openURL('https://vibecmd.com/linkloop/privacy')}
              >
                Privacy Policy
              </Text>
              .
            </Text>

            <TouchableOpacity style={[styles.acceptButton, { backgroundColor: accent }]} onPress={handleAccept}>
              <Text style={styles.acceptButtonText}>I Agree</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { backgroundColor: '#1A1A2E', borderRadius: 16, padding: 25, width: '100%', maxWidth: 400, maxHeight: '85%', borderWidth: 1, borderColor: '#2E2E48' },
  icon: { fontSize: 48, marginBottom: 15, textAlign: 'center' },
  title: { fontSize: TYPE.xxl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 15, textAlign: 'center' },
  sectionTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff', marginBottom: 8 },
  text: { fontSize: TYPE.md, color: '#D0D0D0', lineHeight: 22, marginBottom: 12 },
  textSmall: { fontSize: TYPE.sm, color: '#C8C8C8', lineHeight: 18, marginBottom: 15, textAlign: 'center' },
  bold: { fontWeight: TYPE.bold, color: '#fff' },
  link: { color: '#4A90D9', textDecorationLine: 'underline' },
  divider: { width: '100%', height: 1, backgroundColor: 'rgba(46,46,72,0.8)', marginVertical: 10 },
  acceptButton: { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 10, alignItems: 'center', marginTop: 5 },
  acceptButtonText: { color: '#fff', fontSize: TYPE.lg, fontWeight: TYPE.bold },
});
