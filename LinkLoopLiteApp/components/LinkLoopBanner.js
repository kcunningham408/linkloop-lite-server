/**
 * LinkLoopBanner — Profile hero background inspired by the V6 Gradient Bloom icon.
 *
 * Renders the iconic interlocking chain‑link logo, soft radial gradient blobs,
 * floating glucose pill, care‑circle status dots, and a glass disc backdrop,
 * all SVG + Views, fully theme‑aware.  Designed to sit behind the profile
 * avatar, name, and stats row.
 *
 * Props:
 *   accent    – primary colour (warrior / member)
 *   secondary – complementary colour (opposite role gradient)
 *   children  – profile content layered on top
 *   style     – outer container overrides
 */

import { LinearGradient } from 'expo-linear-gradient';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Svg, {
    Circle,
    Defs,
    G,
    Line,
    Rect,
    Stop,
    LinearGradient as SVGGradient,
} from 'react-native-svg';

const { width: SCREEN_W } = Dimensions.get('window');
const BANNER_H = 340; // enough room for content to overlay

/* ── helpers ── */
const hexToRgb = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
};

export default function LinkLoopBanner({
  accent = '#4A90D9',
  secondary = '#34C759',
  children,
  style,
}) {
  const aRgb = hexToRgb(accent);
  const sRgb = hexToRgb(secondary);

  return (
    <View style={[styles.container, style]}>
      {/* ─── Dark base ─── */}
      <View pointerEvents="none" style={styles.base} />

      {/* ─── Gradient blobs (View-based, blurred feel via large radius + low opacity) ─── */}
      <View pointerEvents="none" style={[styles.blob, styles.blobA, { backgroundColor: `rgba(${aRgb},0.22)` }]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobB, { backgroundColor: `rgba(${sRgb},0.16)` }]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobC, { backgroundColor: 'rgba(155,89,182,0.07)' }]} />

      {/* ─── SVG artwork layer ─── */}
      <Svg
        pointerEvents="none"
        width={SCREEN_W}
        height={BANNER_H}
        viewBox={`0 0 ${SCREEN_W} ${BANNER_H}`}
        style={styles.svgLayer}
      >
        <Defs>
          {/* Chain link gradient A (accent) */}
          <SVGGradient id="chainA" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={accent} stopOpacity="0.7" />
            <Stop offset="100%" stopColor={accent} stopOpacity="0.3" />
          </SVGGradient>
          {/* Chain link gradient B (secondary) */}
          <SVGGradient id="chainB" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={secondary} stopOpacity="0.7" />
            <Stop offset="100%" stopColor={secondary} stopOpacity="0.3" />
          </SVGGradient>
          {/* Glass disc fill */}
          <SVGGradient id="glassDisc" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#fff" stopOpacity="0.03" />
            <Stop offset="100%" stopColor="#fff" stopOpacity="0.01" />
          </SVGGradient>
        </Defs>

        {/* ── Glass circle backdrop ── */}
        <Circle
          cx={SCREEN_W / 2}
          cy={BANNER_H / 2 - 10}
          r={110}
          fill="url(#glassDisc)"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={1}
        />

        {/* ── Interlocking chain links (the LinkLoop logo) ── */}
        {/* Link A – accent – left-ish */}
        <Rect
          x={SCREEN_W / 2 - 58}
          y={BANNER_H / 2 - 50}
          width={60}
          height={58}
          rx={29}
          ry={29}
          fill="none"
          stroke="url(#chainA)"
          strokeWidth={7}
          opacity={0.45}
        />
        {/* Link B – secondary – right-ish, overlapping */}
        <Rect
          x={SCREEN_W / 2 - 22}
          y={BANNER_H / 2 - 50}
          width={60}
          height={58}
          rx={29}
          ry={29}
          fill="none"
          stroke="url(#chainB)"
          strokeWidth={7}
          opacity={0.45}
        />
        {/* Overlap bridges — hide behind-segments to create interlocking illusion */}
        <Rect
          x={SCREEN_W / 2 - 22}
          y={BANNER_H / 2 - 55}
          width={10}
          height={13}
          fill="#141422"
          opacity={0.92}
        />
        <Rect
          x={SCREEN_W / 2 - 22}
          y={BANNER_H / 2 + 2}
          width={10}
          height={13}
          fill="#141422"
          opacity={0.92}
        />
        {/* Re-draw overlap segments for interlocking */}
        <Line
          x1={SCREEN_W / 2 - 22}
          y1={BANNER_H / 2 + 8}
          x2={SCREEN_W / 2 - 12}
          y2={BANNER_H / 2 + 8}
          stroke="url(#chainB)"
          strokeWidth={7}
          strokeLinecap="round"
          opacity={0.45}
        />
        <Line
          x1={SCREEN_W / 2 - 22}
          y1={BANNER_H / 2 - 50}
          x2={SCREEN_W / 2 - 12}
          y2={BANNER_H / 2 - 50}
          stroke="url(#chainA)"
          strokeWidth={7}
          strokeLinecap="round"
          opacity={0.45}
        />

        {/* ── Floating glucose pill — top right ── */}
        <G opacity={0.25}>
          <Rect
            x={SCREEN_W - 95}
            y={32}
            width={62}
            height={42}
            rx={14}
            fill="rgba(255,255,255,0.03)"
            stroke={`rgba(${sRgb},0.20)`}
            strokeWidth={1}
          />
        </G>

        {/* ── Care circle dots — left edge ── */}
        {[0, 1, 2, 3].map((i) => (
          <G key={`dot-${i}`} opacity={0.22}>
            <Circle
              cx={32}
              cy={BANNER_H / 2 - 36 + i * 24}
              r={5}
              fill="none"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={1.5}
            />
            <Circle
              cx={32}
              cy={BANNER_H / 2 - 36 + i * 24}
              r={2.5}
              fill={
                i === 0 ? secondary
                  : i === 1 ? secondary
                    : i === 2 ? '#FF7B93'
                      : 'rgba(255,255,255,0.2)'
              }
            />
          </G>
        ))}

        {/* ── Trend arrow — bottom right ── */}
        <G opacity={0.15}>
          <Rect
            x={SCREEN_W - 58}
            y={BANNER_H - 78}
            width={0}
            height={0}
          />
          {/* Use a text element for the arrow */}
        </G>

        {/* ── Subtle grid dots (ambient texture) ── */}
        {Array.from({ length: 8 }).map((_, i) => (
          <Circle
            key={`grid-${i}`}
            cx={50 + (i % 4) * (SCREEN_W - 100) / 3}
            cy={i < 4 ? 24 : BANNER_H - 24}
            r={1}
            fill="rgba(255,255,255,0.06)"
          />
        ))}
      </Svg>

      {/* ── Floating glucose value text (View layer — sharper than SVG text) ── */}
      <View style={styles.glucosePill}>
        <Text style={[styles.glucoseVal, { color: secondary }]}>112</Text>
        <Text style={styles.glucoseUnit}>mg/dL</Text>
      </View>

      {/* ── Trend arrow ── */}
      <Text style={[styles.trendArrow, { color: `rgba(${sRgb},0.25)` }]}>↗</Text>

      {/* ── Radial fade overlay — blends bottom into background ── */}
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', 'rgba(20,20,34,0.55)', 'rgba(20,20,34,0.85)']}
        locations={[0, 0.6, 1]}
        style={styles.fadeOverlay}
      />

      {/* ── Bottom edge glow line ── */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          'transparent',
          `rgba(${aRgb},0.25)`,
          `rgba(${sRgb},0.25)`,
          'transparent',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.edgeGlow}
      />

      {/* ── Content overlay ── */}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: BANNER_H,
    position: 'relative',
    overflow: 'hidden',
  },
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },

  /* Gradient blobs */
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobA: {
    width: 280,
    height: 280,
    top: -60,
    left: -40,
    opacity: 0.9,
    transform: [{ scaleX: 1.3 }],
  },
  blobB: {
    width: 240,
    height: 240,
    bottom: -40,
    right: -30,
    opacity: 0.85,
    transform: [{ scaleX: 1.2 }],
  },
  blobC: {
    width: 200,
    height: 200,
    bottom: 30,
    left: '25%',
    opacity: 0.9,
    transform: [{ scaleX: 1.4 }],
  },

  /* SVG artwork */
  svgLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 2,
  },

  /* Floating glucose pill */
  glucosePill: {
    position: 'absolute',
    top: 34,
    right: 30,
    alignItems: 'center',
    zIndex: 3,
    opacity: 0.30,
  },
  glucoseVal: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  glucoseUnit: {
    fontSize: 8,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 1,
    marginTop: 2,
  },

  /* Trend arrow */
  trendArrow: {
    position: 'absolute',
    bottom: 68,
    right: 36,
    fontSize: 28,
    zIndex: 3,
  },

  /* Fade overlay */
  fadeOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
  },

  /* Bottom edge glow */
  edgeGlow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 5,
  },

  /* Content */
  content: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
});
