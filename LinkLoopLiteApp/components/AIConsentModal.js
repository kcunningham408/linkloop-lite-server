import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import TYPE from '../config/typography';
import { useTheme } from '../context/ThemeContext';

const AI_CONSENT_KEY = '@linkloop_ai_consent_accepted';

export default function AIConsentModal() {
  const [visible, setVisible] = useState(false);
  const { palette } = useTheme();
  const accent = palette.warrior;

  useEffect(() => {
    checkConsent();
  }, []);

  const checkConsent = async () => {
    try {
      const accepted = await AsyncStorage.getItem(AI_CONSENT_KEY);
      if (!accepted) setVisible(true);
    } catch {
      setVisible(true);
    }
  };

  const handleAccept = async () => {
    try {
      await AsyncStorage.setItem(AI_CONSENT_KEY, 'true');
    } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.icon}>🤖</Text>
            <Text style={styles.title}>AI-Powered Insights</Text>

            <Text style={styles.text}>
              LinkLoop uses <Text style={styles.bold}>artificial intelligence</Text> to provide personalized glucose insights, trend analysis, daily motivation, and the Ask Loop chat feature.
            </Text>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>What data is shared</Text>
            <Text style={styles.text}>
              To generate personalized insights, the following data is sent to our AI provider:{'\n\n'}
              • Your <Text style={styles.bold}>glucose readings</Text> (values, timestamps, trends){'\n'}
              • Your <Text style={styles.bold}>mood entries</Text> (labels, notes, timestamps){'\n'}
              • Your <Text style={styles.bold}>display name</Text>{'\n'}
              • Your <Text style={styles.bold}>glucose threshold settings</Text>
            </Text>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Who processes your data</Text>
            <Text style={styles.text}>
              Your data is processed by <Text style={styles.bold}>Groq</Text>, a third-party AI service, using the <Text style={styles.bold}>Meta Llama</Text> language model. Your data is used only to generate your personalized responses and is not used to train AI models.
            </Text>

            <View style={styles.divider} />

            <Text style={styles.textSmall}>
              For more details, please review our{' '}
              <Text
                style={styles.link}
                onPress={() => Linking.openURL('https://vibecmd.com/linkloop/privacy')}
              >
                Privacy Policy
              </Text>
              . By tapping "I Agree" below, you consent to sharing the data described above with our AI provider for insight generation.
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { backgroundColor: 'rgba(30,30,50,0.45)', borderRadius: 16, padding: 25, width: '100%', maxWidth: 400, maxHeight: '85%', borderWidth: 1, borderColor: '#2E2E48' },
  icon: { fontSize: 48, marginBottom: 15, textAlign: 'center' },
  title: { fontSize: TYPE.xxl, fontWeight: TYPE.bold, color: '#fff', marginBottom: 15, textAlign: 'center' },
  sectionTitle: { fontSize: TYPE.lg, fontWeight: TYPE.bold, color: '#fff', marginBottom: 8 },
  text: { fontSize: TYPE.md, color: '#D0D0D0', lineHeight: 22, marginBottom: 12, textAlign: 'left', width: '100%' },
  textSmall: { fontSize: TYPE.sm, color: '#C8C8C8', lineHeight: 18, marginBottom: 15, textAlign: 'center' },
  bold: { fontWeight: TYPE.bold, color: '#fff' },
  link: { color: '#4A90D9', textDecorationLine: 'underline' },
  divider: { width: '100%', height: 1, backgroundColor: 'rgba(46,46,72,0.45)', marginVertical: 10 },
  acceptButton: { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 10, width: '100%', alignItems: 'center', marginTop: 5 },
  acceptButtonText: { color: '#fff', fontSize: TYPE.lg, fontWeight: TYPE.bold },
});
