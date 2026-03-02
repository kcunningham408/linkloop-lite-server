/**
 * GlucoseRing — Circular arc visualization around the current glucose number.
 *
 * Shows a colored ring that fills based on where the value sits in the
 * 40–300 mg/dL range. Color shifts from red (low) → accent (in range) → orange (high).
 */

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SVGGradient, Stop } from 'react-native-svg';
import TYPE from '../config/typography';

/** Map trend words → arrow glyphs so the ring always shows a compact symbol */
const TREND_ARROWS = {
  rising_fast: '↑↑',
  rising:      '↑',
  stable:      '→',
  falling:     '↓',
  falling_fast:'↓↓',
};

const RING_SIZE = 180;
const STROKE_WIDTH = 8;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function GlucoseRing({
  value,
  trend = '→',
  accentColor = '#4A90D9',
  lowThreshold = 70,
  highThreshold = 180,
  size = RING_SIZE,
}) {
  const radius = (size - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Progress: 0 → 1 based on where value sits in 40-300 range
  const Y_MIN = 40;
  const Y_MAX = 300;
  const clamped = Math.max(Y_MIN, Math.min(Y_MAX, value || 0));
  const progress = (clamped - Y_MIN) / (Y_MAX - Y_MIN);
  const strokeDashoffset = circumference * (1 - progress);

  // Color
  const getColor = () => {
    if (!value) return '#333';
    if (value < lowThreshold) return '#FF6B6B';
    if (value > highThreshold) return '#FFA500';
    return accentColor;
  };

  const color = getColor();

  const getStatus = () => {
    if (!value) return '';
    if (value < lowThreshold) return 'LOW';
    if (value > highThreshold) return 'HIGH';
    return 'IN RANGE';
  };

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        <Defs>
          <SVGGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="1" />
            <Stop offset="1" stopColor={color} stopOpacity="0.5" />
          </SVGGradient>
        </Defs>
        {/* Background track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={STROKE_WIDTH}
          fill="none"
        />
        {/* Colored arc */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="url(#ringGrad)"
          strokeWidth={STROKE_WIDTH}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>
      {/* Center content */}
      <View style={styles.center}>
        <Text style={[styles.value, { color: value ? '#fff' : '#555' }]}>
          {value || '--'}
        </Text>
        <Text style={styles.unit}>mg/dL</Text>
        {value ? (
          <View style={[styles.statusBadge, { backgroundColor: color + '20' }]}>
            <Text style={[styles.statusText, { color }]}>{getStatus()}</Text>
          </View>
        ) : null}
      </View>
      {/* Trend arrow - positioned to the right of the ring */}
      {value ? (
        <View style={[styles.trendContainer, { right: -(size * 0.16), top: size * 0.32 }]}>
          <Text style={[styles.trend, { color, fontSize: Math.max(18, size * 0.18) }]}>
            {TREND_ARROWS[trend] || trend}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
  },
  value: {
    fontSize: TYPE.mega,
    fontWeight: TYPE.black,
    letterSpacing: -2,
  },
  unit: {
    fontSize: TYPE.sm,
    color: 'rgba(255,255,255,0.5)',
    marginTop: -4,
  },
  statusBadge: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusText: {
    fontSize: TYPE.xs,
    fontWeight: TYPE.bold,
    letterSpacing: 0.5,
  },
  trendContainer: {
    position: 'absolute',
  },
  trend: {
    fontWeight: TYPE.bold,
  },
});
