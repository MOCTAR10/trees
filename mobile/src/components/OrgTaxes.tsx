import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { listTaxes, recordTax, TaxReceipt, TaxType } from "../api/client";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";
import Badge, { taxTone } from "./Badge";
import { frDate } from "../design/format";

const TAX_TYPES: TaxType[] = [
  "superficie",
  "abattage",
  "surveillance",
  "transformation",
  "renouvellement",
  "transfert",
  "fermage",
];

/** Company view: forest tax / royalty receipts so compliance warnings clear. */
export default function OrgTaxes() {
  const [taxes, setTaxes] = useState<TaxReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTaxes(await listTaxes());
    } catch (err) {
      console.error("taxes load failed", err);
      setError(fr.taxes.error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <ActivityIndicator style={styles.center} color={colors.accent} />;
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity onPress={load}>
          <Text style={styles.link}>{fr.common.retry}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <TouchableOpacity
        style={styles.newBtn}
        onPress={() => {
          setMessage(null);
          setAdding(true);
        }}
        testID="new-tax"
      >
        <Text style={styles.newBtnText}>+ {fr.taxes.add}</Text>
      </TouchableOpacity>

      {message ? <Text style={styles.success}>{message}</Text> : null}

      {taxes.length === 0 ? (
        <Text style={styles.dim}>{fr.taxes.noTaxes}</Text>
      ) : (
        taxes.map((tax) => (
          <View key={tax.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.title}>
                {fr.taxes.type[tax.tax_type] ?? tax.tax_type}
                {tax.period_year ? ` · ${tax.period_year}` : ""}
              </Text>
              <Badge label={fr.taxes.status[tax.status] ?? tax.status} tone={taxTone(tax.status)} />
            </View>
            <Text style={styles.meta}>
              {tax.amount_fcfa != null ? `${Math.round(tax.amount_fcfa).toLocaleString("fr-FR")} FCFA` : "—"}
              {tax.receipt_ref ? ` · ${tax.receipt_ref}` : ""}
            </Text>
            {tax.paid_at ? <Text style={styles.meta}>{frDate(tax.paid_at)}</Text> : null}
          </View>
        ))
      )}

      <TaxModal
        visible={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          setMessage(fr.taxes.saved);
          void load();
        }}
      />
    </ScrollView>
  );
}

function TaxModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [taxType, setTaxType] = useState<TaxType>("superficie");
  const [period, setPeriod] = useState(String(new Date().getFullYear()));
  const [amount, setAmount] = useState("");
  const [receiptRef, setReceiptRef] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTaxType("superficie");
    setPeriod(String(new Date().getFullYear()));
    setAmount("");
    setReceiptRef("");
    setPaidAt("");
    setError(null);
  }, [visible]);

  const submit = async () => {
    if (busy) return;
    const value = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setError(fr.taxes.amountRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await recordTax({
        tax_type: taxType,
        period_year: parseInt(period, 10) || new Date().getFullYear(),
        amount_fcfa: value,
        receipt_ref: receiptRef.trim() || null,
        paid_at: paidAt.trim() || null,
      });
      onSaved();
    } catch (err) {
      console.error("tax record failed", err);
      setError(fr.taxes.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.taxes.add}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <Text style={styles.fieldLabel}>{fr.taxes.type.superficie}</Text>
            <View style={styles.chips}>
              {TAX_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, taxType === t && styles.chipOn]}
                  onPress={() => setTaxType(t)}
                >
                  <Text style={[styles.chipText, taxType === t && styles.chipTextOn]}>
                    {fr.taxes.type[t]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder={fr.taxes.period}
              placeholderTextColor={colors.textDim}
              value={period}
              onChangeText={setPeriod}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.taxes.amount}
              placeholderTextColor={colors.textDim}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.taxes.receiptRef}
              placeholderTextColor={colors.textDim}
              value={receiptRef}
              onChangeText={setReceiptRef}
              autoCapitalize="characters"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.taxes.paidAt}
              placeholderTextColor={colors.textDim}
              value={paidAt}
              onChangeText={setPaidAt}
              autoCapitalize="none"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
                <Text style={styles.cancelText}>{fr.admin.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, busy && styles.submitDisabled]}
                onPress={submit}
                disabled={busy}
                testID="tax-submit"
              >
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.submitText}>{fr.taxes.add}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  error: { color: colors.error, fontSize: type.body, textAlign: "center" },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  newBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  newBtnText: { color: colors.primary, fontSize: type.body, fontWeight: "800" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: { color: colors.text, fontSize: type.body, fontWeight: "700", flex: 1 },
  meta: { color: colors.textDim, fontSize: type.caption },
  dim: { color: colors.textDim, fontSize: type.body, marginTop: spacing.sm },
  success: { color: colors.success, fontSize: type.body, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(14,21,18,0.8)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    maxHeight: "85%",
  },
  modalTitle: {
    color: colors.text,
    fontSize: type.heading,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  form: { paddingBottom: spacing.sm },
  fieldLabel: { color: colors.textDim, fontSize: type.caption, marginBottom: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textDim, fontSize: type.caption, fontWeight: "700" },
  chipTextOn: { color: colors.primary },
  input: {
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: type.body,
    marginBottom: spacing.sm,
  },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: { color: colors.text, fontSize: type.body, fontWeight: "700" },
  submitBtn: {
    flex: 2,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  submitText: { color: colors.primary, fontSize: type.body, fontWeight: "800" },
  submitDisabled: { opacity: 0.6 },
});
