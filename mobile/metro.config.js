const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push("mjs");

// react-native-maps needs a Google Maps key on Android and has no web build: both use a Leaflet stand-in with the same API.
const webMaps = path.resolve(__dirname, "src/web/LeafletMaps.tsx");
const nativeMaps = path.resolve(__dirname, "src/native/WebViewMaps.tsx");
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react-native-maps") {
    return { type: "sourceFile", filePath: platform === "web" ? webMaps : nativeMaps };
  }
  return defaultResolve ? defaultResolve(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
