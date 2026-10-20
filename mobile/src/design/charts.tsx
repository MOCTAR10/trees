/**
 * Small charts drawn with react-native-svg (already in the app, so no new
 * native module): a donut with its legend, a column chart and horizontal bars.
 * Same look on the phone and on the web. Every chart is interactive: a tap on
 * a slice, a column, a bar or a legend row highlights it and shows its full
 * label, value and share; a second tap clears it. Nothing is ever cut: labels
 * wrap, and a column chart too narrow for its labels turns into bars.
 */
import React from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg";

import { haptic } from "../utils/haptics";
import { dec } from "./format";
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

/**
 * Brand-led series colours in a fixed order whose neighbours stay apart for
 * colour-blind readers in both themes (olive, blue, gold, then forest).
 * Status colours (warn, risk) are kept for states and never used as a series.
 */
export function seriesColors(c: Palette): string[] {
  return [c.olive, c.info, c.gold, c.forest, c.muted, c.ok];
}

/** Narrowest column that still shows its label and value whole (px). */
export const MIN_COLUMN_SLOT = 64;
/** Average width of one caption character, to keep a label's longest word whole (px). */
const CAPTION_CHAR_PX = 6;

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const sweep = Math.min(end - start, Math.PI * 2 - 1e-4);
  const x0 = cx + r * Math.sin(start);
  const y0 = cy - r * Math.cos(start);
  const x1 = cx + r * Math.sin(start + sweep);
  const y1 = cy - r * Math.cos(start + sweep);
  const large = sweep > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

function share(value: number, total: number): string {
  return total > 0 ? `${dec((value / total) * 100, 0)} %` : "";
}

/** Tap-to-select state shared by the charts (with a light vibration). */
function useSelection() {
  const [selected, setSelected] = React.useState<number | null>(null);
  const toggle = React.useCallback((i: number) => {
    haptic("select");
    setSelected((cur) => (cur === i ? null : i));
  }, []);
  return [selected, toggle] as const;
}

