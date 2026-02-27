import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { dexcomAPI } from '../services/api';

export default function DexcomConnectScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [region, setRegion] = useState('us');
  const [connecting, setConnecting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleConnect = async () => {
    if (!username.trim()) {
      Alert.alert('Required', 'Please enter your Dexcom username or email.');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Required', 'Please enter your Dexcom password.');
      return;
    }

    setConnecting(true);
    try {
      await dexcomAPI.connectShare(username.trim(), password, region);
      Alert.alert(
        'Connected! 🎉',
        'Dexcom Share is connected. Your glucose readings will sync automatically every 5 minutes.',
        [{ text: 'Got it', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      const msg = err.message || '';
      if (msg.toLowerCase().includes('account not found') || msg.toLowerCase().includes('invalid')) {
        Alert.alert(
          'Login Failed',
          'Username or password is incorrect. Make sure you\'re using your Dexcom account credentials (not Apple/Google sign-in).'
        );
      } else if (msg.toLowerCase().includes('follower')) {
        Alert.alert(
          'Follower Required',
          'Dexcom Share requires at least one follower set up in the Dexcom app. Open your Dexcom app → Share → Invite Follower, then try again.'
        );
      } else {
        Alert.alert('Connection Failed', msg || 'Could not connect to Dexcom Share. Please check your credentials and try again.');
      }
    } finally {
      setConnecting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <LinearGradient
          colors={['#00D4AA', '#0099CC']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.headerIcon}>🩸</Text>
          <Text style={styles.headerTitle}>Connect Dexcom CGM</Text>
          <Text style={styles.headerSub}>Real-time glucose · Same feed as the Follow app</Text>
        </LinearGradient>

        <View style={styles.formCard}>
          {/* How it works */}
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>How it works</Text>
            <Text style={styles.infoText}>
              LinkLoop connects to the same real-time feed used by the Dexcom Follow app. 
              Enter your Dexcom account credentials below — your glucose readings will appear 
              within seconds of each sensor update.
            </Text>
          </View>

          {/* Username */}
          <Text style={styles.label}>Dexcom Username or Email</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="e.g. john.doe or john@email.com"
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
          />

          {/* Password */}
          <Text style={styles.label}>Dexcom Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              placeholder="Your Dexcom password"
              placeholderTextColor="#555"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword(v => !v)}
            >
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>

          {/* Region */}
          <Text style={styles.label}>Account Region</Text>
          <View style={styles.regionRow}>
            <TouchableOpacity
              style={[styles.regionBtn, region === 'us' && styles.regionBtnActive]}
              onPress={() => setRegion('us')}
            >
              <Text style={styles.regionFlag}>🇺🇸</Text>
              <Text style={[styles.regionBtnText, region === 'us' && styles.regionBtnTextActive]}>USA</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.regionBtn, region === 'ous' && styles.regionBtnActive]}
              onPress={() => setRegion('ous')}
            >
              <Text style={styles.regionFlag}>🌍</Text>
              <Text style={[styles.regionBtnText, region === 'ous' && styles.regionBtnTextActive]}>Outside USA</Text>
            </TouchableOpacity>
          </View>

          {/* Connect button */}
          <TouchableOpacity
            style={[styles.connectButton, connecting && styles.connectButtonDisabled]}
            onPress={handleConnect}
            disabled={connecting}
          >
            {connecting ? (
              <View style={styles.connectButtonInner}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.connectButtonText}>Connecting…</Text>
              </View>
            ) : (
              <Text style={styles.connectButtonText}>Connect Dexcom →</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelLink} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelLinkText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* Security note */}
        <View style={styles.securityNote}>
          <Text style={styles.securityIcon}>🔒</Text>
          <Text style={styles.securityText}>
            Your Dexcom credentials are encrypted before storage and never shared. 
            LinkLoop only reads glucose data — it cannot modify your Dexcom account.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 30,
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 52,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  headerSub: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: '#1C1C1E',
    margin: 16,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  infoBox: {
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 170, 0.3)',
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00D4AA',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoText: {
    fontSize: 13,
    color: '#C0C0C0',
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E0E0E0',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 52,
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
    top: 12,
    padding: 2,
  },
  eyeIcon: {
    fontSize: 20,
  },
  regionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  regionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2C2C2E',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  regionBtnActive: {
    backgroundColor: 'rgba(0, 212, 170, 0.15)',
    borderColor: '#00D4AA',
  },
  regionFlag: {
    fontSize: 18,
  },
  regionBtnText: {
    fontSize: 14,
    color: '#A0A0A0',
    fontWeight: '600',
  },
  regionBtnTextActive: {
    color: '#00D4AA',
  },
  connectButton: {
    backgroundColor: '#00D4AA',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  connectButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  connectButtonText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#fff',
  },
  cancelLink: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  cancelLinkText: {
    fontSize: 15,
    color: '#666',
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 30,
    gap: 10,
  },
  securityIcon: {
    fontSize: 16,
    marginTop: 1,
  },
  securityText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
});
