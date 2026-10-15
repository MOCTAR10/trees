/**
 * Web stand-in for `react-native-maps` (which has no web build), on Leaflet.
 * metro.config.js resolves `react-native-maps` to this file for the web only;
 * the phone keeps the native map. Covers what the screens use: MapView
 * (initialRegion, mapType, onPress, onLongPress, onRegionChangeComplete,
 * ref.animateToRegion / fitToCoordinates), Marker, Polygon, Polyline, Circle,
 * UrlTile; Callout renders nothing.
 */
import L from "leaflet";
import React, { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useRef, useState } from "react";
import { View } from "react-native";

require("leaflet/dist/leaflet.css");

type LatLng = { latitude: number; longitude: number };
type Region = LatLng & { latitudeDelta: number; longitudeDelta: number };
type PressEvent = { nativeEvent: { coordinate: LatLng } };

const MapContext = createContext<L.Map | null>(null);

const BASE: Record<string, { url: string; attribution: string; labels?: string }> = {
  standard: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagerie © Esri",
  },
  hybrid: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagerie © Esri",
  },
};

const toLatLng = (c: LatLng): L.LatLngTuple => [c.latitude, c.longitude];
const fromLatLng = (p: L.LatLng): LatLng => ({ latitude: p.lat, longitude: p.lng });
const zoomFor = (r: Region) => Math.max(1, Math.min(18, Math.round(Math.log2(360 / Math.max(r.longitudeDelta, 1e-4)))));

function regionOf(map: L.Map): Region {
  const b = map.getBounds();
  const c = map.getCenter();
  return {
    latitude: c.lat,
    longitude: c.lng,
    latitudeDelta: Math.abs(b.getNorth() - b.getSouth()),
    longitudeDelta: Math.abs(b.getEast() - b.getWest()),
  };
}

type MapViewProps = {
  style?: unknown;
  initialRegion?: Region;
  region?: Region;
  mapType?: string;
  onPress?: (e: PressEvent) => void;
  onLongPress?: (e: PressEvent) => void;
  onRegionChangeComplete?: (r: Region) => void;
  testID?: string;
  children?: React.ReactNode;
};

export type MapViewHandle = {
  animateToRegion: (r: Region, duration?: number) => void;
  fitToCoordinates: (coords: LatLng[], opts?: { edgePadding?: { top?: number; right?: number; bottom?: number; left?: number } }) => void;
};

const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(props, ref) {
  const { style, initialRegion, region, mapType = "standard", onPress, onLongPress, onRegionChangeComplete, testID, children } = props;
  const host = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const handlers = useRef({ onPress, onLongPress, onRegionChangeComplete });
  handlers.current = { onPress, onLongPress, onRegionChangeComplete };

  useEffect(() => {
    if (!host.current) return undefined;
    const start = region ?? initialRegion ?? { latitude: -0.8, longitude: 11.6, latitudeDelta: 6, longitudeDelta: 6 };
    const m = L.map(host.current, { zoomControl: true, attributionControl: true }).setView(toLatLng(start), zoomFor(start));
    m.on("click", (e: L.LeafletMouseEvent) => handlers.current.onPress?.({ nativeEvent: { coordinate: fromLatLng(e.latlng) } }));
    m.on("contextmenu", (e: L.LeafletMouseEvent) =>
      handlers.current.onLongPress?.({ nativeEvent: { coordinate: fromLatLng(e.latlng) } }),
    );
    m.on("moveend", () => handlers.current.onRegionChangeComplete?.(regionOf(m)));
    setMap(m);
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(host.current);
    return () => {
      resize.disconnect();
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map) return undefined;
    const base = BASE[mapType] ?? BASE.standard;
    const layers = [L.tileLayer(base.url, { attribution: base.attribution, maxZoom: 19 })];
    if (base.labels) layers.push(L.tileLayer(base.labels, { maxZoom: 19 }));
    layers.forEach((l) => l.addTo(map).bringToBack());
    return () => layers.forEach((l) => l.remove());
  }, [map, mapType]);

  useImperativeHandle(
    ref,
    () => ({
      animateToRegion: (r: Region) => map?.flyTo(toLatLng(r), zoomFor(r), { duration: 0.6 }),
      fitToCoordinates: (coords: LatLng[], opts) => {
        if (!map || coords.length === 0) return;
        const p = opts?.edgePadding ?? {};
        map.fitBounds(L.latLngBounds(coords.map(toLatLng)), {
          paddingTopLeft: [p.left ?? 20, p.top ?? 20],
          paddingBottomRight: [p.right ?? 20, p.bottom ?? 20],
        });
      },
    }),
    [map],
  );

  return (
    <View style={style as never} testID={testID}>
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
      <MapContext.Provider value={map}>{map ? children : null}</MapContext.Provider>
    </View>
  );
});

