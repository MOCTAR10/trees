import React, { useMemo, useRef, useState } from "react";
import {
  Image,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { fr } from "../i18n/fr";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { dbhFromEdges, isPlausibleDbh, moveEdge } from "../utils/dbh";

const t = fr.capture;

export interface Edges {
  left: number;
  right: number;
}

interface Props {
  uri: string;
  /** Photo size in pixels (as displayed, i.e. after EXIF rotation). */
  widthPx: number;
  heightPx: number;
  focal35mm?: number;
  distanceM: number | null;
  edges: Edges;
  onChange: (edges: Edges) => void;
}

/**
 * The operator drags two vertical lines onto the trunk's edges; the diameter
 * is shown live, computed on the phone (offline) with the server's geometry.
 */
export default function EdgeAdjuster({
  uri,
  widthPx,
  heightPx,
  focal35mm,
  distanceM,
  edges,
  onChange,
}: Props) {
  const th = useTheme();
  const styles = useStyles();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Displayed photo rectangle inside the box (resizeMode "contain").
  const rect = useMemo(() => {
    if (!box.width || !box.height || !widthPx || !heightPx) return null;
    const scale = Math.min(box.width / widthPx, box.height / heightPx);
    const w = widthPx * scale;
    const h = heightPx * scale;
    return { x: (box.width - w) / 2, y: (box.height - h) / 2, w, h };
  }, [box, widthPx, heightPx]);
  const rectRef = useRef(rect);
  rectRef.current = rect;

  const makeResponder = (side: "left" | "right") => {
    let start = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        start = edgesRef.current[side];
      },
      onPanResponderMove: (_e, g) => {
        const r = rectRef.current;
        if (!r) return;
        onChangeRef.current(moveEdge(edgesRef.current, side, start, g.dx, r.w));
      },
    });
  };
  const leftResponder = useRef(makeResponder("left")).current;
  const rightResponder = useRef(makeResponder("right")).current;

  const dbh =
    distanceM && distanceM > 0
      ? dbhFromEdges({ ...edges, widthPx, heightPx, focal35mm, distanceM })
      : null;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ width, height });
  };

  return (
    <View style={styles.fill} onLayout={onLayout} testID="edge-adjuster">
      <Image source={{ uri }} style={styles.fill} resizeMode="contain" />
      {rect ? (
        <>
          <View
            style={[
              styles.shade,
              { left: rect.x + edges.left * rect.w, width: (edges.right - edges.left) * rect.w, top: rect.y, height: rect.h },
            ]}
            pointerEvents="none"
          />
          {(["left", "right"] as const).map((side) => (
            <View
              key={side}
              testID={`edge-${side}`}
              {...(side === "left" ? leftResponder : rightResponder).panHandlers}
              style={[styles.handle, { left: rect.x + edges[side] * rect.w - 22, top: rect.y, height: rect.h }]}
            >
              <View style={styles.line} />
              <View style={styles.grip}>
                <Text style={styles.gripText}>◀▶</Text>
              </View>
            </View>
          ))}
        </>
      ) : null}
      <View style={styles.readout} pointerEvents="none">
        <Text style={styles.readoutText} testID="edge-dbh">
          {dbh == null
            ? t.edgesNeedDistance
            : isPlausibleDbh(dbh)
              ? t.edgesDbh(dbh)
              : t.edgesImplausible}
        </Text>
        <Text style={styles.readoutHint}>{t.edgesHint}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  shade: { position: "absolute", backgroundColor: "rgba(212,160,23,0.18)" },
  handle: { position: "absolute", width: 44, alignItems: "center" },
  line: { position: "absolute", top: 0, bottom: 0, width: 3, backgroundColor: th.c.gold },
  grip: {
    position: "absolute",
    top: "45%",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: th.c.gold,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  gripText: { color: "#1B2114", fontSize: 11, fontFamily: th.fonts.bodyBold },
  readout: {
    position: "absolute",
    top: th.space.lg,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 10,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.xs,
    alignItems: "center",
  },
  readoutText: { color: "#FFFFFF", fontSize: 19, fontFamily: th.fonts.bodyBold },
  readoutHint: { color: "#DDDDDD", fontSize: 12, fontFamily: th.fonts.body },
}));
