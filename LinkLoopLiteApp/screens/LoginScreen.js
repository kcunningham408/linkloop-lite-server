import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView, Platform,
    ScrollView, StatusBar,
    StyleSheet, Text,
    TextInput, TouchableOpacity,
    View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { authAPI, circleAPI, pingServer } from '../services/api';

// mode: 'landing' | 'login' | 'register' | 'join' | 'forgot' | 'reset'
export default function LoginScreen() {
  const [mode, setMode] = useState('landing');
  const [loginMethod, setLoginMethod] = useState('email');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetIdentifier, setResetIdentifier] = useState('');

  const nameRef = useRef(null);
  const identifierRef = useRef(null);
  const passwordRef = useRef(null);
  const inviteRef = useRef(null);
  const resetCodeRef = useRef(null);
  const newPasswordRef = useRef(null);

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
    setResetCode('');
    setNewPassword('');
    if (newMode !== 'reset') setResetIdentifier('');
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
        await register(identifier, password, name, 'member');
        await circleAPI.joinCircle(inviteCode.trim().toUpperCase());
      } catch (err) {
        Alert.alert('Join Failed', err.message || 'Invalid invite code or sign-up issue');
      } finally {
        setIsLoading(false);
      }

    } else if (mode === 'forgot') {
      if (!identifier) {
        Alert.alert('Error', 'Please enter your email or phone number');
        return;
      }
      setIsLoading(true);
      try {
        await authAPI.forgotPassword(identifier);
        setResetIdentifier(identifier);
        setMode('reset');
        Alert.alert('Code Sent', 'Check your email for a 6-digit reset code. (In development, the code is returned in the response.)');
      } catch (err) {
        Alert.alert('Error', err.message || 'Could not send reset code');
      } finally {
        setIsLoading(false);
      }

    } else if (mode === 'reset') {
      if (!resetCode || !newPassword) {
        Alert.alert('Error', 'Please enter the reset code and a new password');
        return;
      }
      if (newPassword.length < 6) {
        Alert.alert('Error', 'Password must be at least 6 characters');
        return;
      }
      setIsLoading(true);
      try {
        const data = await authAPI.resetPassword(resetIdentifier, resetCode.trim(), newPassword);
        if (data.token) {
          // Auto-login
          await login(resetIdentifier, newPassword);
        }
        Alert.alert('Success', 'Your password has been reset!');
      } catch (err) {
        Alert.alert('Reset Failed', err.message || 'Invalid code or something went wrong');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const isJoin = mode === 'join';
  const isRegister = mode === 'register';
  const isLogin = mode === 'login';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';

  // ── Hero section shown when no form is active (landing) ──────────
  const renderHero = () => (
    <View style={styles.heroSection}>
      <View style={styles.logoRow}>
        <Text style={styles.logoSymbol}>∞</Text>
        <Text style={styles.logoText}>LinkLoop</Text>
      </View>
      <Text style={styles.tagline}>Real-time glucose sharing{'\n'}for T1D warriors and the people who care</Text>

      {/* Primary CTAs */}
      <TouchableOpacity style={styles.btnSignIn} onPress={() => resetFields('login')}>
        <Text style={styles.btnSignInText}>Sign In</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnJoinCircle} onPress={() => resetFields('join')}>
        <Text style={styles.btnJoinCircleText}>Join a Circle</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => resetFields('register')} style={styles.signUpLink}>
        <Text style={styles.signUpLinkText}>
          New T1D Warrior?{'  '}
          <Text style={styles.signUpLinkBold}>Create an account</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );

  // ── Shared form fields ────────────────────────────────────────────
  const renderForm = () => (
    <View style={styles.formCard}>

      {/* Back button */}
      <TouchableOpacity onPress={() => resetFields('landing')} style={styles.backBtn}>
        <Text style={styles.backBtnText}>←  Back</Text>
      </TouchableOpacity>

      {/* Form title */}
      <Text style={styles.formTitle}>
        {isLogin ? 'Welcome back' : isRegister ? 'Create your account' : isForgot ? 'Forgot Password' : isReset ? 'Reset Password' : 'Join a Care Circle'}
      </Text>
      {isLogin && (
        <Text style={styles.formSubtitle}>Sign in to your LinkLoop account</Text>
      )}
      {isRegister && (
        <Text style={styles.formSubtitle}>Start sharing your glucose data with loved ones</Text>
      )}
      {isJoin && (
        <Text style={styles.formSubtitle}>Enter your invite code to get connected automatically</Text>
      )}
      {isForgot && (
        <Text style={styles.formSubtitle}>Enter your email or phone and we'll send you a reset code</Text>
      )}
      {isReset && (
        <Text style={styles.formSubtitle}>Enter the 6-digit code and your new password</Text>
      )}

      {/* Invite code — join only */}
      {isJoin && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Invite Code</Text>
          <TextInput
            ref={inviteRef}
            style={[styles.input, styles.inviteInput]}
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

      {/* Name — register + join */}
      {(isRegister || isJoin) && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Your Name</Text>
          <TextInput
            ref={nameRef}
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor="#555"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => identifierRef.current?.focus()}
          />
        </View>
      )}

      {/* Email / Phone toggle — not shown on reset mode */}
      {!isReset && (
        <View style={styles.methodToggle}>
          <TouchableOpacity
            style={[styles.methodTab, loginMethod === 'email' && styles.methodTabActive]}
            onPress={() => { setLoginMethod('email'); setIdentifier(''); }}
          >
            <Text style={[styles.methodTabText, loginMethod === 'email' && styles.methodTabActiveText]}>Email</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.methodTab, loginMethod === 'phone' && styles.methodTabActive]}
            onPress={() => { setLoginMethod('phone'); setIdentifier(''); }}
          >
            <Text style={[styles.methodTabText, loginMethod === 'phone' && styles.methodTabActiveText]}>Phone</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isReset && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{loginMethod === 'email' ? 'Email' : 'Phone Number'}</Text>
          <TextInput
            ref={identifierRef}
            style={styles.input}
            placeholder={loginMethod === 'email' ? 'your@email.com' : '(555) 123-4567'}
            placeholderTextColor="#555"
            value={identifier}
            onChangeText={setIdentifier}
            keyboardType={loginMethod === 'email' ? 'email-address' : 'phone-pad'}
            autoCapitalize="none"
            returnKeyType={isForgot ? 'go' : 'next'}
            blurOnSubmit={isForgot}
            onSubmitEditing={() => isForgot ? handleSubmit() : passwordRef.current?.focus()}
          />
        </View>
      )}

      {/* Password — login, register, join only */}
      {!isForgot && !isReset && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              ref={passwordRef}
              style={styles.passwordInput}
              placeholder="Password"
              placeholderTextColor="#555"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
              <Text style={styles.eyeBtnText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>
          {!isLogin && <Text style={styles.hint}>At least 6 characters</Text>}
        </View>
      )}

      {/* Reset code + new password — reset mode only */}
      {isReset && (
        <>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>6-Digit Reset Code</Text>
            <TextInput
              ref={resetCodeRef}
              style={[styles.input, { textAlign: 'center', letterSpacing: 6, fontSize: 22, fontWeight: '800' }]}
              placeholder="000000"
              placeholderTextColor="#555"
              value={resetCode}
              onChangeText={setResetCode}
              keyboardType="number-pad"
              maxLength={6}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => newPasswordRef.current?.focus()}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>New Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                ref={newPasswordRef}
                style={styles.passwordInput}
                placeholder="New password"
                placeholderTextColor="#555"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPassword}
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
                <Text style={styles.eyeBtnText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>At least 6 characters</Text>
          </View>
        </>
      )}

      {/* Submit */}
      <TouchableOpacity
        style={[
          styles.submitBtn,
          isJoin && styles.submitBtnGreen,
        ]}
        onPress={handleSubmit}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitBtnText}>
            {isLogin ? 'Sign In' : isRegister ? 'Create Account' : isForgot ? 'Send Reset Code' : isReset ? 'Reset Password' : 'Join Circle'}
          </Text>
        )}
      </TouchableOpacity>

      {/* Sign up / sign in crosslinks */}
      {isLogin && (
        <>
          <TouchableOpacity onPress={() => resetFields('forgot')} style={styles.crossLink}>
            <Text style={styles.crossLinkText}>
              <Text style={styles.crossLinkBold}>Forgot Password?</Text>
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => resetFields('register')} style={styles.crossLink}>
            <Text style={styles.crossLinkText}>
              New here?{'  '}<Text style={styles.crossLinkBold}>Create a free account</Text>
            </Text>
          </TouchableOpacity>
        </>
      )}
      {isRegister && (
        <TouchableOpacity onPress={() => resetFields('login')} style={styles.crossLink}>
          <Text style={styles.crossLinkText}>
            Already have an account?{'  '}<Text style={styles.crossLinkBold}>Sign In</Text>
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ── Landing mode: no form shown yet ──────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={isJoin ? ['#0B2010', '#111111'] : ['#0D1B2E', '#111111']}
        style={styles.gradient}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Show small top logo only when a form is open */}
          {(isLogin || isRegister || isJoin || isForgot || isReset) && (
            <View style={styles.topLogo}>
              <Text style={styles.topLogoSymbol}>∞</Text>
              <Text style={styles.topLogoText}>LinkLoop</Text>
            </View>
          )}

          {/* Landing CTAs or form */}
          {isLogin || isRegister || isJoin || isForgot || isReset ? renderForm() : renderHero()}
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 40 },

  // ── Top logo (shown always) ──
  topLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 70,
    paddingBottom: 10,
    gap: 10,
  },
  topLogoSymbol: {
    fontSize: 38,
    fontWeight: '900',
    color: '#4A90D9',
  },
  topLogoText: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },

  // ── Hero / landing ──
  heroSection: {
    paddingHorizontal: 30,
    paddingTop: 30,
    alignItems: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  logoSymbol: { fontSize: 52, fontWeight: '900', color: '#4A90D9' },
  logoText: { fontSize: 46, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  tagline: {
    fontSize: 17,
    color: '#A0A0A0',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 48,
  },

  btnSignIn: {
    width: '100%',
    backgroundColor: '#4A90D9',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 14,
  },
  btnSignInText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  btnJoinCircle: {
    width: '100%',
    backgroundColor: 'transparent',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#34C759',
    marginBottom: 32,
  },
  btnJoinCircleText: { color: '#34C759', fontSize: 17, fontWeight: '700' },

  signUpLink: { paddingVertical: 8 },
  signUpLinkText: { color: '#666', fontSize: 14, textAlign: 'center' },
  signUpLinkBold: { color: '#4A90D9', fontWeight: '700' },

  // ── Form card ──
  formCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  backBtn: { marginBottom: 20 },
  backBtnText: { color: '#4A90D9', fontSize: 15, fontWeight: '600' },
  formTitle: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 6 },
  formSubtitle: { fontSize: 14, color: '#777', marginBottom: 28, lineHeight: 20 },

  methodToggle: {
    flexDirection: 'row',
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    padding: 3,
    marginBottom: 20,
  },
  methodTab: {
    flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
  },
  methodTabActive: { backgroundColor: '#4A90D9' },
  methodTabText: { fontSize: 14, color: '#777', fontWeight: '600' },
  methodTabActiveText: { color: '#fff' },

  inputGroup: { marginBottom: 18 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#999', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    color: '#fff',
  },
  inviteInput: {
    fontSize: 22,
    textAlign: 'center',
    letterSpacing: 8,
    fontWeight: '800',
    color: '#34C759',
    borderColor: '#34C759',
    borderWidth: 2,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  passwordInput: { flex: 1, padding: 15, fontSize: 16, color: '#fff' },
  eyeBtn: { paddingHorizontal: 16, paddingVertical: 12 },
  eyeBtnText: { color: '#555', fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12, color: '#555', marginTop: 6 },

  submitBtn: {
    backgroundColor: '#4A90D9',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  submitBtnGreen: { backgroundColor: '#34C759' },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  crossLink: { paddingTop: 20, alignItems: 'center' },
  crossLinkText: { color: '#555', fontSize: 14 },
  crossLinkBold: { color: '#4A90D9', fontWeight: '700' },
});
