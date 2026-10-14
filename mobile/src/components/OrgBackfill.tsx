import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { backfillAccounts, listOrphanAccounts, OrphanAccount } from "../api/client";
import { fr } from "../i18n/fr";
import { makeStyles, useTheme } from "../design/ThemeProvider";

/**
 * Ministry view (Slice 13): accounts created before the organization registry
 * still act as their own legal entity (``organization_id`` NULL). This panel
 * lists them and attaches each to a freshly created ``organizations`` row. The
 * backfill is idempotent and traces the source account (``legacy_user_id``).
 */
export default function OrgBackfill({ onBackfilled }: { onBackfilled?: () => void }) {
  const th = useTheme();
  const styles = useStyles();
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
        <ActivityIndicator color={th.c.olive} />
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

const useStyles = makeStyles((th) => ({
  section: {
    borderColor: th.c.line,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: th.space.lg,
    padding: th.space.lg,
  },
  title: {
    color: th.c.ink,
    fontSize: 15,
    fontFamily: th.fonts.bodyBold,
    marginBottom: th.space.sm,
  },
  meta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body, marginBottom: th.space.xs },
  dim: { color: th.c.muted, fontSize: 15, fontFamily: th.fonts.body },
  error: { color: th.c.risk, fontSize: 12, fontFamily: th.fonts.bodyBold },
  message: { color: th.c.ok, fontSize: 12, fontFamily: th.fonts.bodyBold, marginTop: th.space.sm },
  action: {
    alignSelf: "flex-start",
    backgroundColor: th.c.forest,
    borderRadius: 8,
    marginTop: th.space.sm,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm,
  },
  actionText: { color: th.c.olive, fontSize: 12, fontFamily: th.fonts.bodyBold },
}));
