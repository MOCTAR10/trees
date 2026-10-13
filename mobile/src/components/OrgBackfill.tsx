import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { backfillAccounts, listOrphanAccounts, OrphanAccount } from "../api/client";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

/**
 * Ministry view (Slice 13): accounts created before the organization registry
 * still act as their own legal entity (``organization_id`` NULL). This panel
 * lists them and attaches each to a freshly created ``organizations`` row. The
 * backfill is idempotent and traces the source account (``legacy_user_id``).
 */
export default function OrgBackfill({ onBackfilled }: { onBackfilled?: () => void }) {
  const [orphans, setOrphans] = useState<OrphanAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrphans(await listOrphanAccounts());
    } catch (err) {
      console.error("orphan accounts load failed", err);
      setError(fr.org.legacyError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await backfillAccounts();
      setMessage(fr.org.legacyDone(result.created_count, result.linked_count));
      await load();
      onBackfilled?.();
    } catch (err) {
      console.error("organization backfill failed", err);
      setError(fr.org.legacyError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{fr.org.legacyTitle}</Text>
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : error ? (
        <Text style={styles.error} testID="backfill-error">
          {error}
        </Text>
      ) : orphans.length === 0 ? (
        <Text style={styles.dim} testID="backfill-none">
          {fr.org.legacyNone}
        </Text>
      ) : (
        <View>
          {orphans.map((account) => (
            <Text key={account.id} style={styles.meta} testID={`orphan-${account.id}`}>
              {`${account.display_name} · ${fr.org.legacyRole[account.role] ?? account.role}`}
            </Text>
          ))}
          <TouchableOpacity
            style={styles.action}
            disabled={busy}
            onPress={() => void run()}
            testID="backfill-accounts"
          >
            <Text style={styles.actionText}>
              {busy ? fr.org.legacyRunning : fr.org.legacyAction}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {message ? (
        <Text style={styles.message} testID="backfill-message">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  meta: { color: colors.textDim, fontSize: type.caption, marginBottom: spacing.xs },
  dim: { color: colors.textDim, fontSize: type.body },
  error: { color: colors.error, fontSize: type.caption, fontWeight: "700" },
  message: { color: colors.success, fontSize: type.caption, fontWeight: "700", marginTop: spacing.sm },
  action: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 8,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionText: { color: colors.accent, fontSize: type.caption, fontWeight: "800" },
});
