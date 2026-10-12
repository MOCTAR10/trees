import React from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { GroupTree, listGroupTrees } from "../api/client";
import { fr } from "../i18n/fr";
import { StoredScan } from "../storage/history";
import { colors, spacing, type } from "../theme";

const t = fr.history;

type Scope = "mine" | "group";

interface Props {
  scans: StoredScan[];
  onOpen: (scan: StoredScan) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onBack?: () => void;
}

export default function HistoryScreen({ scans, onOpen, onDelete, onClear, onBack }: Props) {
  const [scope, setScope] = React.useState<Scope>("mine");
  const [group, setGroup] = React.useState<GroupTree[]>([]);
  const [groupLoading, setGroupLoading] = React.useState(false);
  const [groupError, setGroupError] = React.useState<string | null>(null);

  const loadGroup = React.useCallback(async () => {
    setGroupLoading(true);
    setGroupError(null);
    try {
      setGroup(await listGroupTrees(500));
    } catch (err) {
      console.error("group trees failed", err);
      setGroupError(fr.map.error);
    } finally {
      setGroupLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (scope === "group") loadGroup();
  }, [scope, loadGroup]);

  const confirmClear = () => {
    Alert.alert(t.clearConfirmTitle, t.clearConfirmMsg, [
      { text: t.cancel, style: "cancel" },
      { text: t.clear, style: "destructive", onPress: onClear },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        {onBack && (
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.link}>{t.back}</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>{t.title}</Text>
        {scope === "mine" && scans.length > 0 && (
          <TouchableOpacity onPress={confirmClear}>
            <Text style={[styles.link, styles.danger]}>{t.clear}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.segment}>
        <TouchableOpacity
          style={[styles.segBtn, scope === "mine" && styles.segBtnOn]}
          onPress={() => setScope("mine")}
          accessibilityRole="button"
          accessibilityState={{ selected: scope === "mine" }}
        >
          <Text style={[styles.segText, scope === "mine" && styles.segTextOn]}>{t.mine}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segBtn, scope === "group" && styles.segBtnOn]}
          onPress={() => setScope("group")}
          accessibilityRole="button"
          accessibilityState={{ selected: scope === "group" }}
        >
          <Text style={[styles.segText, scope === "group" && styles.segTextOn]}>{t.group}</Text>
        </TouchableOpacity>
      </View>

      {scope === "mine" ? (
        scans.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t.empty}</Text>
          </View>
        ) : (
          <FlatList
            data={scans}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const species =
                item.report.species_common_name_fr ??
                item.report.species_scientific_name ??
                t.unknown;
              const when = new Date(item.created_at).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <View style={styles.row}>
                  <TouchableOpacity style={styles.rowMain} onPress={() => onOpen(item)}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {species}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {t.dbh(item.report.measured_dbh_cm)} · {when} · {item.latitude.toFixed(4)},{" "}
                      {item.longitude.toFixed(4)}
                    </Text>
                    {item.valorization && <Text style={styles.rowPlan}>✓ {t.planDone}</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(item.id)}>
                    <Text style={styles.deleteText}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )
      ) : groupLoading ? (
        <ActivityIndicator style={styles.empty} color={colors.accent} />
      ) : groupError ? (
        <View style={styles.empty}>
          <Text style={styles.error}>{groupError}</Text>
          <TouchableOpacity onPress={loadGroup}>
            <Text style={styles.link}>{fr.common.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : group.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t.emptyGroup}</Text>
        </View>
      ) : (
        <FlatList
          data={group}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const when = new Date(item.created_at).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <View style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.owner_name}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {item.species_scientific_name ?? t.unknown} · {t.dbh(item.measured_dbh_cm)} ·{" "}
                    {when}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minWidth: 0,
  },
  title: { color: colors.text, fontSize: type.heading, fontWeight: "700", flexShrink: 1 },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  danger: { color: colors.error },
  segment: {
    flexDirection: "row",
    margin: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    alignItems: "center",
  },
  segBtnOn: { backgroundColor: colors.surfaceAlt },
  segText: { color: colors.textDim, fontSize: type.body, fontWeight: "600" },
  segTextOn: { color: colors.accent, fontWeight: "800" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  emptyText: { color: colors.textDim, fontSize: type.body },
  error: { color: colors.error, fontSize: type.body },
  list: { padding: spacing.md, gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowMain: { flex: 1, gap: spacing.xs },
  rowTitle: { color: colors.text, fontSize: type.body, fontWeight: "700", fontStyle: "italic" },
  rowMeta: { color: colors.textDim, fontSize: type.caption },
  rowPlan: { color: colors.success, fontSize: type.caption, fontWeight: "700" },
  deleteBtn: {
    marginLeft: spacing.md,
    padding: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
  },
  deleteText: { color: colors.error, fontSize: type.body, fontWeight: "700" },
});
