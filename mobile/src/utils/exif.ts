/**
 * Position and date written by the camera into a photo (EXIF), as returned by
 * expo-image-picker: flat keys on Android (`GPSLatitude` as "d/1,m/1,s/100"),
 * nested `{GPS}` / `{Exif}` dictionaries on iOS.
 */

type Exif = Record<string, unknown> | null | undefined;

function rational(part: string): number {
  const [n, d] = part.split("/").map((x) => parseFloat(x));
  return d ? n / d : n;
}

function coordinate(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (Array.isArray(raw) && raw.length === 3) {
    const [d, m, s] = raw.map((x) => (typeof x === "number" ? x : rational(String(x))));
    return d + m / 60 + s / 3600;
  }
  if (typeof raw === "string" && raw.trim()) {
    const parts = raw.split(",");
    if (parts.length === 3) {
      const [d, m, s] = parts.map((p) => rational(p.trim()));
      return d + m / 60 + s / 3600;
    }
    const v = rational(raw.trim());
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

function nested(exif: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const v = exif[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Photo position (decimal degrees), or `null` when the camera wrote none. */
export function exifGps(exif: Exif): { lat: number; lon: number } | null {
  if (!exif) return null;
  const gps = nested(exif, "{GPS}") ?? nested(exif, "GPS");
  const lat = coordinate(gps ? gps.Latitude : exif.GPSLatitude);
  const lon = coordinate(gps ? gps.Longitude : exif.GPSLongitude);
  if (lat == null || lon == null || (lat === 0 && lon === 0)) return null;
  const latRef = String((gps ? gps.LatitudeRef : exif.GPSLatitudeRef) ?? "N").toUpperCase();
  const lonRef = String((gps ? gps.LongitudeRef : exif.GPSLongitudeRef) ?? "E").toUpperCase();
  const signedLat = latRef.startsWith("S") ? -Math.abs(lat) : lat;
  const signedLon = lonRef.startsWith("W") ? -Math.abs(lon) : lon;
  if (Math.abs(signedLat) > 90 || Math.abs(signedLon) > 180) return null;
  return { lat: signedLat, lon: signedLon };
}

/** When the photo was taken ("YYYY:MM:DD HH:MM:SS", local time), or `null`. */
export function exifTakenAt(exif: Exif): Date | null {
  if (!exif) return null;
  const sub = nested(exif, "{Exif}") ?? nested(exif, "Exif");
  const raw = (sub?.DateTimeOriginal ?? exif.DateTimeOriginal ?? exif.DateTime) as unknown;
  if (typeof raw !== "string") return null;
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Beyond these, an imported photo may not show this tree, here, today. */
export const IMPORT_MAX_DISTANCE_M = 100;
export const IMPORT_MAX_AGE_H = 24;
