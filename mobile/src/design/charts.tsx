/**
 * Small charts drawn with react-native-svg (already in the app, so no new
 * native module): a donut with its legend and a column chart. Same look on
 * the phone and on the web.
 */
import React from "react";
import { View } from "react-native";
import Svg, { Circle, G, Path, Rect, Line } from "react-native-svg";

import { makeStyles, useTheme } from "./ThemeProvider";
import { Palette } from "./tokens";
import { Txt } from "./ui";

export interface ChartDatum {
  label: string;
  value: number;
  /** Text shown for the value (defaults to the number). */
  text?: string;
  color?: string;
}

/** Brand-led series colours: olive first, then forest, gold, info, warn, muted. */
export function seriesColors(c: Palette): string[] {
  return [c.olive, c.forest, c.gold, c.info, c.warn, c.muted, c.ok, c.risk];
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const sweep = Math.min(end - start, Math.PI * 2 - 1e-4);
  const x0 = cx + r * Math.sin(start);
  const y0 = cy - r * Math.cos(start);
  const x1 = cx + r * Math.sin(start + sweep);
  const y1 = cy - r * Math.cos(start + sweep);
  const large = sweep > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

/** Share of a whole: ring with the total in the centre and a legend beside it. */
export function Donut({
  data,
  size = 132,
  thickness = 18,
  centerValue,
  centerLabel,
  testID,
}: {
  data: ChartDatum[];
  size?: number;
  thickness?: number;
  centerValue?: string;
  centerLabel?: string;
  testID?: string;
}) {
  const t = useTheme();
  const s = useStyles();
  const palette = seriesColors(t.c);
  const rows = data.filter((d) => d.value > 0);
  const total = rows.reduce((sum, d) => sum + d.value, 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  let angle = 0;
  const gap = rows.length > 1 ? 0.03 : 0;
  return (
    <View style={s.donutRow} testID={testID}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={c} cy={c} r={r} stroke={t.c.surface2} strokeWidth={thickness} fill="none" />
          {total > 0
            ? rows.map((d, i) => {
                const sweep = (d.value / total) * Math.PI * 2;
                const path = arcPath(c, c, r, angle + gap / 2, angle + Math.max(sweep - gap / 2, 0.001));
                angle += sweep;
                return (
                  <Path
                    key={d.label}
                    d={path}
                    stroke={d.color ?? palette[i % palette.length]}
                    strokeWidth={thickness}
                    strokeLinecap="butt"
                    fill="none"
                  />
                );
              })
            : null}
        </Svg>
        <View style={[s.donutCenter, { width: size, height: size }]} pointerEvents="none">
          <Txt variant="heading" numeric>
            {centerValue ?? String(total)}
          </Txt>
          {centerLabel ? (
            <Txt variant="caption" tone="muted">
              {centerLabel}
            </Txt>
          ) : null}
        </View>
      </View>
      <View style={s.legend}>
        {rows.map((d, i) => (
          <View key={d.label} style={s.legendRow}>
            <View style={[s.swatch, { backgroundColor: d.color ?? palette[i % palette.length] }]} />
            <Txt variant="caption" style={s.legendLabel} numberOfLines={1}>
              {d.label}
            </Txt>
            <Txt variant="caption" bold numeric>
              {d.text ?? String(d.value)}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Vertical columns with their value on top and the label below. */
export function ColumnChart({
  data,
  height = 168,
  color,
  testID,
}: {
  data: ChartDatum[];
  height?: number;
  color?: string;
  testID?: string;
}) {
  const t = useTheme();
  const s = useStyles();
  const [width, setWidth] = React.useState(0);
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = Math.max(1, data.length);
  const slot = width / n;
  const bar = Math.min(48, slot * 0.56);
  const grid = [0.25, 0.5, 0.75, 1];
  return (
    <View testID={testID} style={s.columns}>
      <View style={{ height }} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <G>
              {grid.map((g) => (
                <Line
                  key={g}
                  x1={0}
                  x2={width}
                  y1={height - g * (height - 18)}
                  y2={height - g * (height - 18)}
                  stroke={t.c.line}
                  strokeWidth={1}
                  strokeDasharray="3 4"
                />
              ))}
              {data.map((d, i) => {
                const h = Math.max(2, (d.value / max) * (height - 18));
                return (
                  <Rect
                    key={d.label}
                    x={i * slot + (slot - bar) / 2}
                    y={height - h}
                    width={bar}
                    height={h}
                    rx={4}
                    fill={d.color ?? color ?? t.c.olive}
                  />
                );
              })}
            </G>
          </Svg>
        ) : null}
        {width > 0
          ? data.map((d, i) => {
              const h = Math.max(2, (d.value / max) * (height - 18));
              return (
                <View key={d.label} pointerEvents="none" style={[s.valueTag, { left: i * slot, width: slot, top: height - h - 18 }]}>
                  <Txt variant="caption" bold numeric style={s.centerText}>
                    {d.text ?? String(d.value)}
                  </Txt>
                </View>
              );
            })
          : null}
      </View>
      <View style={s.labels}>
        {data.map((d) => (
          <Txt key={d.label} variant="caption" tone="muted" numberOfLines={2} style={[s.colLabel, s.centerText]}>
            {d.label}
          </Txt>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  donutRow: { flexDirection: "row", alignItems: "center", gap: th.space.lg, flexWrap: "wrap" },
  donutCenter: { position: "absolute", left: 0, top: 0, alignItems: "center", justifyContent: "center" },
  legend: { flex: 1, minWidth: 160, gap: 6 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  legendLabel: { flex: 1 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  columns: { gap: th.space.xs },
  valueTag: { position: "absolute", alignItems: "center" },
  labels: { flexDirection: "row" },
  colLabel: { flex: 1, paddingHorizontal: 2 },
  centerText: { textAlign: "center" },
}));