/** Adds a Leaflet layer while mounted and rebuilds it when its inputs change. */
function useLayer(build: (map: L.Map) => L.Layer | null, deps: unknown[]) {
  const map = useContext(MapContext);
  useEffect(() => {
    if (!map) return undefined;
    const layer = build(map);
    layer?.addTo(map);
    return () => {
      layer?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ...deps]);
}

const PIN: Record<string, string> = { red: "#C0392B", green: "#2E7D32", blue: "#1F6FB2", orange: "#E67E22", gold: "#D4A017" };

export function Marker(props: {
  coordinate: LatLng;
  title?: string;
  description?: string;
  pinColor?: string;
  onPress?: (e: PressEvent) => void;
  zIndex?: number;
  children?: React.ReactNode;
  [key: string]: unknown;
}) {
  const { coordinate, title, description, pinColor, onPress, zIndex } = props;
  useLayer(() => {
    const color = PIN[pinColor ?? ""] ?? pinColor ?? "#C0392B";
    const m = L.circleMarker(toLatLng(coordinate), {
      radius: 8,
      color: "#ffffff",
      weight: 2,
      fillColor: color,
      fillOpacity: 1,
      pane: zIndex && zIndex > 3 ? "markerPane" : "overlayPane",
    });
    if (title || description) m.bindTooltip([title, description].filter(Boolean).join("<br>"));
    m.on("click", (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      onPress?.({ nativeEvent: { coordinate } });
    });
    return m;
  }, [coordinate.latitude, coordinate.longitude, title, description, pinColor, onPress]);
  return null;
}

function pathOptions(p: { strokeColor?: string; fillColor?: string; strokeWidth?: number; lineDashPattern?: number[] }): L.PathOptions {
  return {
    color: p.strokeColor ?? "#3B5A1E",
    weight: p.strokeWidth ?? 1.5,
    fillColor: p.fillColor ?? "transparent",
    fillOpacity: 1,
    dashArray: p.lineDashPattern?.join(" "),
  };
}

type PathProps = {
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  lineDashPattern?: number[];
  onPress?: (e: PressEvent) => void;
  zIndex?: number;
  [key: string]: unknown;
};

function clickable(layer: L.Path, onPress?: (e: PressEvent) => void) {
  if (!onPress) return layer;
  layer.on("click", (e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
    onPress({ nativeEvent: { coordinate: fromLatLng(e.latlng) } });
  });
  return layer;
}

export function Polygon(props: PathProps & { coordinates: LatLng[]; holes?: LatLng[][] }) {
  const { coordinates, holes, onPress } = props;
  useLayer(
    () =>
      clickable(
        L.polygon([coordinates.map(toLatLng), ...(holes ?? []).map((h) => h.map(toLatLng))], pathOptions(props)),
        onPress,
      ),
    [coordinates, holes, props.strokeColor, props.fillColor, props.strokeWidth, onPress],
  );
  return null;
}

export function Polyline(props: PathProps & { coordinates: LatLng[] }) {
  const { coordinates, onPress } = props;
  useLayer(() => clickable(L.polyline(coordinates.map(toLatLng), pathOptions(props)), onPress), [
    coordinates,
    props.strokeColor,
    props.strokeWidth,
    onPress,
  ]);
  return null;
}

export function Circle(props: PathProps & { center: LatLng; radius: number }) {
  const { center, radius, onPress } = props;
  useLayer(() => clickable(L.circle(toLatLng(center), { radius, ...pathOptions(props) }), onPress), [
    center.latitude,
    center.longitude,
    radius,
    props.strokeColor,
    props.fillColor,
    onPress,
  ]);
  return null;
}

export function UrlTile(props: { urlTemplate: string; maximumZ?: number; zIndex?: number; opacity?: number }) {
  const { urlTemplate, maximumZ, zIndex, opacity } = props;
  useLayer(
    () => L.tileLayer(urlTemplate, { maxNativeZoom: maximumZ ?? 19, maxZoom: 19, zIndex: (zIndex ?? 1) + 10, opacity: opacity ?? 1 }),
    [urlTemplate, maximumZ, zIndex, opacity],
  );
  return null;
}

export function Callout() {
  return null;
}

export const PROVIDER_GOOGLE = "google";
export const PROVIDER_DEFAULT = undefined;
export default MapView;
