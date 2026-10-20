import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
    Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { listTaxes, recordTax, TaxReceipt, TaxType } from "../api/client";
import { fr } from "../i18n/fr";
import Badge, { taxTone } from "./Badge";
import { frDate } from "../design/format";
import { CardGrid, useDialog } from "../design/layout";
import { makeStyles, useTheme } from "../design/ThemeProvider";

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
  const styles = useStyles();
  const theme = useTheme();
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
    return <ActivityIndicator style={styles.center} color={theme.c.olive} />;
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
        <CardGrid>
          {taxes.map((tax) => (
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
          ))}
        </CardGrid>
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
  const dialog = useDialog();
  const styles = useStyles();
  const theme = useTheme();
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
    <Modal visible={visible} transparent animationType={dialog.animation} onRequestClose={onClose}>
      <View style={[styles.backdrop, dialog.backdrop]}>
        <View style={[styles.modal, dialog.sheet]}>
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
              placeholderTextColor={theme.c.muted}
              value={period}
              onChangeText={setPeriod}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.taxes.amount}
              placeholderTextColor={theme.c.muted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.taxes.receiptRef}
              placeholderTextColor={theme.c.muted}
              value={receiptRef}
              onChangeText={setReceiptRef}
              autoCapitalize="characters"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.taxes.paidAt}
              placeholderTextColor={theme.c.muted}
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
                  <ActivityIndicator color={theme.c.forest} />
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

const useStyles = makeStyles((th) => ({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: th.space.lg,
    padding: th.space.xl,
  },
  error: { color: th.c.risk, fontSize: 15, textAlign: "center", fontFamily: th.fonts.body },
  link: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  list: { padding: th.space.lg, gap: th.space.sm, paddingBottom: th.space.xxl },
  newBtn: {
    backgroundColor: th.c.olive,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: th.space.xl,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  newBtnText: { color: th.c.onOlive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  card: {
    backgroundColor: th.c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.lg,
    gap: th.space.xs,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: th.space.sm,
  },
  title: { color: th.c.ink, fontSize: 15, flex: 1, fontFamily: th.fonts.bodyBold },
  meta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  dim: { color: th.c.muted, fontSize: 15, marginTop: th.space.sm, fontFamily: th.fonts.body },
  success: { color: th.c.ok, fontSize: 15, fontFamily: th.fonts.bodyBold },
  backdrop: { flex: 1, backgroundColor: "rgba(14,21,18,0.8)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: th.c.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: th.space.xl,
    maxHeight: "85%",
  },
  modalTitle: {
    color: th.c.ink,
    fontSize: 20,
    marginBottom: th.space.sm,
    fontFamily: th.fonts.display,

  },
  form: { paddingBottom: th.space.sm },
  fieldLabel: { color: th.c.muted, fontSize: 12, marginBottom: th.space.xs, fontFamily: th.fonts.body },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: th.space.xs, marginBottom: th.space.sm },
  chip: {
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.bg,
  },
  chipOn: { backgroundColor: th.c.olive, borderColor: th.c.olive },
  chipText: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.bodyBold },
  chipTextOn: { color: th.c.onOlive },
  input: {
    backgroundColor: th.c.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: th.c.line,
    color: th.c.ink,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm,
    fontSize: 15,
    marginBottom: th.space.sm,
    fontFamily: th.fonts.body,

  },
  actions: { flexDirection: "row", gap: th.space.sm, marginTop: th.space.sm },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: th.space.lg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: th.c.line,
  },
  cancelText: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold },
  submitBtn: {
    flex: 2,
    alignItems: "center",
    paddingVertical: th.space.lg,
    borderRadius: 10,
    backgroundColor: th.c.olive,
  },
  submitText: { color: th.c.onOlive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  submitDisabled: { opacity: 0.6 },
}));
