/**
 * BloomBackground — Soft radial gradient blobs inspired by the V6 Gradient Bloom icon.
 *
 * Renders overlapping, blurred elliptical gradient "blobs" behind content to
 * create the dreamy, luminous depth effect from the app icon.
 *
 * Usage:
 *   <BloomBackground accent="#4A90D9" secondary="#34C759">
 *     <YourContent />
 *   </BloomBackground>
 *
 *   <BloomBackground accent="#4A90D9" secondary="#34C759" variant="hero" />
 */

import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

export default function BloomBackground({
  children,
  accent = '#4A90D9',
  secondary = '#34C759',
  tertiary = '#9B59B6',
  variant = 'default',    // 'default' | 'hero' | 'login' | 'subtle'
  style,
  contentStyle,
}) {
  // Opacity intensities per variant
  const intensity = {
    default: { a: 0.20, b: 0.14, c: 0.06 },
    hero:    { a: 0.28, b: 0.18, c: 0.08 },
    login:   { a: 0.22, b: 0.16, c: 0.10 },
    subtle:  { a: 0.10, b: 0.08, c: 0.04 },
  }[variant] || { a: 0.20, b: 0.14, c: 0.06 };

  // Helper to turn hex + opacity into rgba
  const rgba = (hex, opacity) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${opacity})`;
  };

  return (
    <View style={[styles.container, style]}>
      {/* Base dark layer */}
      <View style={styles.base} />

      {/* Primary accent blob — upper-left */}
      <View
        style={[
          styles.blob,
          styles.blobPrimary,
          { backgroundColor: rgba(accent, intensity.a) },
        ]}
      />

      {/* Secondary blob — lower-right */}
      <View
        style={[
          styles.blob,
          styles.blobSecondary,
          { backgroundColor: rgba(secondary, intensity.b) },
        ]}
      />

      {/* Tertiary bloom — center-bottom (subtle purple/violet) */}
      <View
        style={[
          styles.blob,
          styles.blobTertiary,
          { backgroundColor: rgba(tertiary, intensity.c) },
        ]}
      />

      {/* Radial overlay gradient — fades blobs into the dark base at edges */}
      <LinearGradient
        colors={['transparent', 'rgba(10,10,15,0.6)', '#0A0A0F']}
        locations={[0, 0.65, 1]}
        style={styles.fadeOverlay}
      />

      {/* Content — inherits padding + alignment from style via contentStyle */}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A0A0F',
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobPrimary: {
    width: 260,
    height: 260,
    top: -40,
    left: -30,
    opacity: 0.9,
    transform: [{ scaleX: 1.3 }],
  },
  blobSecondary: {
    width: 220,
    height: 220,
    bottom: -20,
    right: -20,
    opacity: 0.85,
    transform: [{ scaleX: 1.2 }],
  },
  blobTertiary: {
    width: 180,
    height: 180,
    bottom: 20,
    left: '30%',
    opacity: 0.7,
    transform: [{ scaleX: 1.4 }],
  },
  fadeOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
});
