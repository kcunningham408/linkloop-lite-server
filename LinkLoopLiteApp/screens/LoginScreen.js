import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { pingServer } from '../services/api';

export default function LoginScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [loginMethod, setLoginMethod] = useState('email'); // 'email' or 'phone'
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const nameRef = useRef(null);
  const identifierRef = useRef(null);
  const passwordRef = useRef(null);

  const { login, register } = useAuth();

  // Wake up the Render server as soon as the login screen appears —
  // by the time the user fills in their details, the dyno should be warm.
  useEffect(() => {
    pingServer();
  }, []);

  const handleSubmit = async () => {
    if (!identifier || !password || (!isLogin && !name)) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      if (isLogin) {
        await login(identifier, password);
      } else {
        await register(identifier, password, name, 'warrior');
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const switchMethod = () => {
    setLoginMethod(loginMethod === 'email' ? 'phone' : 'email');
    setIdentifier('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient colors={['#4A90D9', '#3A7BC8']} style={styles.header}>
        <Text style={styles.logo}>∞ LinkLoop</Text>
        <Text style={styles.tagline}>Stay Connected, Stay in Range</Text>
      </LinearGradient>

      <ScrollView style={styles.formContainer} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{isLogin ? 'Welcome Back!' : 'Create Account'}</Text>
        <Text style={styles.subtitle}>
          {isLogin ? 'Sign in to continue' : 'Join the T1D community'}
        </Text>

        {/* Email / Phone Toggle */}
        <View style={styles.methodToggle}>
          <TouchableOpacity
            style={[styles.methodTab, loginMethod === 'email' && styles.methodTabActive]}
            onPress={() => { setLoginMethod('email'); setIdentifier(''); }}
          >
            <Text style={[styles.methodTabText, loginMethod === 'email' && styles.methodTabTextActive]}>
              📧 Email
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.methodTab, loginMethod === 'phone' && styles.methodTabActive]}
            onPress={() => { setLoginMethod('phone'); setIdentifier(''); }}
          >
            <Text style={[styles.methodTabText, loginMethod === 'phone' && styles.methodTabTextActive]}>
              📱 Phone
            </Text>
          </TouchableOpacity>
        </View>

        {!isLogin && (
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Name</Text>
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
            returnKeyType={loginMethod === 'phone' ? 'done' : 'next'}
            blurOnSubmit={false}
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          {loginMethod === 'phone' && (
            <TouchableOpacity
              style={styles.nextFieldButton}
              onPress={() => passwordRef.current?.focus()}
            >
              <Text style={styles.nextFieldButtonText}>Next →</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              ref={passwordRef}
              style={styles.passwordInput}
              placeholder="••••••••"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>
              {isLogin ? 'Sign In' : 'Create Account'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.switchButton} onPress={() => { setIsLogin(!isLogin); }}>
          <Text style={styles.switchText}>
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <Text style={styles.switchTextBold}>
              {isLogin ? 'Sign Up' : 'Sign In'}
            </Text>
          </Text>
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
  tagline: { fontSize: 16, color: '#fff', opacity: 0.9 },
  formContainer: { flex: 1, padding: 25, paddingTop: 30 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#A0A0A0', marginBottom: 20 },
  methodToggle: { flexDirection: 'row', backgroundColor: '#2C2C2E', borderRadius: 12, padding: 4, marginBottom: 20 },
  methodTab: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  methodTabActive: { backgroundColor: '#4A90D9' },
  methodTabText: { fontSize: 15, color: '#A0A0A0', fontWeight: '600' },
  methodTabTextActive: { color: '#fff' },
  inputContainer: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#E0E0E0', marginBottom: 8 },
  input: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 15, fontSize: 16, borderWidth: 1, borderColor: '#2C2C2E', color: '#fff' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C1E', borderRadius: 12, borderWidth: 1, borderColor: '#2C2C2E' },
  passwordInput: { flex: 1, padding: 15, fontSize: 16, color: '#fff' },
  eyeButton: { paddingHorizontal: 14, paddingVertical: 12 },
  eyeIcon: { fontSize: 20 },
  submitButton: { backgroundColor: '#4A90D9', borderRadius: 12, padding: 18, alignItems: 'center', marginTop: 10 },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  nextFieldButton: { alignSelf: 'flex-end', marginTop: 8, paddingVertical: 6, paddingHorizontal: 14, backgroundColor: '#2C2C2E', borderRadius: 8 },
  nextFieldButtonText: { color: '#4A90D9', fontSize: 14, fontWeight: '600' },
  switchButton: { marginTop: 25, alignItems: 'center' },
  switchText: { fontSize: 15, color: '#A0A0A0' },
  switchTextBold: { color: '#4A90D9', fontWeight: 'bold' },
});
