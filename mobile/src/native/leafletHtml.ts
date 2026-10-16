export const LEAFLET_VERSION = "1.9.4";

export interface MapStart {
  latitude: number;
  longitude: number;
  zoom: number;
}

export function leafletHtml(start: MapStart, mapType: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css">
<style>
html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #dfe6dc; }
.leaflet-container { font-family: sans-serif; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js"></script>
<script>
(function () {
  var BASE = {
    standard: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "© OpenStreetMap" },
    satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Imagerie © Esri" },
    hybrid: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      attribution: "Imagerie © Esri"
    }
  };
  var PIN = { red: "#C0392B", green: "#2E7D32", blue: "#1F6FB2", orange: "#E67E22", gold: "#D4A017" };
  function post(o) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  function ll(c) { return [c.latitude, c.longitude]; }
  function pt(p) { return { latitude: p.lat, longitude: p.lng }; }

  var map = L.map("map", { zoomControl: false, attributionControl: true }).setView([${start.latitude}, ${start.longitude}], ${start.zoom});
  var baseLayers = [];
  var items = [];
  var user = null;

  function setBase(type) {
    baseLayers.forEach(function (l) { l.remove(); });
    var b = BASE[type] || BASE.standard;
    baseLayers = [L.tileLayer(b.url, { attribution: b.attribution, maxZoom: 19 })];
    if (b.labels) baseLayers.push(L.tileLayer(b.labels, { maxZoom: 19 }));
    baseLayers.forEach(function (l) { l.addTo(map); if (l.bringToBack) l.bringToBack(); });
  }
  setBase(${JSON.stringify(mapType)});

  function pathOpts(p) {
    return { color: p.strokeColor || "#3B5A1E", weight: p.strokeWidth || 1.5, fillColor: p.fillColor || "transparent", fillOpacity: 1, dashArray: p.lineDashPattern ? p.lineDashPattern.join(" ") : undefined };
  }

  function press(layer) {
    layer.on("click", function (e) {
      L.DomEvent.stopPropagation(e);
      post({ t: "press", id: layer.__id, c: pt(e.latlng) });
    });
    return layer;
  }

  function build(it) {
    var p = it.p;
    if (it.k === "marker") {
      var color = PIN[p.pinColor || ""] || p.pinColor || "#C0392B";
      var m = L.circleMarker(ll(p.coordinate), { radius: 8, color: "#ffffff", weight: 2, fillColor: color, fillOpacity: 1 });
      if (p.title || p.description) m.bindTooltip([p.title, p.description].filter(Boolean).join("<br>"));
      m.on("click", function (e) {
        L.DomEvent.stopPropagation(e);
        post({ t: "press", id: m.__id, c: p.coordinate });
      });
      return m;
    }
    if (it.k === "polygon") {
      var rings = [p.coordinates.map(ll)].concat((p.holes || []).map(function (h) { return h.map(ll); }));
      return press(L.polygon(rings, pathOpts(p)));
    }
    if (it.k === "polyline") return press(L.polyline(p.coordinates.map(ll), pathOpts(p)));
    if (it.k === "circle") {
      var o = pathOpts(p);
      o.radius = p.radius;
      return press(L.circle(ll(p.center), o));
    }
    if (it.k === "tile") {
      return L.tileLayer(p.urlTemplate, { maxNativeZoom: p.maximumZ || 19, maxZoom: 19, zIndex: (p.zIndex || 1) + 10, opacity: p.opacity == null ? 1 : p.opacity });
    }
    return null;
  }

  var layerMap = {};
  var userLayer = null;
  function render() {
    var seen = {};
    items.forEach(function (it) {
      var key = it.k + ":" + JSON.stringify(it.p);
      seen[key] = true;
      if (layerMap[key]) { layerMap[key].__id = it.id; return; }
      var l = build(it);
      if (!l) return;
      l.__id = it.id;
      l.addTo(map);
      layerMap[key] = l;
    });
    Object.keys(layerMap).forEach(function (k) {
      if (!seen[k]) { layerMap[k].remove(); delete layerMap[k]; }
    });
    if (userLayer) { userLayer.remove(); userLayer = null; }
    if (user) {
      userLayer = L.circleMarker([user.latitude, user.longitude], { radius: 7, color: "#ffffff", weight: 3, fillColor: "#1F6FB2", fillOpacity: 1 });
      userLayer.addTo(map);
    }
  }

  function regionOf() {
    var b = map.getBounds();
    var c = map.getCenter();
    return { latitude: c.lat, longitude: c.lng, latitudeDelta: Math.abs(b.getNorth() - b.getSouth()), longitudeDelta: Math.abs(b.getEast() - b.getWest()) };
  }
  function zoomFor(r) { return Math.max(1, Math.min(18, Math.round(Math.log2(360 / Math.max(r.longitudeDelta, 1e-4))))); }

  map.on("click", function (e) { post({ t: "map", c: pt(e.latlng) }); });
  var regionTimer = null;
  map.on("moveend", function () {
    clearTimeout(regionTimer);
    regionTimer = setTimeout(function () { post({ t: "region", r: regionOf() }); }, 280);
  });

  var lastLong = 0;
  function long(c) {
    var now = Date.now();
    if (now - lastLong < 900) return;
    lastLong = now;
    post({ t: "long", c: c });
  }
  map.on("contextmenu", function (e) { long(pt(e.latlng)); });
  var timer = null;
  var startPt = null;
  var el = map.getContainer();
  el.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) { clearTimeout(timer); return; }
    var t = e.touches[0];
    startPt = { x: t.clientX, y: t.clientY };
    clearTimeout(timer);
    timer = setTimeout(function () {
      var rect = el.getBoundingClientRect();
      var latlng = map.containerPointToLatLng([startPt.x - rect.left, startPt.y - rect.top]);
      long(pt(latlng));
    }, 650);
  }, { passive: true });
  el.addEventListener("touchmove", function (e) {
    var t = e.touches[0];
    if (startPt && (Math.abs(t.clientX - startPt.x) > 8 || Math.abs(t.clientY - startPt.y) > 8)) clearTimeout(timer);
  }, { passive: true });
  el.addEventListener("touchend", function () { clearTimeout(timer); }, { passive: true });

  window.__apply = function (msg) {
    if (msg.mapType) setBase(msg.mapType);
    if (msg.items) { items = msg.items; }
    if (msg.hasOwnProperty("user")) { user = msg.user; }
    render();
  };
  window.__fly = function (r) { map.flyTo([r.latitude, r.longitude], zoomFor(r), { duration: 0.6 }); };
  window.__fit = function (coords, pad) {
    if (!coords.length) return;
    map.fitBounds(L.latLngBounds(coords.map(ll)), { paddingTopLeft: [pad.left, pad.top], paddingBottomRight: [pad.right, pad.bottom] });
  };
  window.__zoom = function (d) { map.setZoom(map.getZoom() + d); };

  post({ t: "ready" });
  post({ t: "region", r: regionOf() });
})();
</script>
</body>
</html>`;
}
