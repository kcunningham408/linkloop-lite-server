import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { pingServer, circleAPI } from '../services/api';

// mode: 'login' | 'register' | 'join'
export default function LoginScreen() {
  const [mode, setMode] = useState('login');
  const [loginMethod, setLoginMethod] = useState('email');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const nameRef = useRef(null);
  const identifierRef = useRef(null);
  const passwordRef = useRef(null);
  const inviteRef = useRef(null);

  const { login, register } = useAuth();

  useEffect(() => {
    pingServer();
  }, []);

  const resetFields = (newMode) => {
    setMode(newMode);
    setIdentifier('');
    setPassword('');
    setName('');
    setInviteCode('');
    setShowPassword(false);
    setLoginMethod('email');
  };

  const handleSubmit = async () => {
    if (mode === 'login') {
      if (!identifier || !password) {
        Alert.alert('Error', 'Please enter your email/phone and password');
        return;
      }
      setIsLoading(true);
      try {
        await login(identifier, password);
      } catch (err) {
        Alert.alert('Sign In Failed', err.message || 'Check your credentials and try again');
      } finally {
        setIsLoading(false);
      }

    } else if (mode === 'register') {
      if (!identifier || !password || !name) {
        Alert.alert('Error', 'Please fill in all fields');
        return;
      }
      setIsLoading(true);
      try {
        await register(identifier, password, name, 'warrior');
      } catch (err) {
        Alert.alert('Sign Up Failed', err.message || 'Something went wrong');
      } finally {
        setIsLoading(false);
      }

    } else if (mode === 'join') {
      if (!inviteCode || !name || !identifier || !password) {
        Alert.alert('Error', 'Please fill in all fields');
        return;
      }
      setIsLoading(true);
      try {
        // 1. Create the account (role will be upgraded to 'member' by joinCircle)
        await register(identifier, password, name, 'member');
        // 2. Join the circle — auth token is set by register so this is ready to go
        await circleAPI.joinCircle(inviteCode.trim().toUpperCase());
      } catch (err) {
        Alert.alert('Join Failed', err.message || 'Invalid invite code or sign-up issue');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const isJoin = mode === 'join';
  const isLogin = mode === 'login';
  const accentColor = isJoin ? '#34C759' : '#4A90D9';
  const gradientColors = isJoin ? ['#1A3A22', '#0F2017'] : ['#4A90D9', '#3A7BC8'];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient colors={gradientColors} style={styles.header}>
        <Text style={styles.logo}>\u221e LinkLoop</Text>
        <Text style={styles.tagline}>
          {isJoin ? "You've been invited to a Loop" : 'Stay Connected, Stay in Range'}
        </Text>
      </LinearGradient>

      <ScrollView style={styles.formContainer} keyboardShouldPersistTaps="handled">

        {/* Mode selector: 3 tabs */}
        <View style={styles.modeTabs}>
          <TouchableOpacity
            style={[styles.modeTab, mode === 'login' && styles.modeTabActive]}
            onPress={() => resetFields('login')}
          >
            <Text style={[styles.modeTabText, mode === 'login' && styles.modeTabTextActive]}>
              Sign In
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, mode === 'register' && styles.modeTabActive]}
            onPress={() => resetFields('register')}
          >
            <Text style={[styles.modeTabText, mode === 'register' && styles.modeTabTextActive]}>
              Sign Up
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, mode === 'join' && styles.modeTabJoinActive]}
            onPress={() => resetFields('join')}
          >
            <Text style={[styles.modeTabText, mode === 'join' && styles.modeTabTextActive]}>
              Join a Loop
            </Text>
          </TouchableOpacity>
        </View>

        {/* Join banner */}
        {isJoin && (
          <View style={styles.joinBanner}>
            <Text style={styles.joinBannerEmoji}>\U0001f49a</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.joinBannerTitle}>Someone invited you!</Text>
              <Text style={styles.joinBannerSub}>
                Enter the invite code they sent you, then create your account.
                You'll be connected automatically.
              </Text>
            </View>
          </View>
        )}

        {/* Invite code field — Join mode only, shown first */}
        {isJoin && (
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Invite Code</Text>
            <TextInput
              ref={inviteRef}
              style={[styles.input, styles.inviteCodeInput]}
              placeholder="e.g. A1B2C3D4"
              placeholderTextColor="#2A6B3A"
              value={inviteCode}
              onChangeText={(t) => setInviteCode(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={8}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => nameRef.current?.focus()}
            />
          </View>
        )}

        {/* Name field — register + join modes */}
        {!isLogin && (
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Your Name</Text>
            <TextInput
              ref={nameRef}
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor="#666"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => identifierRef.current?.focus()}
            />
          </View>
        )}

        {/* Email / Phone toggle */}
        <View style={styles.methodToggle}>
          <TouchableOpacity
            style={[styles.methodTab, loginMethod === 'email' && [styles.methodTabActive, { backgroundColor: accentColor }]]}
            onPress={() => { setLoginMethod('email'); setIdentifier(''); }}
          >
            <Text style={[styles.methodTabText, loginMethod === 'email' && styles.methodTabTextActive]}>
              Email
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.methodTab, loginMethod === 'phone' && [styles.methodTabActive, { backgroundColor: accentColor }]]}
            onPress={() => { setLoginMethod('phone'); setIdentifier(''); }}
          >
            <Text style={[styles.methodTabText, loginMethod === 'phone' && styles.methodTabTextActive]}>
              Phone
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{loginMethod === 'email' ? 'Email' : 'Phone Number'}</Text>
          <TextInput
            ref={identifierRef}
            style={styles.input}
            placeholder={loginMethod === 'email' ? 'your@email.com' : '(555) 123-4567'}
            placeholderTextColor="#666"
            value={identifier}
            onChangeText={setIdentifier}
            keyboardType={loginMethod === 'email' ? 'email-address' : 'phone-pad'}
            autoCapitalize="none"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              ref={passwordRef}
              style={styles.passwordInput}
              placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
              <Text style={styles.eyeIcon}>{showPassword ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>
          {!isLogin && (
            <Text style={styles.passwordHint}>At least 6 characters</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: accentColor }]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>
              {mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Join the Loop'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111111' },
  header: { paddingTop: 60, paddingBottom: 40, alignItems: 'center' },
  logo: { fontSize: 42, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  tagline: { fontSize: 16, color: '#fff', opacity: 0.9, textAlign: 'center', paddingHorizontal: 20 },
  formContainer: { flex: 1, padding: 25, paddingTop: 20 },

  modeTabs: { flexDirection: 'row', backgroundColor: '#2C2C2E', borderRadius: 12, padding: 4, marginBottom: 24 },
  modeTab: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  modeTabActive: { backgroundColor: '#4A90D9' },
  modeTabJoinActive: { backgroundColor: '#34C759' },
  modeTabText: { fontSize: 13, color: '#A0A0A0', fontWeight: '600' },
  modeTabTextActive: { color: '#fff' },

  joinBanner: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#0D2B15',
    borderRadius: 12, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: '#1A4A26', gap: 12,
  },
  joinBannerEmoji: { fontSize: 28 },
  joinBannerTitle: { fontSize: 15, fontWeight: '700', color: '#34C759', marginBottom: 4 },
  joinBannerSub: { fontSize: 13, color: '#A0C8A8', lineHeight: 18 },

  methodToggle: { flexDirection: 'row', backgroundColor: '#2C2C2E', borderRadius: 12, padding: 4, marginBottom: 20 },
  methodTab: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  methodTabActive: {},
  methodTabText: { fontSize: 15, color: '#A0A0A0', fontWeight: '600' },
  methodTabTextActive: { color: '#fff' },

  inputContainer: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#E0E0E0', marginBottom: 8 },
  input: {
    backgroundColor: '#1C1C1E', borderRadius: 12, padding: 15,
    fontSize: 16, borderWidth: 1, borderColor: '#2C2C2E', color: '#fff',
  },
  inviteCodeInput: {
    fontSize: 24, textAlign: 'center', letterSpacing: 6,
    fontWeight: 'bold', color: '#34C759', borderColor: '#34C759',
  },
  passwordRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C1E',
    borderRadius: 12, borderWidth: 1, borderColor: '#2C2C2E',
  },
  passwordInput: { flex: 1, padding: 15, fontSize: 16, color: '#fff' },
  eyeButton: { paddingHorizontal: 14, paddingVertical: 12 },
  eyeIcon: { fontSize: 14, color: '#A0A0A0', fontWeight: '600' },
  passwordHint: { fontSize: 12, color: '#666', marginTop: 6 },

  submitButton: { borderRadius: 12, padding: 18, alignItems: 'center', marginTop: 10 },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
