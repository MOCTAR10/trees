/** GeoJSON helpers for react-native-maps (which wants {latitude, longitude}). */

export interface LatLng {
  latitude: number;
  longitude: number;
}

type Position = [number, number];

function ring(coords: Position[]): LatLng[] {
  return coords.map(([longitude, latitude]) => ({ latitude, longitude }));
}

/** Outer rings of a Polygon / MultiPolygon (holes are not drawn). */
export function toPolygons(geometry: { type: string; coordinates: unknown } | null): LatLng[][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as Position[][];
    return rings.length ? [ring(rings[0])] : [];
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as Position[][][])
      .filter((poly) => poly.length > 0)
      .map((poly) => ring(poly[0]));
  }
  return [];
}

/** Compact French number: 22 669 515 -> "22,7 M". */
export function compactFr(value: number | null | undefined): string {
  if (value == null) return "—";
  const abs = Math.abs(value);
  const fmt = (v: number, unit: string) => `${v.toFixed(1).replace(".", ",")} ${unit}`;
  if (abs >= 1e9) return fmt(value / 1e9, "Md");
  if (abs >= 1e6) return fmt(value / 1e6, "M");
  if (abs >= 1e3) return fmt(value / 1e3, "k");
  return value.toFixed(0);
}
