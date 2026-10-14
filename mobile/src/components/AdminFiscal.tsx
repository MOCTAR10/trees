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

import {
  AgreementStatus,
  CommunityAgreement,
  communitySummary,
  CommunitySummary,
  createTaxDue,
  decideCommunityAgreement,
  decideEudrDiligence,
  EudrDiligence,
  ForestTitle,
  listCommunityAgreements,
  listEudrDiligence,
  listTaxDues,
  listTitles,
  TaxDue,
  TaxType,
} from "../api/client";
import { exportDiligencePdf, sharePdf } from "../pdf";
import { fr } from "../i18n/fr";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import Badge, { taxTone, Tone } from "./Badge";
import EudrStems from "./EudrStems";

const TAX_TYPES: TaxType[] = [
  "superficie",
  "abattage",
  "surveillance",
  "transformation",
  "renouvellement",
  "transfert",
  "fermage",
];
const AGREEMENT_STATUSES: AgreementStatus[] = ["actif", "suspendu", "clos"];

function agreementTone(status: string): Tone {
  if (status === "actif") return "success";
  if (status === "suspendu") return "warning";
  return "neutral";
}

function eudrTone(status: string): Tone {
  if (status === "valide") return "success";
  if (status === "rejete") return "danger";
  return "warning";
}

const fcfa = (value: number | null | undefined): string =>
  value == null ? "—" : `${Math.round(value).toLocaleString("fr-FR")} FCFA`;

