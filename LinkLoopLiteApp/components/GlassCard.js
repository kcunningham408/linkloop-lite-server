/**
 * GlassCard — Glassmorphism card with subtle blur, gradient border, bloom glow.
 *
 * Usage:
 *   <GlassCard accent="#4A90D9">
 *     <Text>Content</Text>
 *   </GlassCard>
 *
 *   <GlassCard accent="#FF6B6B" glow>
 *     <Text>Glowing card</Text>
 *   </GlassCard>
 */

import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';

export default function GlassCard({
  children,
  accent = '#4A90D9',
  glow = false,
  style,
  intensity = 40,
  noPadding = false,
}) {
  // Android doesn't support BlurView as well — use a semi-transparent fallback
  const isIOS = Platform.OS === 'ios';

  return (
    <View
      style={[
        styles.outerWrap,
        glow && {
          shadowColor: accent,
          shadowOpacity: 0.35,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 0 },
          elevation: 12,
        },
        style,
      ]}
    >
      {/* Bloom glow orb — subtle color wash behind glow cards */}
      {glow && (
        <View style={[styles.bloomOrb, { backgroundColor: accent, opacity: 0.08 }]} />
      )}

      {/* Gradient-ish border via layered borders */}
      <View style={[styles.borderLayer, { borderColor: accent + '25' }]}>
        {isIOS ? (
          <BlurView
            intensity={intensity}
            tint="dark"
            style={[styles.blurInner, !noPadding && styles.padding]}
          >
            {children}
          </BlurView>
        ) : (
          <View style={[styles.androidInner, !noPadding && styles.padding]}>
            {children}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrap: {
    borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  bloomOrb: {
    position: 'absolute',
    top: -20,
    left: '20%',
    right: '20%',
    height: 40,
    borderRadius: 20,
    zIndex: 0,
  },
  borderLayer: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 1,
  },
  blurInner: {
    borderRadius: 19,
    overflow: 'hidden',
    backgroundColor: 'rgba(28, 28, 30, 0.55)',
  },
  androidInner: {
    borderRadius: 19,
    overflow: 'hidden',
    backgroundColor: 'rgba(28, 28, 30, 0.85)',
  },
  padding: {
    padding: 20,
  },
});
