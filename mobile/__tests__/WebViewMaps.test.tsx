import React from "react";

jest.mock("react-native-webview", () => ({ WebView: () => null }));
jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: false })),
  getLastKnownPositionAsync: jest.fn(async () => null),
}));

import { leafletHtml } from "../src/native/leafletHtml";
import { Callout, collectItems, Marker, Polygon, UrlTile } from "../src/native/WebViewMaps";

describe("WebView map adapter", () => {
  it("flattens markers, polygons and tiles from nested children and keeps press handlers", () => {
    const onPin = jest.fn();
    const tree = (
      <>
        <UrlTile urlTemplate="https://t/{z}/{x}/{y}.png" maximumZ={13} zIndex={1} opacity={0.8} />
        {[1, 2].map((i) => (
          <Polygon key={i} coordinates={[{ latitude: 0, longitude: i }]} strokeColor="#fff" onPress={onPin} />
        ))}
        {false}
        <>
          <Marker coordinate={{ latitude: 1, longitude: 2 }} pinColor="gold" title="Chantier" onPress={onPin}>
            <Callout />
          </Marker>
        </>
      </>
    );
    const { items, handlers } = collectItems(tree);
    expect(items.map((i) => i.k)).toEqual(["tile", "polygon", "polygon", "marker"]);
    expect(items[3].p).toEqual({ coordinate: { latitude: 1, longitude: 2 }, title: "Chantier", pinColor: "gold" });
    expect(items[0].p).toMatchObject({ urlTemplate: "https://t/{z}/{x}/{y}.png", maximumZ: 13 });
    expect(JSON.stringify(items)).not.toContain("onPress");
    handlers[3]?.({ nativeEvent: { coordinate: { latitude: 1, longitude: 2 } } });
    expect(onPin).toHaveBeenCalledTimes(1);
  });

  it("builds a self-contained Leaflet page centred on the start region", () => {
    const html = leafletHtml({ latitude: -0.8, longitude: 11.6, zoom: 6 }, "satellite");
    expect(html).toContain("setView([-0.8, 11.6], 6)");
    expect(html).toContain('setBase("satellite")');
    expect(html).toContain("window.__apply");
    expect(html).toContain("ReactNativeWebView.postMessage");
  });
});
