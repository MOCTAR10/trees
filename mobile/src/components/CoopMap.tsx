import React from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

interface Props {
  origin: { latitude: number; longitude: number };
  target: { latitude: number; longitude: number; name: string };
}

export default function CoopMap({ origin, target }: Props) {
  const midLat = (origin.latitude + target.latitude) / 2;
  const midLon = (origin.longitude + target.longitude) / 2;
  const latDelta = Math.max(0.01, Math.abs(origin.latitude - target.latitude) * 2.2);
  const lonDelta = Math.max(0.01, Math.abs(origin.longitude - target.longitude) * 2.2);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{fr.valorization.mapTitle}</Text>
      <MapView
        style={styles.map}
        initialRegion={{ latitude: midLat, longitude: midLon, latitudeDelta: latDelta, longitudeDelta: lonDelta }}
      >
        <Marker coordinate={origin} title={fr.valorization.scanPoint} pinColor={colors.accent} />
        <Marker coordinate={target} title={target.name} pinColor={colors.success} />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { color: colors.textDim, fontSize: type.caption, textTransform: "uppercase" },
  map: { height: 180, borderRadius: 12 },
});