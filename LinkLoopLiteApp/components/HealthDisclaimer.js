import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DISCLAIMER_KEY = '@linkloop_disclaimer_accepted';

export default function HealthDisclaimer() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    checkDisclaimer();
  }, []);

  const checkDisclaimer = async () => {
    try {
      const accepted = await AsyncStorage.getItem(DISCLAIMER_KEY);
      if (!accepted) setVisible(true);
    } catch (err) {
      setVisible(true);
    }
  };

  const handleAccept = async () => {
    try {
      await AsyncStorage.setItem(DISCLAIMER_KEY, 'true');
    } catch (err) {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.icon}>💚</Text>
          <Text style={styles.title}>Welcome to LinkLoop</Text>

          <Text style={styles.text}>
            LinkLoop is a <Text style={styles.bold}>personal wellness journal</Text> designed to help you log and organize your Type 1 Diabetes information in one place.
          </Text>

          <View style={styles.divider} />

          <Text style={styles.text}>
            LinkLoop is <Text style={styles.bold}>NOT a medical device</Text>. It is a personal logging and sharing tool — like a digital notebook for your T1D journey.
          </Text>

          <Text style={styles.text}>
            • All data is self-entered by you — we don't connect to any medical devices{'\n'}
            • Insights are pattern observations from your own entries{'\n'}
            • This app does not diagnose, treat, or monitor any condition{'\n'}
            • Always work with your care team for health decisions
          </Text>

          <View style={styles.divider} />

          <Text style={styles.textSmall}>
            By continuing, you acknowledge that LinkLoop is a personal wellness journal and agree to our Terms of Service and Privacy Policy.
          </Text>

          <TouchableOpacity style={styles.acceptButton} onPress={handleAccept}>
            <Text style={styles.acceptButtonText}>I Understand</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 25, width: '100%', maxWidth: 400, alignItems: 'center', borderWidth: 1, borderColor: '#2C2C2E' },
  icon: { fontSize: 48, marginBottom: 15 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 15, textAlign: 'center' },
  text: { fontSize: 14, color: '#C0C0C0', lineHeight: 22, marginBottom: 12, textAlign: 'left', width: '100%' },
  textSmall: { fontSize: 12, color: '#888', lineHeight: 18, marginBottom: 15, textAlign: 'center' },
  bold: { fontWeight: 'bold', color: '#fff' },
  divider: { width: '100%', height: 1, backgroundColor: '#2C2C2E', marginVertical: 10 },
  acceptButton: { backgroundColor: '#4A90D9', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 10, width: '100%', alignItems: 'center', marginTop: 5 },
  acceptButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
