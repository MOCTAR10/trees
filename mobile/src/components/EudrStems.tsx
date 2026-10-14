import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { DiligenceStem, listDiligenceStems } from "../api/client";
import { fr } from "../i18n/fr";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import Badge, { Tone } from "./Badge";

function stemTone(inside: boolean | null): Tone {
  if (inside === true) return "success";
  if (inside === false) return "danger";
  return "neutral";
}

function stemLabel(inside: boolean | null): string {
  if (inside === true) return fr.fiscal.stemInside;
  if (inside === false) return fr.fiscal.stemOutside;
  return fr.fiscal.stemUnknown;
}

function coords(stem: DiligenceStem): string | null {
  if (stem.latitude == null || stem.longitude == null) return null;
  return `${stem.latitude.toFixed(4)}, ${stem.longitude.toFixed(4)}`;
}

/**
 * EUDR per-log geolocation (Slice 12): reveals the exact felling location of
 * each harvested stem of a diligence and whether that point falls inside the
 * declared parcel polygon. Read-only, shared by the company and the Ministry.
 */
export default function EudrStems({ diligenceId }: { diligenceId: number }) {
  const th = useTheme();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [stems, setStems] = useState<DiligenceStem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (loaded) return;
    setLoading(true);
    setError(null);
    try {
      setStems(await listDiligenceStems(diligenceId));
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.smallBtn}
        onPress={() => void toggle()}
        testID={`eudr-stems-${diligenceId}`}
      >
        <Text style={styles.smallBtnText}>
          {open ? fr.fiscal.hideGeolocation : fr.fiscal.verifyGeolocation}
        </Text>
      </TouchableOpacity>

      {open && loading ? <ActivityIndicator color={th.c.olive} /> : null}
      {open && !loading && error ? <Text style={styles.error}>{error}</Text> : null}
      {open && !loading && !error && stems.length === 0 ? (
        <Text style={styles.dim}>{fr.fiscal.noGeolocatedStems}</Text>
      ) : null}
      {open && !loading && !error
        ? stems.map((s) => (
            <View key={s.tree_code} style={styles.row} testID={`eudr-stem-${s.tree_code}`}>
              <View style={styles.main}>
                <Text style={styles.code}>{s.tree_code}</Text>
                {s.species_scientific_name ? (
                  <Text style={styles.meta}>{s.species_scientific_name}</Text>
                ) : null}
                {coords(s) ? <Text style={styles.meta}>{coords(s)}</Text> : null}
              </View>
              <Badge label={stemLabel(s.inside)} tone={stemTone(s.inside)} />
            </View>
          ))
        : null}
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  wrap: { marginTop: th.space.sm },
  smallBtn: {
    alignSelf: "flex-start",
    borderColor: th.c.line,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: th.space.sm,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.xs,
  },
  smallBtnText: { color: th.c.olive, fontSize: 12, fontFamily: th.fonts.bodyBold },
  row: {
    alignItems: "center",
    borderTopColor: th.c.line,
    borderTopWidth: 1,
    flexDirection: "row",
    paddingVertical: th.space.sm,
  },
  main: { flex: 1 },
  code: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold },
  meta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  dim: { color: th.c.muted, fontSize: 15, fontFamily: th.fonts.body },
  error: { color: th.c.risk, fontSize: 12, fontFamily: th.fonts.bodyBold },
}));
