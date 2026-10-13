import { distanceM, exifGps, exifTakenAt } from "../src/utils/exif";

describe("exif", () => {
  it("reads Android flat rational GPS with hemisphere refs", () => {
    const gps = exifGps({
      GPSLatitude: "0/1,24/1,5832/100",
      GPSLatitudeRef: "S",
      GPSLongitude: "9/1,27/1,1476/100",
      GPSLongitudeRef: "E",
    });
    expect(gps?.lat).toBeCloseTo(-(24 / 60 + 58.32 / 3600), 6);
    expect(gps?.lon).toBeCloseTo(9 + 27 / 60 + 14.76 / 3600, 6);
  });

  it("reads iOS nested GPS and date dictionaries", () => {
    const exif = {
      "{GPS}": { Latitude: 0.4162, LatitudeRef: "N", Longitude: 9.4541, LongitudeRef: "E" },
      "{Exif}": { DateTimeOriginal: "2026:10:13 09:41:05" },
    };
    expect(exifGps(exif)).toEqual({ lat: 0.4162, lon: 9.4541 });
    const taken = exifTakenAt(exif) as Date;
    expect([taken.getFullYear(), taken.getMonth(), taken.getDate(), taken.getHours()]).toEqual([2026, 9, 13, 9]);
  });

  it("returns null when the camera wrote no position or date", () => {
    expect(exifGps(null)).toBeNull();
    expect(exifGps({ GPSLatitude: 0, GPSLongitude: 0 })).toBeNull();
    expect(exifTakenAt({ DateTimeOriginal: "inconnue" })).toBeNull();
  });

  it("computes great-circle distances", () => {
    expect(distanceM({ lat: 0, lon: 9 }, { lat: 0, lon: 9.001 })).toBeCloseTo(111.2, 0);
  });
});
