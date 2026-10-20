/**
 * Responsive building blocks. On the phone (and on narrow browser windows)
 * each one renders the plain single column the screens always had; on the
 * desktop web app (≥ 1024 px) card lists flow in columns, lists become
 * sortable tables, a page can carry a side pane and bottom sheets open as
 * centred dialogs.
 */
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react-native";
import React from "react";
import { LayoutChangeEvent, Pressable, StyleProp, View, ViewStyle } from "react-native";

import { useDesktop } from "../web/DesktopFrame";
import { makeStyles, useTheme } from "./ThemeProvider";
import { Txt } from "./ui";

export { useDesktop };

type Hoverable = { pressed: boolean; hovered?: boolean };

function useMeasuredWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = React.useState(0);
  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setWidth((prev) => (prev === next ? prev : next));
  }, []);
  return [width, onLayout];
}

/**
 * Cards in as many columns as the width allows on the desktop (masonry: each
 * column stacks its own cards, so tall cards leave no holes); a single column
 * elsewhere.
 */
export function CardGrid({
  children,
  minColumnWidth = 380,
  maxColumns = 3,
  gap,
  style,
  testID,
}: {
  children: React.ReactNode;
  minColumnWidth?: number;
  maxColumns?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const t = useTheme();
  const desktop = useDesktop();
  const [width, onLayout] = useMeasuredWidth();
  const g = gap ?? (desktop ? t.space.md : t.space.sm);
  const items = React.Children.toArray(children).filter(Boolean);
  const columns = desktop && width > 0 ? Math.max(1, Math.min(maxColumns, Math.floor((width + g) / (minColumnWidth + g)))) : 1;
  if (columns <= 1) {
    return (
      <View style={[{ gap: g }, style]} onLayout={desktop ? onLayout : undefined} testID={testID}>
        {items}
      </View>
    );
  }
  const stacks: React.ReactNode[][] = Array.from({ length: columns }, () => []);
  items.forEach((item, i) => stacks[i % columns].push(item));
  return (
    <View style={[{ flexDirection: "row", alignItems: "flex-start", gap: g }, style]} onLayout={onLayout} testID={testID}>
      {stacks.map((stack, i) => (
        <View key={i} style={{ flex: 1, minWidth: 0, gap: g }}>
          {stack}
        </View>
      ))}
    </View>
  );
}

/** Main content with a side pane to its right on the desktop; stacked (side pane first or last) elsewhere. */
export function SplitPane({
  main,
  side,
  sideWidth = 380,
  sideFirstOnPhone,
  gap,
  testID,
}: {
  main: React.ReactNode;
  side: React.ReactNode;
  sideWidth?: number;
  sideFirstOnPhone?: boolean;
  gap?: number;
  testID?: string;
}) {
  const t = useTheme();
  const desktop = useDesktop();
  const g = gap ?? t.space.md;
  if (!desktop) {
    return (
      <View style={{ gap: g }} testID={testID}>
        {sideFirstOnPhone ? side : main}
        {sideFirstOnPhone ? main : side}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: g }} testID={testID}>
      <View style={{ flex: 1, minWidth: 0, gap: g }}>{main}</View>
      <View style={{ width: sideWidth, gap: g }}>{side}</View>
    </View>
  );
}

