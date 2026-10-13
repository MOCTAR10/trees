/** Viewport maths for the map: zoom level, visible box, marker clustering. */

export interface ViewRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Web-mercator-like zoom level from the visible longitude span. */
export function zoomFor(region: ViewRegion): number {
  const span = Math.max(region.longitudeDelta, 1e-6);
  return Math.max(0, Math.min(22, Math.log2(360 / span)));
}

/** ``west,south,east,north`` of the visible area, padded and clamped. */
export function bboxFor(region: ViewRegion, pad = 0.15): [number, number, number, number] {
  const dLon = (region.longitudeDelta / 2) * (1 + pad);
  const dLat = (region.latitudeDelta / 2) * (1 + pad);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return [
    clamp(region.longitude - dLon, -180, 179.999),
    clamp(region.latitude - dLat, -90, 89.999),
    clamp(region.longitude + dLon, -179.999, 180),
    clamp(region.latitude + dLat, -89.999, 90),
  ];
}

export interface Point<T> {
  latitude: number;
  longitude: number;
  item: T;
}

export interface Cluster<T> {
  key: string;
  latitude: number;
  longitude: number;
  items: T[];
}

/**
 * Grid clustering: points closer than ~1/`cells` of the visible width merge
 * into one bubble placed at their centroid. Cheap enough to rerun on every
 * pan (O(n)), which keeps hundreds of scans fluid on react-native-maps.
 */
export function clusterPoints<T>(points: Point<T>[], region: ViewRegion, cells = 8): Cluster<T>[] {
  const size = Math.max(region.longitudeDelta / cells, 1e-6);
  const buckets = new Map<string, Point<T>[]>();
  for (const p of points) {
    const key = `${Math.floor(p.longitude / size)}:${Math.floor(p.latitude / size)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(p);
    else buckets.set(key, [p]);
  }
  return [...buckets.entries()].map(([key, members]) => ({
    key,
    latitude: members.reduce((s, m) => s + m.latitude, 0) / members.length,
    longitude: members.reduce((s, m) => s + m.longitude, 0) / members.length,
    items: members.map((m) => m.item),
  }));
}

/** Region framing a bounding box (with a margin). */
export function regionForBox(
  west: number,
  south: number,
  east: number,
  north: number,
  margin = 1.3,
): ViewRegion {
  return {
    latitude: (south + north) / 2,
    longitude: (west + east) / 2,
    latitudeDelta: Math.max(0.01, (north - south) * margin),
    longitudeDelta: Math.max(0.01, (east - west) * margin),
  };
}
