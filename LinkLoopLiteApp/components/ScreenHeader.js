import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

/**
 * Unified screen header with themed accent gradient bar.
 *
 * Props:
 *   title    – string (required)
 *   subtitle – string (optional)
 *   children – optional extra content rendered below the subtitle
 */
export default function ScreenHeader({ title, subtitle, children }) {
  const { user } = useAuth();
  const { getAccent, getGradient } = useTheme();
  const isMember = user?.role === 'member';
  const accent = getAccent(isMember);
  const gradient = getGradient(isMember);

  return (
    <View style={styles.wrapper}>
      {/* Accent gradient bar */}
      <LinearGradient
        colors={[accent, gradient[1] || accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.accentBar}
      />

      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#1C1C1E',
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
    overflow: 'hidden',
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#A0A0A0',
    lineHeight: 20,
  },
});
