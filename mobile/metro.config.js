const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push("mjs");

// react-native-maps has no web build: the web app uses a Leaflet stand-in with the same API.
const webMaps = path.resolve(__dirname, "src/web/LeafletMaps.tsx");
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "react-native-maps") {
    return { type: "sourceFile", filePath: webMaps };
  }
  return defaultResolve ? defaultResolve(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