/** Ministry view: tax dues, CCC/FDL agreements and EUDR diligence to decide. */
export default function AdminFiscal() {
  const th = useTheme();
  const styles = useStyles();
  const [mode, setMode] = useState<"dues" | "ccc" | "eudr">("dues");
  const [message, setMessage] = useState<string | null>(null);
  const [titles, setTitles] = useState<ForestTitle[]>([]);
  const [exporting, setExporting] = useState(false);

  const [dues, setDues] = useState<TaxDue[]>([]);
  const [dueLoading, setDueLoading] = useState(true);
  const [dueError, setDueError] = useState<string | null>(null);
  const [creatingDue, setCreatingDue] = useState(false);

  const [agreements, setAgreements] = useState<CommunityAgreement[]>([]);
  const [summary, setSummary] = useState<CommunitySummary | null>(null);
  const [cccLoading, setCccLoading] = useState(true);
  const [cccError, setCccError] = useState<string | null>(null);
  const [decidingAgreement, setDecidingAgreement] = useState<CommunityAgreement | null>(null);

  const [diligence, setDiligence] = useState<EudrDiligence[]>([]);
  const [eudrLoading, setEudrLoading] = useState(true);
  const [eudrError, setEudrError] = useState<string | null>(null);
  const [decidingEudr, setDecidingEudr] = useState<EudrDiligence | null>(null);

  const loadDues = useCallback(async () => {
    setDueLoading(true);
    setDueError(null);
    try {
      setDues(await listTaxDues());
    } catch (err) {
      console.error("dues load failed", err);
      setDueError(fr.fiscal.error);
    } finally {
      setDueLoading(false);
    }
  }, []);

  const loadCcc = useCallback(async () => {
    setCccLoading(true);
    setCccError(null);
    try {
      const [list, stats] = await Promise.all([listCommunityAgreements(), communitySummary()]);
      setAgreements(list);
      setSummary(stats);
    } catch (err) {
      console.error("agreements load failed", err);
      setCccError(fr.fiscal.error);
    } finally {
      setCccLoading(false);
    }
  }, []);

  const loadEudr = useCallback(async () => {
    setEudrLoading(true);
    setEudrError(null);
    try {
      setDiligence(await listEudrDiligence());
    } catch (err) {
      console.error("diligence load failed", err);
      setEudrError(fr.fiscal.error);
    } finally {
      setEudrLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDues();
    void loadCcc();
    void loadEudr();
    listTitles()
      .then(setTitles)
      .catch((err) => console.error("titles load failed", err));
  }, [loadDues, loadCcc, loadEudr]);

  const exportDiligence = async (id: number) => {
    if (exporting) return;
    setExporting(true);
    setMessage(null);
    try {
      await sharePdf(await exportDiligencePdf(id));
    } catch (err) {
      console.error("diligence export failed", err);
      setMessage(fr.fiscal.error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.segment}>
        {(
          [
            ["dues", fr.fiscal.dues],
            ["ccc", fr.fiscal.ccc],
            ["eudr", fr.fiscal.eudr],
          ] as const
        ).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.segBtn, mode === key && styles.segOn]}
            onPress={() => setMode(key)}
            testID={`seg-${key}`}
          >
            <Text style={[styles.segText, mode === key && styles.segTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {message ? <Text style={styles.success}>{message}</Text> : null}

      {mode === "dues" ? (
        dueLoading ? (
          <ActivityIndicator style={styles.center} color={th.c.olive} />
        ) : dueError ? (
          <View style={styles.center}>
            <Text style={styles.error}>{dueError}</Text>
            <TouchableOpacity onPress={loadDues}>
              <Text style={styles.link}>{fr.common.retry}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            <TouchableOpacity
              style={styles.action}
              onPress={() => {
                setMessage(null);
                setCreatingDue(true);
              }}
              testID="new-due"
            >
              <Text style={styles.actionText}>+ {fr.fiscal.newDue}</Text>
            </TouchableOpacity>

            {dues.length === 0 ? (
              <Text style={styles.dim}>{fr.fiscal.noDues}</Text>
            ) : (
              dues.map((due) => (
                <View key={due.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.title}>{`${fr.taxes.type[due.tax_type] ?? due.tax_type} · ${due.period_year}`}</Text>
                    <Badge label={fr.taxes.status[due.status] ?? due.status} tone={taxTone(due.status)} />
                  </View>
                  <Text style={styles.meta}>{due.org_name ?? `#${due.org_id}`}</Text>
                  <Text style={styles.meta}>
                    {fcfa(due.amount_fcfa)}
                    {due.title_ref ? ` · ${due.title_ref}` : ""}
                  </Text>
                  {due.due_at ? (
                    <Text style={styles.meta}>{`${fr.fiscal.due} ${due.due_at.slice(0, 10)}`}</Text>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>
        )
      ) : mode === "ccc" ? (
        cccLoading ? (
          <ActivityIndicator style={styles.center} color={th.c.olive} />
        ) : cccError ? (
          <View style={styles.center}>
            <Text style={styles.error}>{cccError}</Text>
            <TouchableOpacity onPress={loadCcc}>
              <Text style={styles.link}>{fr.common.retry}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {summary ? (
              <View style={styles.cellRow}>
                <View style={styles.cell}>
                  <Text style={styles.cellValue}>{String(summary.total_count)}</Text>
                  <Text style={styles.cellLabel}>{fr.fiscal.ccc}</Text>
                </View>
                <View style={styles.cell}>
                  <Text style={styles.cellValue}>{fcfa(summary.total_contribution_fcfa)}</Text>
                  <Text style={styles.cellLabel}>{fr.fiscal.totalContribution}</Text>
                </View>
              </View>
            ) : null}

            {agreements.length === 0 ? (
              <Text style={styles.dim}>{fr.fiscal.noAgreements}</Text>
            ) : (
              agreements.map((a) => (
                <View key={a.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.title}>{a.community_name ?? `#${a.community_org_id}`}</Text>
                    <Badge
                      label={fr.fiscal.agreementStatus[a.status] ?? a.status}
                      tone={agreementTone(a.status)}
                    />
                  </View>
                  <Text style={styles.meta}>
                    {`${a.title_ref ?? fr.fiscal.title}${a.ccc_ref ? ` · ${a.ccc_ref}` : ""}`}
                  </Text>
                  <Text style={styles.meta}>{`${fr.fiscal.contribution} : ${fcfa(a.contribution_fcfa)}`}</Text>
                  <TouchableOpacity
                    style={styles.smallBtn}
                    onPress={() => {
                      setMessage(null);
                      setDecidingAgreement(a);
                    }}
                    testID={`decide-agreement-${a.id}`}
                  >
                    <Text style={styles.smallBtnText}>{fr.fiscal.decide}</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        )
      ) : eudrLoading ? (
        <ActivityIndicator style={styles.center} color={th.c.olive} />
      ) : eudrError ? (
        <View style={styles.center}>
          <Text style={styles.error}>{eudrError}</Text>
          <TouchableOpacity onPress={loadEudr}>
            <Text style={styles.link}>{fr.common.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {diligence.length === 0 ? (
            <Text style={styles.dim}>{fr.fiscal.noDiligence}</Text>
          ) : (
            diligence.map((d) => (
              <View key={d.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.title}>{d.parcel_label}</Text>
                  <Badge label={fr.fiscal.eudrStatus[d.status] ?? d.status} tone={eudrTone(d.status)} />
                </View>
                <Text style={styles.meta}>
                  {`${d.org_name ?? `#${d.org_id}`}${d.title_ref ? ` · ${d.title_ref}` : ""}`}
                </Text>
                <Text style={styles.meta}>
                  {`${fr.fiscal.felled} : ${d.felled_stem_count} · ${fr.fiscal.geolocated} : ${d.geolocated_stem_count}`}
                </Text>
                <Text style={styles.meta}>
                  {`${fr.fiscal.insideParcel} : ${d.inside_parcel_stem_count} · ${fr.fiscal.outsideParcel} : ${d.outside_parcel_stem_count}`}
                </Text>
                {d.decision_motif ? <Text style={styles.warn}>{d.decision_motif}</Text> : null}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.smallBtn, styles.smallBtnFlex]}
                    onPress={() => {
                      setMessage(null);
                      setDecidingEudr(d);
                    }}
                    testID={`decide-diligence-${d.id}`}
                  >
                    <Text style={styles.smallBtnText}>{fr.fiscal.decide}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallBtn, styles.smallBtnFlex]}
                    onPress={() => void exportDiligence(d.id)}
                    disabled={exporting}
                    testID={`diligence-pdf-${d.id}`}
                  >
                    <Text style={styles.smallBtnText}>{fr.traceability.pdf}</Text>
                  </TouchableOpacity>
                </View>
                <EudrStems diligenceId={d.id} />
              </View>
            ))
          )}
        </ScrollView>
      )}

      <DueModal
        visible={creatingDue}
        titles={titles}
        onClose={() => setCreatingDue(false)}
        onSaved={() => {
          setCreatingDue(false);
          setMessage(fr.fiscal.saved);
          void loadDues();
        }}
      />
      <AgreementDecisionModal
        agreement={decidingAgreement}
        onClose={() => setDecidingAgreement(null)}
        onSaved={() => {
          setDecidingAgreement(null);
          setMessage(fr.fiscal.saved);
          void loadCcc();
        }}
      />
      <EudrDecisionModal
        diligence={decidingEudr}
        onClose={() => setDecidingEudr(null)}
        onSaved={() => {
          setDecidingEudr(null);
          setMessage(fr.fiscal.saved);
          void loadEudr();
        }}
      />
    </View>
  );
}

function DueModal({
  visible,
  titles,
  onClose,
  onSaved,
}: {
  visible: boolean;
  titles: ForestTitle[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const th = useTheme();
  const styles = useStyles();
  const [titleId, setTitleId] = useState<number | null>(null);
  const [taxType, setTaxType] = useState<TaxType>("superficie");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [amount, setAmount] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitleId(titles[0]?.id ?? null);
    setTaxType("superficie");
    setYear(String(new Date().getFullYear()));
    setAmount("");
    setDueAt("");
    setNotes("");
    setError(null);
  }, [visible, titles]);

  const submit = async () => {
    if (busy) return;
    if (titleId == null) {
      setError(fr.fiscal.required);
      return;
    }
    const value = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setError(fr.fiscal.amountRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createTaxDue({
        title_id: titleId,
        tax_type: taxType,
        period_year: parseInt(year, 10) || new Date().getFullYear(),
        amount_fcfa: value,
        due_at: dueAt.trim() || null,
        notes: notes.trim() || null,
      });
      onSaved();
    } catch (err) {
      console.error("due create failed", err);
      setError(fr.fiscal.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.fiscal.newDue}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <Text style={styles.fieldLabel}>{fr.fiscal.title}</Text>
            <View style={styles.chips}>
              {titles.length === 0 ? (
                <Text style={styles.dim}>{fr.fiscal.none}</Text>
              ) : (
                titles.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.chip, titleId === t.id && styles.chipOn]}
                    onPress={() => setTitleId(t.id)}
                    testID={`title-${t.id}`}
                  >
                    <Text style={[styles.chipText, titleId === t.id && styles.chipTextOn]}>
                      {t.reference ?? `${fr.fiscal.title} #${t.id}`}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>

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
              placeholderTextColor={th.c.muted}
              value={year}
              onChangeText={setYear}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.taxes.amount}
              placeholderTextColor={th.c.muted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.fiscal.dueAt}
              placeholderTextColor={th.c.muted}
              value={dueAt}
              onChangeText={setDueAt}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.traceability.notes}
              placeholderTextColor={th.c.muted}
              value={notes}
              onChangeText={setNotes}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
                <Text style={styles.cancelText}>{fr.admin.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, busy && styles.disabled]}
                onPress={submit}
                disabled={busy}
                testID="due-submit"
              >
                {busy ? (
                  <ActivityIndicator color={th.c.onOlive} />
                ) : (
                  <Text style={styles.submitText}>{fr.fiscal.newDue}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AgreementDecisionModal({
  agreement,
  onClose,
  onSaved,
}: {
  agreement: CommunityAgreement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const th = useTheme();
  const styles = useStyles();
  const [status, setStatus] = useState<AgreementStatus>("actif");
  const [cgsp, setCgsp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agreement) return;
    setStatus(agreement.status);
    setCgsp(agreement.cgsp_minutes_document_id ? String(agreement.cgsp_minutes_document_id) : "");
    setError(null);
  }, [agreement]);

  const submit = async () => {
    if (!agreement || busy) return;
    const cgspValue = cgsp.trim() ? parseInt(cgsp, 10) : null;
    setBusy(true);
    setError(null);
    try {
      await decideCommunityAgreement(agreement.id, {
        status,
        cgsp_minutes_document_id:
          cgspValue != null && Number.isFinite(cgspValue) ? cgspValue : null,
      });
      onSaved();
    } catch (err) {
      console.error("agreement decision failed", err);
      setError(fr.fiscal.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!agreement} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.fiscal.decisionTitle}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <Text style={styles.fieldLabel}>{fr.fiscal.decide}</Text>
            <View style={styles.chips}>
              {AGREEMENT_STATUSES.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, status === s && styles.chipOn]}
                  onPress={() => setStatus(s)}
                  testID={`agreement-status-${s}`}
                >
                  <Text style={[styles.chipText, status === s && styles.chipTextOn]}>
                    {fr.fiscal.agreementStatus[s]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder={fr.fiscal.cgsp}
              placeholderTextColor={th.c.muted}
              value={cgsp}
              onChangeText={setCgsp}
              keyboardType="numeric"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
                <Text style={styles.cancelText}>{fr.admin.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, busy && styles.disabled]}
                onPress={submit}
                disabled={busy}
                testID="agreement-decision-submit"
              >
                {busy ? (
                  <ActivityIndicator color={th.c.onOlive} />
                ) : (
                  <Text style={styles.submitText}>{fr.fiscal.decide}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function EudrDecisionModal({
  diligence,
  onClose,
  onSaved,
}: {
  diligence: EudrDiligence | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const th = useTheme();
  const styles = useStyles();
  const [status, setStatus] = useState<"valide" | "rejete">("valide");
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!diligence) return;
    setStatus("valide");
    setMotif("");
    setError(null);
  }, [diligence]);

  const submit = async () => {
    if (!diligence || busy) return;
    if (status === "rejete" && !motif.trim()) {
      setError(fr.fiscal.required);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await decideEudrDiligence(diligence.id, {
        status,
        motif: motif.trim() || null,
      });
      onSaved();
    } catch (err) {
      console.error("diligence decision failed", err);
      setError(fr.fiscal.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!diligence} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.fiscal.decisionTitle}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <Text style={styles.fieldLabel}>{fr.fiscal.eudr}</Text>
            <View style={styles.chips}>
              {(["valide", "rejete"] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, status === s && styles.chipOn]}
                  onPress={() => setStatus(s)}
                  testID={`eudr-status-${s}`}
                >
                  <Text style={[styles.chipText, status === s && styles.chipTextOn]}>
                    {fr.fiscal.eudrStatus[s]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder={fr.fiscal.motif}
              placeholderTextColor={th.c.muted}
              value={motif}
              onChangeText={setMotif}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
                <Text style={styles.cancelText}>{fr.admin.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, busy && styles.disabled]}
                onPress={submit}
                disabled={busy}
                testID="eudr-decision-submit"
              >
                {busy ? (
                  <ActivityIndicator color={th.c.onOlive} />
                ) : (
                  <Text style={styles.submitText}>{fr.fiscal.decide}</Text>
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
  container: { flex: 1 },
  segment: {
    flexDirection: "row",
    gap: th.space.xs,
    padding: th.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: th.c.line,
  },
  segBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: th.space.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: th.c.line,
  },
  segOn: { backgroundColor: th.c.olive, borderColor: th.c.olive },
  segText: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.bodyBold },
  segTextOn: { color: th.c.onOlive },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: th.space.lg },
  error: { color: th.c.risk, fontSize: 15, fontFamily: th.fonts.body, textAlign: "center" },
  link: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  list: { padding: th.space.lg, gap: th.space.sm, paddingBottom: th.space.xxl },
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
  title: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold, flex: 1 },
  meta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  warn: { color: th.c.warn, fontSize: 12, fontFamily: th.fonts.bodyBold },
  dim: { color: th.c.muted, fontSize: 15, fontFamily: th.fonts.body, marginTop: th.space.sm },
  success: {
    color: th.c.ok,
    fontSize: 15,
    fontFamily: th.fonts.bodyBold,
    paddingHorizontal: th.space.lg,
    paddingTop: th.space.sm,
  },
  action: {
    backgroundColor: th.c.olive,
    borderRadius: 10,
    paddingVertical: th.space.sm,
    alignItems: "center",
  },
  actionText: { color: th.c.onOlive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  actionsRow: { flexDirection: "row", gap: th.space.sm, marginTop: th.space.xs },
  smallBtn: {
    backgroundColor: th.c.surface2,
    borderWidth: 1,
    borderColor: th.c.line,
    borderRadius: 8,
    paddingVertical: th.space.sm,
    paddingHorizontal: th.space.lg,
    alignItems: "center",
    marginTop: th.space.xs,
  },
  smallBtnFlex: { flex: 1, marginTop: 0 },
  smallBtnText: { color: th.c.olive, fontSize: 12, fontFamily: th.fonts.bodyBold },
  cellRow: { flexDirection: "row", gap: th.space.sm },
  cell: {
    flex: 1,
    backgroundColor: th.c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.lg,
    gap: th.space.xs,
  },
  cellValue: { color: th.c.ink, fontSize: 19, fontFamily: th.fonts.bodyBold },
  cellLabel: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
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
    fontSize: 19,
    fontFamily: th.fonts.bodyBold,
    marginBottom: th.space.sm,
  },
  form: { paddingBottom: th.space.sm },
  fieldLabel: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body, marginBottom: th.space.xs },
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
    fontFamily: th.fonts.body,
    marginBottom: th.space.sm,
  },
  modalActions: { flexDirection: "row", gap: th.space.sm, marginTop: th.space.sm },
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
  disabled: { opacity: 0.6 },
}));
