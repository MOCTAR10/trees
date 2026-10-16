import * as Location from "expo-location";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

import { leafletHtml } from "./leafletHtml";

type LatLng = { latitude: number; longitude: number };
type Region = LatLng & { latitudeDelta: number; longitudeDelta: number };
type PressEvent = { nativeEvent: { coordinate: LatLng } };
type Press = (e: PressEvent) => void;

export type MapViewHandle = {
  animateToRegion: (r: Region, duration?: number) => void;
  fitToCoordinates: (
    coords: LatLng[],
    opts?: { edgePadding?: { top?: number; right?: number; bottom?: number; left?: number } },
  ) => void;
};

type MapViewProps = {
  style?: unknown;
  initialRegion?: Region;
  region?: Region;
  mapType?: string;
  showsUserLocation?: boolean;
  onPress?: Press;
  onLongPress?: Press;
  onRegionChangeComplete?: (r: Region) => void;
  testID?: string;
  children?: React.ReactNode;
};

interface PathProps {
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  lineDashPattern?: number[];
  onPress?: Press;
  zIndex?: number;
}

const KIND = {
  marker: "marker",
  polygon: "polygon",
  polyline: "polyline",
  circle: "circle",
  tile: "tile",
} as const;

type Kind = (typeof KIND)[keyof typeof KIND];

function mark<T>(kind: Kind, name: string): T {
  const fn = (() => null) as unknown as T & { __kind: Kind; displayName: string };
  fn.__kind = kind;
  fn.displayName = name;
  return fn;
}

export const Marker = mark<
  (props: {
    coordinate: LatLng;
    title?: string;
    description?: string;
    pinColor?: string;
    onPress?: Press;
    zIndex?: number;
  }) => null
>(KIND.marker, "Marker");

export const Polygon = mark<(props: PathProps & { coordinates: LatLng[]; holes?: LatLng[][] }) => null>(
  KIND.polygon,
  "Polygon",
);

export const Polyline = mark<(props: PathProps & { coordinates: LatLng[] }) => null>(
  KIND.polyline,
  "Polyline",
);

export const Circle = mark<(props: PathProps & { center: LatLng; radius: number }) => null>(
  KIND.circle,
  "Circle",
);

export const UrlTile = mark<
  (props: { urlTemplate: string; maximumZ?: number; zIndex?: number; opacity?: number }) => null
>(KIND.tile, "UrlTile");

export function Callout() {
  return null;
}

export const PROVIDER_GOOGLE = "google";
export const PROVIDER_DEFAULT = undefined;

export interface MapItem {
  id: number;
  k: Kind;
  p: Record<string, unknown>;
}

const DATA_KEYS: Record<Kind, string[]> = {
  marker: ["coordinate", "title", "description", "pinColor"],
  polygon: ["coordinates", "holes", "strokeColor", "fillColor", "strokeWidth", "lineDashPattern"],
  polyline: ["coordinates", "strokeColor", "strokeWidth", "lineDashPattern"],
  circle: ["center", "radius", "strokeColor", "fillColor", "strokeWidth"],
  tile: ["urlTemplate", "maximumZ", "zIndex", "opacity"],
};

function walk(node: React.ReactNode, out: React.ReactElement[]) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement(child)) return;
    const el = child as React.ReactElement<{ children?: React.ReactNode }>;
    if ((el.type as { __kind?: Kind }).__kind) {
      out.push(el);
    } else if (el.props?.children) {
      walk(el.props.children, out);
    }
  });
}

/** Flattens the declarative children into serialisable layers plus their press handlers. */
export function collectItems(children: React.ReactNode): { items: MapItem[]; handlers: (Press | undefined)[] } {
  const elements: React.ReactElement[] = [];
  walk(children, elements);
  const items: MapItem[] = [];
  const handlers: (Press | undefined)[] = [];
  elements.forEach((el, id) => {
    const kind = (el.type as unknown as { __kind: Kind }).__kind;
    const props = el.props as Record<string, unknown>;
    const p: Record<string, unknown> = {};
    for (const key of DATA_KEYS[kind]) if (props[key] !== undefined) p[key] = props[key];
    items.push({ id, k: kind, p });
    handlers.push(props.onPress as Press | undefined);
  });
  return { items, handlers };
}

