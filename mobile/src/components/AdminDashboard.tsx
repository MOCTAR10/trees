import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { dashboardOverview, DashboardOverview } from "../api/client";
import { fr } from "../i18n/fr";
import { exportDashboardPdf, sharePdf } from "../pdf";
import { makeStyles, useTheme } from "../design/ThemeProvider";

function fmtInt(value: number | null | undefined): string {
  const n = Math.round(Number(value ?? 0));
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function fmtNum(value: number | null | undefined, digits: number): string {
  return Number(value ?? 0)
    .toFixed(digits)
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Ministry view: cross-cutting operational rollup (workflow analysis §7.2 pt 7). */
export default function AdminDashboard() {
  const th = useTheme();
  const styles = useStyles();
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await dashboardOverview());
    } catch (err) {
      console.error("dashboard load failed", err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const exportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      await sharePdf(await exportDashboardPdf());
    } catch (err) {
      console.error("dashboard export failed", err);
      setError(fr.dashboard.error);
    } finally {
      setExporting(false);
    }
  };

  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={th.c.olive} />
      </View>
    );
  }

  const { harvest } = data;
  const cards = [
    { key: "felled", label: fr.dashboard.harvested, value: fmtInt(harvest.stems_felled) },
    {
      key: "volume",
      label: fr.dashboard.volume,
      value: `${fmtNum(harvest.estimated_volume_m3, 1)} m³`,
    },
    {
      key: "transform",
      label: fr.dashboard.transformation,
      value: `${fmtNum(harvest.transformation_rate * 100, 1)} %`,
    },
    { key: "overdue", label: fr.dashboard.overdue, value: fmtInt(data.taxes.overdue) },
  ];

  return (
    <ScrollView contentContainerStyle={styles.list} testID="admin-dashboard">
      <View style={styles.grid}>
        {cards.map((c) => (
          <View key={c.key} style={styles.cell} testID={`dashboard-card-${c.key}`}>
            <Text style={styles.cellValue}>{c.value}</Text>
            <Text style={styles.cellLabel}>{c.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.row}>
        <Text style={styles.section}>{fr.dashboard.bySpecies}</Text>
        <TouchableOpacity
          style={styles.exportBtn}
          disabled={exporting}
          onPress={() => void exportPdf()}
          testID="dashboard-export"
        >
          <Text style={styles.exportText}>{fr.dashboard.export}</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.table}>
        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.colSpecies]}>{fr.dashboard.species}</Text>
          <Text style={[styles.th, styles.colNum]}>{fr.dashboard.stems}</Text>
          <Text style={[styles.th, styles.colNum]}>m³</Text>
        </View>
        {harvest.by_species.length === 0 ? (
          <Text style={styles.dim}>{fr.dashboard.noHarvest}</Text>
        ) : (
          harvest.by_species.map((s) => (
            <View key={s.species} style={styles.tr}>
              <Text style={[styles.td, styles.colSpecies]}>{s.species}</Text>
              <Text style={[styles.td, styles.colNum]}>{fmtInt(s.stems)}</Text>
              <Text style={[styles.td, styles.colNum]}>{fmtNum(s.volume_m3, 2)}</Text>
            </View>
          ))
        )}
      </View>

      <Text style={styles.section}>{fr.dashboard.governance}</Text>
      <Row label={fr.dashboard.titles} value={fmtInt(data.titles.total)} />
      <Row label={fr.dashboard.surface} value={`${fmtInt(data.titles.surface_ha)} ha`} />
      <Row label={fr.dashboard.aac} value={fmtInt(data.aac.total)} />
      <Row label={fr.dashboard.possibility} value={`${fmtNum(data.aac.possibility_m3, 0)} m³`} />
      <Row label={fr.dashboard.documents} value={fmtInt(data.documents.total)} />
      <Row label={fr.dashboard.documentsExpired} value={fmtInt(data.documents.expired)} />
      <Row label={fr.dashboard.documentsExpiring} value={fmtInt(data.documents.expiring_soon)} />

      <Text style={styles.section}>{fr.dashboard.taxes}</Text>
      <Row
        label={fr.dashboard.overdueAmount}
        value={`${fmtInt(data.taxes.overdue_amount_fcfa)} FCFA`}
      />
      <Row label={fr.dashboard.receipts} value={fmtInt(data.taxes.receipts)} />

      <Text style={styles.section}>{fr.dashboard.community}</Text>
      <Row
        label={fr.dashboard.agreements}
        value={`${fmtInt(data.community.agreements)} (${fmtInt(data.community.active)} ${fr.dashboard.active})`}
      />
      <Row
        label={fr.dashboard.contribution}
        value={`${fmtInt(data.community.contribution_fcfa)} FCFA`}
      />
      <Row
        label={fr.dashboard.annualVolume}
        value={`${fmtNum(data.community.annual_volume_m3, 0)} m³`}
      />

      <Text style={styles.section}>{fr.dashboard.transport}</Text>
      <Row label={fr.dashboard.transportDocs} value={fmtInt(data.transport.documents)} />
      <Row
        label={fr.dashboard.transportVolume}
        value={`${fmtNum(data.transport.volume_m3, 1)} m³`}
      />

      <Text style={styles.section}>{fr.dashboard.certifications}</Text>
      <Row label={fr.dashboard.certifications} value={fmtInt(data.certifications.total)} />
      {data.certifications.by_scheme.map((s) => (
        <Row key={s.scheme} label={s.scheme} value={fmtInt(s.count)} />
      ))}

      {data.carbon ? (
        <View testID="dashboard-carbon">
          <Text style={styles.section}>{fr.dashboard.carbon}</Text>
          <Row
            label={fr.dashboard.carbonStock}
            value={`${fmtNum(data.carbon.co2e_kg / 1000, 2)} t CO₂e`}
          />
          <Row label={fr.dashboard.carbonScans} value={fmtInt(data.carbon.scans)} />
          <Row label={fr.dashboard.carbonReference} value={fmtInt(data.carbon.reference_scans)} />
          <Row label={fr.dashboard.carbonLinked} value={fmtInt(data.carbon.linked_scans)} />
          {data.carbon.by_aac.map((a) => (
            <Row
              key={a.aac_id}
              label={`${a.aac_label}${a.title_ref ? ` · ${a.title_ref}` : ""}`}
              value={`${fmtNum(a.co2e_kg / 1000, 2)} t (${fmtInt(a.scans)})`}
            />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const th = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: th.space.sm },
  list: { padding: th.space.lg, gap: th.space.xs },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: th.space.sm },
  cell: {
    width: "48%",
    backgroundColor: th.c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.lg,
    gap: th.space.xs,
  },
  cellValue: { color: th.c.ink, fontSize: 19, fontFamily: th.fonts.bodyBold },
  cellLabel: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: th.space.lg,
  },
  section: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold, marginTop: th.space.sm },
  exportBtn: {
    borderRadius: 8,
    paddingVertical: th.space.xs,
    paddingHorizontal: th.space.lg,
    backgroundColor: th.c.surface2,
    borderWidth: 1,
    borderColor: th.c.line,
  },
  exportText: { color: th.c.ink, fontSize: 12, fontFamily: th.fonts.bodyBold },
  error: { color: th.c.risk, fontSize: 15, fontFamily: th.fonts.body },
  table: {
    backgroundColor: th.c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.lg,
    gap: th.space.xs,
  },
  tableHead: { flexDirection: "row", alignItems: "center" },
  th: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.bodyBold },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: th.c.line,
    paddingTop: th.space.xs,
  },
  td: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.body },
  colSpecies: { flex: 1 },
  colNum: { width: 70, textAlign: "right" },
  dim: { color: th.c.muted, fontSize: 15, fontFamily: th.fonts.body, paddingVertical: th.space.sm },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: th.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: th.c.line,
  },
  kvLabel: { color: th.c.muted, fontSize: 15, fontFamily: th.fonts.body, flex: 1 },
  kvValue: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold },
}));