/** The selected item, spelled out in full under a chart. */
function Callout({ datum, color, total, testID }: { datum: ChartDatum; color: string; total: number; testID?: string }) {
  const s = useStyles();
  return (
    <View style={s.callout} testID={testID} accessibilityLiveRegion="polite">
      <View style={[s.swatch, { backgroundColor: color }]} />
      <Txt variant="small" bold style={s.flex}>
        {datum.label}
      </Txt>
      <Txt variant="small" bold numeric>
        {datum.text ?? String(datum.value)}
      </Txt>
      {total > 0 ? (
        <Txt variant="caption" tone="muted" numeric>
          {share(datum.value, total)}
        </Txt>
      ) : null}
    </View>
  );
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
  const [selected, toggle] = useSelection();
  const pick = selected != null && selected < rows.length ? selected : null;
  const r = (size - thickness) / 2 - 3;
  const c = size / 2;
  let angle = 0;
  const gap = rows.length > 1 ? 0.03 : 0;
  const colorOf = (i: number) => rows[i].color ?? palette[i % palette.length];
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
                    stroke={colorOf(i)}
                    strokeWidth={pick === i ? thickness + 6 : thickness}
                    strokeOpacity={pick == null || pick === i ? 1 : 0.3}
                    strokeLinecap="butt"
                    fill="none"
                    onPress={() => toggle(i)}
                  />
                );
              })
            : null}
        </Svg>
        <View style={[s.donutCenter, { width: size, height: size, padding: thickness + 6 }]} pointerEvents="none">
          <Txt variant="heading" numeric>
            {pick != null ? (rows[pick].text ?? String(rows[pick].value)) : (centerValue ?? String(total))}
          </Txt>
          <Txt variant="caption" tone="muted" numberOfLines={2} style={s.centerText}>
            {pick != null ? share(rows[pick].value, total) : (centerLabel ?? "")}
          </Txt>
        </View>
      </View>
      <View style={s.legend}>
        {rows.map((d, i) => (
          <Pressable
            key={d.label}
            onPress={() => toggle(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: pick === i }}
            accessibilityLabel={`${d.label} : ${d.text ?? d.value}, ${share(d.value, total)}`}
            style={[s.legendRow, pick === i && s.legendRowOn, pick != null && pick !== i && s.dim]}
            testID={testID ? `${testID}-item-${i}` : undefined}
          >
            <View style={[s.swatch, { backgroundColor: colorOf(i) }]} />
            <Txt variant="caption" bold={pick === i} style={s.flex}>
              {d.label}
            </Txt>
            <Txt variant="caption" bold numeric>
              {d.text ?? String(d.value)}
            </Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * Horizontal bars, one row per item: the label (wrapping, never cut) and its
 * value on top, the bar across the full width below.
 */
export function BarList({
  data,
  color,
  testID,
}: {
  data: ChartDatum[];
  color?: string;
  testID?: string;
}) {
  const t = useTheme();
  const s = useStyles();
  const [selected, toggle] = useSelection();
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0);
  const pick = selected != null && selected < data.length ? selected : null;
  return (
    <View style={s.barList} testID={testID}>
      {data.map((d, i) => {
        const fill = d.color ?? color ?? t.c.olive;
        return (
          <Pressable
            key={`${d.label}-${i}`}
            onPress={() => toggle(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: pick === i }}
            accessibilityLabel={`${d.label} : ${d.text ?? d.value}, ${share(d.value, total)}`}
            style={[s.barRow, pick === i && s.barRowOn, pick != null && pick !== i && s.dim]}
            testID={testID ? `${testID}-item-${i}` : undefined}
          >
            <View style={s.barHead}>
              <Txt variant="caption" bold={pick === i} style={s.flex}>
                {d.label}
              </Txt>
              <Txt variant="caption" bold numeric>
                {d.text ?? String(d.value)}
              </Txt>
              {pick === i ? (
                <Txt variant="caption" tone="muted" numeric>
                  {share(d.value, total)}
                </Txt>
              ) : null}
            </View>
            <View style={s.track}>
              <View style={[s.fill, { width: `${Math.max(1.5, (d.value / max) * 100)}%`, backgroundColor: fill }]} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Vertical columns with their value on top and the label below. When the
 * columns would be too narrow to show labels and values whole (a phone, many
 * items), the same data is drawn as horizontal bars instead.
 */
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
  const [selected, toggle] = useSelection();
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0);
  const n = Math.max(1, data.length);
  const slot = width / n;
  const bar = Math.min(48, slot * 0.56);
  const top = 22;
  const grid = [0.25, 0.5, 0.75, 1];
  const pick = selected != null && selected < data.length ? selected : null;
  const fillOf = (d: ChartDatum) => d.color ?? color ?? t.c.olive;
  const onLayout = (e: { nativeEvent: { layout: { width: number } } }) => setWidth(Math.round(e.nativeEvent.layout.width));
  const longestWord = Math.max(0, ...data.flatMap((d) => d.label.split(/\s+/).map((w) => w.length)));
  const needed = Math.max(MIN_COLUMN_SLOT, longestWord * CAPTION_CHAR_PX + 8);

  if (width > 0 && slot < needed) {
    return (
      <View onLayout={onLayout}>
        <BarList data={data} color={color} testID={testID} />
      </View>
    );
  }

  return (
    <View testID={testID} style={s.columns} onLayout={onLayout}>
      <View style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <G>
              {grid.map((g) => (
                <Line
                  key={g}
                  x1={0}
                  x2={width}
                  y1={height - g * (height - top)}
                  y2={height - g * (height - top)}
                  stroke={t.c.line}
                  strokeWidth={1}
                  strokeDasharray="3 4"
                />
              ))}
              {data.map((d, i) => {
                const h = Math.max(2, (d.value / max) * (height - top));
                return (
                  <Rect
                    key={`${d.label}-${i}`}
                    x={i * slot + (slot - bar) / 2}
                    y={height - h}
                    width={bar}
                    height={h}
                    rx={4}
                    fill={fillOf(d)}
                    opacity={pick == null || pick === i ? 1 : 0.35}
                  />
                );
              })}
            </G>
          </Svg>
        ) : null}
        {width > 0
          ? data.map((d, i) => {
              const h = Math.max(2, (d.value / max) * (height - top));
              return (
                <View key={`${d.label}-${i}`} pointerEvents="none" style={[s.valueTag, { left: i * slot, width: slot, top: height - h - 20 }]}>
                  <Txt variant="caption" bold numeric numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={s.centerText}>
                    {d.text ?? String(d.value)}
                  </Txt>
                </View>
              );
            })
          : null}
        {width > 0
          ? data.map((d, i) => (
              <Pressable
                key={`${d.label}-${i}`}
                onPress={() => toggle(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: pick === i }}
                accessibilityLabel={`${d.label} : ${d.text ?? d.value}, ${share(d.value, total)}`}
                style={[s.hit, { left: i * slot, width: slot, height }]}
                testID={testID ? `${testID}-item-${i}` : undefined}
              />
            ))
          : null}
      </View>
      <View style={s.labels}>
        {data.map((d, i) => (
          <Txt
            key={`${d.label}-${i}`}
            variant="caption"
            tone={pick === i ? "ink" : "muted"}
            bold={pick === i}
            numberOfLines={3}
            style={[s.colLabel, s.centerText]}
          >
            {d.label}
          </Txt>
        ))}
      </View>
      {pick != null ? <Callout datum={data[pick]} color={fillOf(data[pick])} total={total} testID={testID ? `${testID}-callout` : undefined} /> : null}
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  flex: { flex: 1 },
  dim: { opacity: 0.55 },
  donutRow: { flexDirection: "row", alignItems: "center", gap: th.space.lg, flexWrap: "wrap" },
  donutCenter: { position: "absolute", left: 0, top: 0, alignItems: "center", justifyContent: "center" },
  legend: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0, gap: 2 },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.sm,
    minHeight: 32,
    paddingHorizontal: th.space.xs,
    borderRadius: th.radius.sm,
  },
  legendRowOn: { backgroundColor: th.c.surface2 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  columns: { gap: th.space.xs },
  valueTag: { position: "absolute", alignItems: "center", paddingHorizontal: 2 },
  hit: { position: "absolute", top: 0 },
  labels: { flexDirection: "row" },
  colLabel: { flex: 1, paddingHorizontal: 2 },
  centerText: { textAlign: "center" },
  callout: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.sm,
    backgroundColor: th.c.surface2,
    borderRadius: th.radius.md,
    paddingHorizontal: th.space.md,
    paddingVertical: th.space.sm,
  },
  barList: { gap: 2 },
  barRow: { gap: 4, paddingVertical: 6, paddingHorizontal: th.space.xs, borderRadius: th.radius.sm },
  barRowOn: { backgroundColor: th.c.surface2 },
  barHead: { flexDirection: "row", alignItems: "flex-start", gap: th.space.sm },
  track: { height: 10, borderRadius: 5, backgroundColor: th.c.surface2, overflow: "hidden" },
  fill: { height: 10, borderRadius: 5 },
}));
