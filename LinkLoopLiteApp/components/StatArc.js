/**
 * StatArc — Small circular progress arc for stat values (e.g., Time in Range %).
 */

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import TYPE from '../config/typography';

export default function StatArc({
  value,       // e.g. 82 (percentage or raw number)
  maxValue = 100,
  label,
  suffix = '',
  color = '#4A90D9',
  size = 80,
}) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const progress = Math.min(1, Math.max(0, (value || 0) / maxValue));
  const offset = circumference * (1 - progress);

  return (
    <View style={[styles.container, { width: size }]}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          {/* Track */}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress */}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${center}, ${center}`}
            opacity={0.9}
          />
        </Svg>
        <Text style={[styles.value, { color }]}>
          {value != null ? `${value}${suffix}` : '--'}
        </Text>
      </View>
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  value: {
    fontSize: TYPE.lg,
    fontWeight: TYPE.bold,
  },
  label: {
    fontSize: TYPE.xs,
    color: '#C8C8C8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 13,
  },
});
