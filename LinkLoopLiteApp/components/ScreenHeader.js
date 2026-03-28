import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import TYPE from '../config/typography';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

/**
 * Unified screen header with themed bloom-gradient glow bar.
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
      {/* Bloom-style gradient glow bar */}
      <View style={styles.glowBarWrap}>
        <LinearGradient
          colors={[accent, gradient[1] || accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.accentBar}
        />
        {/* Bloom glow underneath the bar */}
        <View style={[styles.bloomGlow, { backgroundColor: accent }]} />
      </View>

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
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  glowBarWrap: {
    position: 'relative',
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  bloomGlow: {
    position: 'absolute',
    top: 0,
    left: '10%',
    right: '10%',
    height: 20,
    opacity: 0.15,
    borderRadius: 20,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
  },
  title: {
    fontSize: 26,
    fontWeight: TYPE.extrabold,
    color: '#fff',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: TYPE.md,
    color: 'rgba(255,255,255,0.70)',
    lineHeight: 20,
  },
});