const FALLBACK: Region = { latitude: -0.8, longitude: 11.6, latitudeDelta: 6, longitudeDelta: 6 };
const zoomFor = (r: Region) => Math.max(1, Math.min(18, Math.round(Math.log2(360 / Math.max(r.longitudeDelta, 1e-4)))));

const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(props, ref) {
  const { style, initialRegion, region, mapType = "standard", showsUserLocation, testID, children } = props;
  const web = useRef<WebView>(null);
  const ready = useRef(false);
  const lastSent = useRef("");
  const user = useRef<LatLng | null>(null);
  const handlersRef = useRef<{ onPress?: Press; onLongPress?: Press; onRegionChangeComplete?: (r: Region) => void }>({});
  handlersRef.current = {
    onPress: props.onPress,
    onLongPress: props.onLongPress,
    onRegionChangeComplete: props.onRegionChangeComplete,
  };

  const collected = useMemo(() => collectItems(children), [children]);
  const itemHandlers = useRef<(Press | undefined)[]>([]);
  itemHandlers.current = collected.handlers;

  const start = region ?? initialRegion ?? FALLBACK;
  const html = useMemo(
    () => leafletHtml({ latitude: start.latitude, longitude: start.longitude, zoom: zoomFor(start) }, mapType),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const run = useCallback((js: string) => web.current?.injectJavaScript(`${js};true;`), []);

  const push = useCallback(() => {
    if (!ready.current) return;
    const payload = JSON.stringify({ items: collected.items, mapType, user: user.current });
    if (payload === lastSent.current) return;
    lastSent.current = payload;
    run(`window.__apply(${payload})`);
  }, [collected.items, mapType, run]);

  useEffect(push, [push]);

  useEffect(() => {
    if (!showsUserLocation) {
      user.current = null;
      push();
      return undefined;
    }
    let alive = true;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted) return;
        const pos = await Location.getLastKnownPositionAsync();
        if (alive && pos) {
          user.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          lastSent.current = "";
          push();
        }
      } catch {
        user.current = null;
      }
    })();
    return () => {
      alive = false;
    };
  }, [showsUserLocation, push]);

  useImperativeHandle(
    ref,
    () => ({
      animateToRegion: (r: Region) => run(`window.__fly(${JSON.stringify(r)})`),
      fitToCoordinates: (coords, opts) => {
        const p = opts?.edgePadding ?? {};
        run(
          `window.__fit(${JSON.stringify(coords)}, ${JSON.stringify({
            top: p.top ?? 20,
            right: p.right ?? 20,
            bottom: p.bottom ?? 20,
            left: p.left ?? 20,
          })})`,
        );
      },
    }),
    [run],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: { t: string; id?: number; c?: LatLng; r?: Region };
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.t === "ready") {
        ready.current = true;
        lastSent.current = "";
        push();
      } else if (msg.t === "press" && msg.id != null && msg.c) {
        itemHandlers.current[msg.id]?.({ nativeEvent: { coordinate: msg.c } });
      } else if (msg.t === "map" && msg.c) {
        handlersRef.current.onPress?.({ nativeEvent: { coordinate: msg.c } });
      } else if (msg.t === "long" && msg.c) {
        handlersRef.current.onLongPress?.({ nativeEvent: { coordinate: msg.c } });
      } else if (msg.t === "region" && msg.r) {
        handlersRef.current.onRegionChangeComplete?.(msg.r);
      }
    },
    [push],
  );

  return (
    <View style={style as never} testID={testID}>
      <WebView
        ref={web}
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://greenleaves.ga" }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        mixedContentMode="always"
        overScrollMode="never"
        bounces={false}
        scrollEnabled={false}
        nestedScrollEnabled
        style={{ flex: 1, backgroundColor: "#dfe6dc" }}
      />
    </View>
  );
});

export default MapView;
