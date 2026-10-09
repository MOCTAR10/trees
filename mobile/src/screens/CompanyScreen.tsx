import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  allocateResidue,
  AuthUser,
  CompanyResidue,
  Cooperation,
  companyResidues,
  listCooperatives,
} from "../api/client";
import RoleHeader from "../components/RoleHeader";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

interface Props {
  user: AuthUser;
  onLogout: () => void;
}

export default function CompanyScreen({ user, onLogout }: Props) {
  const [residues, setResidues] = useState<CompanyResidue[]>([]);
  const [cooperatives, setCooperatives] = useState<Cooperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<CompanyResidue | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [residuesData, coopsData] = await Promise.all([
        companyResidues(),
        listCooperatives(),
      ]);
      setResidues(residuesData);
      setCooperatives(coopsData);
    } catch (err) {
      console.error("company load failed", err);
      setError(fr.company.error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const allocate = async (cooperativeId: number) => {
    if (!picking) return;
    try {
      await allocateResidue(picking.id, cooperativeId);
      setPicking(null);
      await load();
    } catch (err) {
      console.error("allocate failed", err);
      setPicking(null);
      setError(fr.company.error);
    }
  };

  const coopName = (id: number | null) => cooperatives.find((c) => c.id === id)?.cooperative_name;

  return (
    <View style={styles.container}>
      <RoleHeader
        title={fr.company.title}
        subtitle={fr.company.subtitle}
        roleLabel={`${fr.roles.company} · ${user.display_name}`}
        onLogout={onLogout}
      />

      {loading ? (
        <ActivityIndicator style={styles.center} color={colors.accent} />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity onPress={load}>
            <Text style={styles.link}>{fr.common.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : residues.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.dim}>{fr.company.empty}</Text>
        </View>
      ) : (
        <FlatList
          data={residues}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.species}>{item.species_scientific_name ?? "—"}</Text>
              <Text style={styles.meta}>
                {fr.company.biomass(item.residue_biomass_kg ?? 0)} · {fr.company.status[item.status]}
              </Text>
              {item.assigned_community_cooperative_id ? (
                <Text style={styles.assigned}>
                  {fr.company.allocatedTo(
                    coopName(item.assigned_community_cooperative_id) ??
                      `#${item.assigned_community_cooperative_id}`,
                  )}
                </Text>
              ) : null}
              {item.status === "available" ? (
                <TouchableOpacity style={styles.action} onPress={() => setPicking(item)}>
                  <Text style={styles.actionText}>{fr.company.allocate}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        />
      )}

      <Modal
        visible={!!picking}
        transparent
        animationType="slide"
        onRequestClose={() => setPicking(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{fr.company.chooseCoop}</Text>
            <FlatList
              data={cooperatives}
              keyExtractor={(item) => String(item.id)}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.coopRow} onPress={() => allocate(item.id)}>
                  <Text style={styles.coopName}>{item.cooperative_name}</Text>
                  <Text style={styles.coopMeta}>
                    {item.profile_type}
                    {item.is_certified ? " · 🌿 certifiée" : ""}
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity onPress={() => setPicking(null)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>{fr.company.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  dim: { color: colors.textDim, fontSize: type.body },
  error: { color: colors.error, fontSize: type.body },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  list: { padding: spacing.md, gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  species: { color: colors.text, fontSize: type.body, fontWeight: "700", fontStyle: "italic" },
  meta: { color: colors.textDim, fontSize: type.caption },
  assigned: { color: colors.success, fontSize: type.caption, fontWeight: "700" },
  action: {
    marginTop: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  actionText: { color: colors.primary, fontSize: type.caption, fontWeight: "800" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(14,21,18,0.8)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: "70%",
  },
  modalTitle: { color: colors.text, fontSize: type.heading, fontWeight: "700" },
  modalList: { flexGrow: 0 },
  coopRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  coopName: { color: colors.text, fontSize: type.body, fontWeight: "600" },
  coopMeta: { color: colors.textDim, fontSize: type.caption },
  cancelBtn: { alignItems: "center", paddingVertical: spacing.md },
  cancelText: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
});
