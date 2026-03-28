/**
 * BloomBackground — scrim overlay only.
 * The background photo lives at the App.js root level.
 * This adds a per-screen dark scrim for text readability.
 *
 * Usage:
 *   <BloomBackground>
 *     <YourContent />
 *   </BloomBackground>
 *
 *   <BloomBackground variant="hero" />   ← overlay-only (no children)
 */

import { StyleSheet, View } from 'react-native';

export default function BloomBackground({
  children,
  variant = 'default',    // 'default' | 'hero' | 'login' | 'subtle'
  style,
  contentStyle,
  // Accept but ignore legacy props so callers don't break
  accent,
  secondary,
  tertiary,
}) {
  const scrimOpacity = {
    hero: 0.10,
    login: 0.55,
    default: 0.15,
    subtle: 0.30,
  }[variant] ?? 0.15;

  const isOverlay = !children;

  return (
    <View
      pointerEvents={isOverlay ? 'none' : 'auto'}
      style={[isOverlay ? StyleSheet.absoluteFill : styles.container, style]}
    >
      {/* ── Dark scrim for text readability ── */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(20,20,34,${scrimOpacity})` }]}
      />

      {children && <View style={[styles.content, contentStyle]}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    position: 'relative',
    zIndex: 1,
  },
});
