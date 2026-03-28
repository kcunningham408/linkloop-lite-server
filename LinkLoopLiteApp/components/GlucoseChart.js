/**
 * GlucoseChart — Real SVG line chart for glucose readings.
 *
 * Features:
 *  - Smooth curved line (cubic bezier)
 *  - Gradient fill under the line
 *  - Threshold bands (low, in-range, high)
 *  - Dot at most recent reading
 *  - Time labels on X-axis
 *  - Responsive to container width
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Path, Rect, Stop, LinearGradient as SVGGradient, Line as SvgLine, Text as SvgText } from 'react-native-svg';

const PADDING = { top: 20, right: 16, bottom: 32, left: 42 };

export default function GlucoseChart({
  readings = [],
  width = 340,
  height = 200,
  lowThreshold = 70,
  highThreshold = 180,
  accentColor = '#4A90D9',
}) {
  const chartW = width - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

  // Sort readings by timestamp ascending
  const sorted = useMemo(() => {
    return [...readings]
      .filter(r => r.value && r.timestamp)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [readings]);

  // Y-axis range: 40 – 300 mg/dL
  const Y_MIN = 40;
  const Y_MAX = 300;

  const yScale = (val) => {
    const clamped = Math.max(Y_MIN, Math.min(Y_MAX, val));
    return PADDING.top + chartH - ((clamped - Y_MIN) / (Y_MAX - Y_MIN)) * chartH;
  };

  const xScale = (i) => {
    if (sorted.length <= 1) return PADDING.left + chartW / 2;
    return PADDING.left + (i / (sorted.length - 1)) * chartW;
  };

  // Build smooth bezier path
  const points = useMemo(() => sorted.map((r, i) => ({
    x: xScale(i),
    y: yScale(r.value),
    value: r.value,
    time: new Date(r.timestamp),
  })), [sorted]);

  // Catmull-Rom to cubic bezier for smooth curves
  const buildCurvePath = (pts) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

    let d = `M ${pts[0].x} ${pts[0].y}`;

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(i + 2, pts.length - 1)];

      const tension = 0.3;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  };

  const linePath = useMemo(() => buildCurvePath(points), [points]);

  // Fill path (close to bottom of chart)
  const fillPath = useMemo(() => {
    if (points.length === 0) return '';
    const bottomY = PADDING.top + chartH;
    return linePath + ` L ${points[points.length - 1].x},${bottomY} L ${points[0].x},${bottomY} Z`;
  }, [linePath, points]);

  // Time labels — show ~5 evenly spaced
  const timeLabels = useMemo(() => {
    if (sorted.length < 2) return [];
    const step = Math.max(1, Math.floor(sorted.length / 5));
    const labels = [];
    for (let i = 0; i < sorted.length; i += step) {
      labels.push({
        x: xScale(i),
        label: new Date(sorted[i].timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      });
    }
    // Always include last
    const lastIdx = sorted.length - 1;
    if (labels.length === 0 || labels[labels.length - 1].x !== xScale(lastIdx)) {
      labels.push({
        x: xScale(lastIdx),
        label: new Date(sorted[lastIdx].timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      });
    }
    return labels;
  }, [sorted]);

  // Color for a glucose value
  const dotColor = (val) => {
    if (val < lowThreshold) return '#FF6B6B';
    if (val > highThreshold) return '#FF7B93';
    return accentColor;
  };

  if (sorted.length === 0) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyEmoji}>📊</Text>
        <Text style={styles.emptyText}>No readings to chart</Text>
      </View>
    );
  }

  const lowY = yScale(lowThreshold);
  const highY = yScale(highThreshold);
  const lastPt = points[points.length - 1];

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          {/* Line gradient */}
          <SVGGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={accentColor} stopOpacity="1" />
            <Stop offset="1" stopColor={accentColor} stopOpacity="0.6" />
          </SVGGradient>
          {/* Fill gradient */}
          <SVGGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={accentColor} stopOpacity="0.3" />
            <Stop offset="1" stopColor={accentColor} stopOpacity="0.02" />
          </SVGGradient>
        </Defs>

        {/* In-range band */}
        <Rect
          x={PADDING.left}
          y={highY}
          width={chartW}
          height={lowY - highY}
          fill={accentColor}
          opacity={0.06}
        />

        {/* Threshold lines */}
        <SvgLine x1={PADDING.left} y1={highY} x2={PADDING.left + chartW} y2={highY}
          stroke="#FF7B93" strokeWidth={1} strokeDasharray="6,4" opacity={0.7} />
        <SvgLine x1={PADDING.left} y1={lowY} x2={PADDING.left + chartW} y2={lowY}
          stroke="#FF6B6B" strokeWidth={1} strokeDasharray="6,4" opacity={0.7} />

        {/* Y-axis labels */}
        <SvgText x={PADDING.left - 6} y={highY + 4} fontSize={10} fill="#FF7B93" textAnchor="end" opacity={0.85}>
          {highThreshold}
        </SvgText>
        <SvgText x={PADDING.left - 6} y={lowY + 4} fontSize={10} fill="#FF6B6B" textAnchor="end" opacity={0.85}>
          {lowThreshold}
        </SvgText>

        {/* Gradient fill under curve */}
        {fillPath ? <Path d={fillPath} fill="url(#fillGrad)" /> : null}

        {/* Main curve line */}
        <Path d={linePath} fill="none" stroke="url(#lineGrad)" strokeWidth={2.5} strokeLinecap="round" />

        {/* Data dots — only show out-of-range dots + latest */}
        {points.map((pt, i) => {
          const isLast = i === points.length - 1;
          const isOutOfRange = pt.value < lowThreshold || pt.value > highThreshold;
          if (!isLast && !isOutOfRange) return null;
          return (
            <Circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r={isLast ? 5 : 3.5}
              fill={dotColor(pt.value)}
              stroke={isLast ? '#fff' : 'none'}
              strokeWidth={isLast ? 2 : 0}
            />
          );
        })}

        {/* Time labels */}
        {timeLabels.map((t, i) => (
          <SvgText
            key={i}
            x={t.x}
            y={height - 6}
            fontSize={9}
            fill="#999"
            textAnchor="middle"
          >
            {t.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(26,26,28,0.45)' },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#B0B0B0' },
});