export interface TableColumn<T> {
  key: string;
  title: string;
  /** Share of the free width (default 1); ignored when `width` is set. */
  flex?: number;
  width?: number;
  align?: "left" | "right" | "center";
  render: (row: T) => React.ReactNode;
  /** Makes the column sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
}

type SortState = { key: string; dir: 1 | -1 } | null;

function compare(a: string | number | null | undefined, b: string | number | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "fr", { sensitivity: "base", numeric: true });
}

/** Desktop table: sortable headers, hover rows, a chevron when a row opens something. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowPress,
  rowTestID,
  initialSort,
  empty,
  testID,
}: {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowPress?: (row: T) => void;
  rowTestID?: (row: T) => string;
  initialSort?: { key: string; dir?: 1 | -1 };
  empty?: string;
  testID?: string;
}) {
  const t = useTheme();
  const s = useStyles();
  const [sort, setSort] = React.useState<SortState>(initialSort ? { key: initialSort.key, dir: initialSort.dir ?? 1 } : null);
  const sorted = React.useMemo(() => {
    const col = sort ? columns.find((c) => c.key === sort.key) : undefined;
    if (!sort || !col?.sortValue) return rows;
    const value = col.sortValue;
    return [...rows].sort((a, b) => compare(value(a), value(b)) * sort.dir);
  }, [rows, columns, sort]);

  const cellStyle = (c: TableColumn<T>): ViewStyle => ({
    ...(c.width ? { width: c.width } : { flex: c.flex ?? 1 }),
    minWidth: 0,
    alignItems: c.align === "right" ? "flex-end" : c.align === "center" ? "center" : "flex-start",
  });

  return (
    <View style={s.table} testID={testID}>
      <View style={s.headRow}>
        {columns.map((c) => {
          const on = sort?.key === c.key;
          const Arrow = on && sort?.dir === -1 ? ArrowDown : ArrowUp;
          const title = (
            <Txt variant="label" tone={on ? "olive" : "muted"} numberOfLines={1}>
              {c.title}
            </Txt>
          );
          return c.sortValue ? (
            <Pressable
              key={c.key}
              testID={`${testID ?? "table"}-sort-${c.key}`}
              accessibilityRole="button"
              onPress={() => setSort(on ? { key: c.key, dir: sort?.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 })}
              style={[cellStyle(c), s.sortable]}
            >
              <View style={s.sortInner}>
                {title}
                <Arrow size={12} color={on ? t.c.olive : "transparent"} />
              </View>
            </Pressable>
          ) : (
            <View key={c.key} style={cellStyle(c)}>
              {title}
            </View>
          );
        })}
        {onRowPress ? <View style={s.chevCell} /> : null}
      </View>
      {sorted.length === 0 && empty ? (
        <View style={s.empty}>
          <Txt tone="muted">{empty}</Txt>
        </View>
      ) : null}
      {sorted.map((row, i) => {
        const content = (
          <>
            {columns.map((c) => (
              <View key={c.key} style={cellStyle(c)}>
                {c.render(row)}
              </View>
            ))}
            {onRowPress ? (
              <View style={s.chevCell}>
                <ChevronRight size={16} color={t.c.muted} />
              </View>
            ) : null}
          </>
        );
        const last = i === sorted.length - 1;
        return onRowPress ? (
          <Pressable
            key={rowKey(row)}
            testID={rowTestID?.(row)}
            accessibilityRole="button"
            onPress={() => onRowPress(row)}
            style={(state) => [s.row, last && s.lastRow, (state as Hoverable).hovered && s.rowHover, state.pressed && s.rowPressed]}
          >
            {content}
          </Pressable>
        ) : (
          <View key={rowKey(row)} testID={rowTestID?.(row)} style={[s.row, last && s.lastRow]}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

/** Bottom sheet on the phone, centred dialog on the desktop: append to the modal's own styles. */
export function useDialog(maxWidth = 640) {
  const desktop = useDesktop();
  const t = useTheme();
  return React.useMemo(
    () =>
      desktop
        ? {
            desktop,
            animation: "fade" as const,
            backdrop: { justifyContent: "center", alignItems: "center", padding: t.space.xl } as ViewStyle,
            sheet: {
              width: "100%",
              maxWidth,
              maxHeight: "90%",
              borderRadius: t.radius.xl,
              borderTopLeftRadius: t.radius.xl,
              borderTopRightRadius: t.radius.xl,
            } as ViewStyle,
          }
        : { desktop, animation: "slide" as const, backdrop: null, sheet: null },
    [desktop, maxWidth, t],
  );
}

const useStyles = makeStyles((th) => ({
  table: {
    backgroundColor: th.c.surface,
    borderRadius: th.radius.lg,
    borderWidth: 1,
    borderColor: th.c.line,
    overflow: "hidden",
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.md,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm + 2,
    backgroundColor: th.c.surface2,
    borderBottomWidth: 1,
    borderBottomColor: th.c.line,
  },
  sortable: { cursor: "pointer" } as ViewStyle,
  sortInner: { flexDirection: "row", alignItems: "center", gap: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.md,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.md,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: th.c.line,
  },
  lastRow: { borderBottomWidth: 0 },
  rowHover: { backgroundColor: th.c.oliveSoft },
  rowPressed: { opacity: 0.8 },
  chevCell: { width: 18, alignItems: "flex-end" },
  empty: { padding: th.space.lg },
}));
