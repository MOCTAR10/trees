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

import {
  Community,
  CommunityAgreement,
  createCommunityAgreement,
  createEudrDiligence,
  EudrDiligence,
  ForestTitle,
  listCommunities,
  listCommunityAgreements,
  listEudrDiligence,
  listTaxDues,
  myTitles,
  settleTaxDue,
  TaxDue,
} from "../api/client";
import { exportDiligencePdf, sharePdf } from "../pdf";
import { fr } from "../i18n/fr";
import Badge, { taxTone, Tone } from "./Badge";
import EudrStems from "./EudrStems";
import { frDate } from "../design/format";
import { makeStyles, useTheme } from "../design/ThemeProvider";

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

/** Company view: tax dues (échéances), CCC/FDL agreements and EUDR diligence. */
export default function CompanyFiscal() {
  const styles = useStyles();
  const theme = useTheme();
  const [mode, setMode] = useState<"dues" | "ccc" | "eudr">("dues");
  const [message, setMessage] = useState<string | null>(null);
  const [titles, setTitles] = useState<ForestTitle[]>([]);

  const [dues, setDues] = useState<TaxDue[]>([]);
  const [dueLoading, setDueLoading] = useState(true);
  const [dueError, setDueError] = useState<string | null>(null);
  const [settling, setSettling] = useState<TaxDue | null>(null);

  const [agreements, setAgreements] = useState<CommunityAgreement[]>([]);
  const [cccLoading, setCccLoading] = useState(true);
  const [cccError, setCccError] = useState<string | null>(null);
  const [creatingCcc, setCreatingCcc] = useState(false);

  const [diligence, setDiligence] = useState<EudrDiligence[]>([]);
  const [eudrLoading, setEudrLoading] = useState(true);
  const [eudrError, setEudrError] = useState<string | null>(null);
  const [creatingEudr, setCreatingEudr] = useState(false);
  const [exporting, setExporting] = useState(false);

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
      setAgreements(await listCommunityAgreements());
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
    myTitles()
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
          <ActivityIndicator style={styles.center} color={theme.c.olive} />
        ) : dueError ? (
          <View style={styles.center}>
            <Text style={styles.error}>{dueError}</Text>
            <TouchableOpacity onPress={loadDues}>
              <Text style={styles.link}>{fr.common.retry}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {dues.length === 0 ? (
              <Text style={styles.dim}>{fr.fiscal.noDues}</Text>
            ) : (
              dues.map((due) => (
                <View key={due.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.title}>{`${fr.taxes.type[due.tax_type] ?? due.tax_type} · ${due.period_year}`}</Text>
                    <Badge label={fr.taxes.status[due.status] ?? due.status} tone={taxTone(due.status)} />
                  </View>
                  <Text style={styles.meta}>{fcfa(due.amount_fcfa)}</Text>
                  {due.title_ref ? <Text style={styles.meta}>{due.title_ref}</Text> : null}
                  {due.due_at ? (
                    <Text style={styles.meta}>{`${fr.fiscal.due} ${frDate(due.due_at)}`}</Text>
                  ) : null}
                  {due.status === "en_retard" ? (
                    <Text style={styles.warn}>{`${fr.fiscal.surcharge} : ${fcfa(due.surcharge_fcfa)}`}</Text>
                  ) : null}
                  {due.receipt_ref ? <Text style={styles.meta}>{due.receipt_ref}</Text> : null}
                  {due.status !== "paye" ? (
                    <TouchableOpacity
                      style={styles.smallBtn}
                      onPress={() => {
                        setMessage(null);
                        setSettling(due);
                      }}
                      testID={`settle-${due.id}`}
                    >
                      <Text style={styles.smallBtnText}>{fr.fiscal.settle}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>
        )
      ) : mode === "ccc" ? (
        cccLoading ? (
          <ActivityIndicator style={styles.center} color={theme.c.olive} />
        ) : cccError ? (
          <View style={styles.center}>
            <Text style={styles.error}>{cccError}</Text>
            <TouchableOpacity onPress={loadCcc}>
              <Text style={styles.link}>{fr.common.retry}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            <TouchableOpacity
              style={styles.action}
              onPress={() => {
                setMessage(null);
                setCreatingCcc(true);
              }}
              testID="new-agreement"
            >
              <Text style={styles.actionText}>+ {fr.fiscal.newAgreement}</Text>
            </TouchableOpacity>
            <Text style={styles.note}>
              {`${fr.fiscal.contribution} = taux FDL × volume annuel (art. 251)`}
            </Text>

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
                  <Text style={styles.meta}>
                    {`${fr.fiscal.fdlRate} : ${a.fdl_rate_fcfa_m3} · ${a.annual_volume_m3 ?? 0} m³`}
                  </Text>
                  <Text style={styles.meta}>
                    {`${fr.fiscal.contribution} : ${fcfa(a.contribution_fcfa)}`}
                  </Text>
                  {a.cgsp_minutes_document_id ? (
                    <Text style={styles.meta}>{`${fr.fiscal.cgsp} : ${a.cgsp_minutes_document_id}`}</Text>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>
        )
      ) : eudrLoading ? (
        <ActivityIndicator style={styles.center} color={theme.c.olive} />
      ) : eudrError ? (
        <View style={styles.center}>
          <Text style={styles.error}>{eudrError}</Text>
          <TouchableOpacity onPress={loadEudr}>
            <Text style={styles.link}>{fr.common.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <TouchableOpacity
            style={styles.action}
            onPress={() => {
              setMessage(null);
              setCreatingEudr(true);
            }}
            testID="new-diligence"
          >
            <Text style={styles.actionText}>+ {fr.fiscal.newDiligence}</Text>
          </TouchableOpacity>

          {diligence.length === 0 ? (
            <Text style={styles.dim}>{fr.fiscal.noDiligence}</Text>
          ) : (
            diligence.map((d) => (
              <View key={d.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.title}>{d.parcel_label}</Text>
                  <Badge
                    label={fr.fiscal.eudrStatus[d.status] ?? d.status}
                    tone={eudrTone(d.status)}
                  />
                </View>
                {d.title_ref ? <Text style={styles.meta}>{d.title_ref}</Text> : null}
                <Text style={styles.meta}>
                  {`${fr.fiscal.felled} : ${d.felled_stem_count} · ${fr.fiscal.geolocated} : ${d.geolocated_stem_count}`}
                </Text>
                <Text style={styles.meta}>
                  {`${fr.fiscal.insideParcel} : ${d.inside_parcel_stem_count} · ${fr.fiscal.outsideParcel} : ${d.outside_parcel_stem_count}`}
                </Text>
                {d.declared_volume_m3 != null ? (
                  <Text style={styles.meta}>{`${fr.fiscal.declaredVolume} : ${d.declared_volume_m3}`}</Text>
                ) : null}
                {d.decision_motif ? <Text style={styles.warn}>{d.decision_motif}</Text> : null}
                <TouchableOpacity
                  style={styles.smallBtn}
                  onPress={() => void exportDiligence(d.id)}
                  disabled={exporting}
                  testID={`diligence-pdf-${d.id}`}
                >
                  <Text style={styles.smallBtnText}>{fr.traceability.pdf}</Text>
                </TouchableOpacity>
                <EudrStems diligenceId={d.id} />
              </View>
            ))
          )}
        </ScrollView>
      )}

      <SettleModal
        due={settling}
        onClose={() => setSettling(null)}
        onSaved={() => {
          setSettling(null);
          setMessage(fr.fiscal.settled);
          void loadDues();
        }}
      />
      <AgreementModal
        visible={creatingCcc}
        titles={titles}
        onClose={() => setCreatingCcc(false)}
        onSaved={() => {
          setCreatingCcc(false);
          setMessage(fr.fiscal.saved);
          void loadCcc();
        }}
      />
      <DiligenceModal
        visible={creatingEudr}
        titles={titles}
        onClose={() => setCreatingEudr(false)}
        onSaved={() => {
          setCreatingEudr(false);
          setMessage(fr.fiscal.saved);
          void loadEudr();
        }}
      />
    </View>
  );
}

function SettleModal({
  due,
  onClose,
  onSaved,
}: {
  due: TaxDue | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const [amount, setAmount] = useState("");
  const [receiptRef, setReceiptRef] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!due) return;
    setAmount(String(due.amount_fcfa));
    setReceiptRef("");
    setPaidAt("");
    setError(null);
  }, [due]);

  const submit = async () => {
    if (!due || busy) return;
    const value = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setError(fr.fiscal.amountRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await settleTaxDue(due.id, {
        amount_fcfa: value,
        receipt_ref: receiptRef.trim() || null,
        paid_at: paidAt.trim() || null,
      });
      onSaved();
    } catch (err) {
      console.error("settle failed", err);
      setError(fr.fiscal.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!due} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.fiscal.settleTitle}</Text>
          <ScrollView contentContainerStyle={styles.form}>
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
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
                <Text style={styles.cancelText}>{fr.admin.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, busy && styles.disabled]}
                onPress={submit}
                disabled={busy}
                testID="settle-submit"
              >
                {busy ? (
                  <ActivityIndicator color={theme.c.forest} />
                ) : (
                  <Text style={styles.submitText}>{fr.fiscal.settle}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function TitleChips({
  titles,
  value,
  onChange,
}: {
  titles: ForestTitle[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.chips}>
      <TouchableOpacity
        style={[styles.chip, value == null && styles.chipOn]}
        onPress={() => onChange(null)}
        testID="title-none"
      >
        <Text style={[styles.chipText, value == null && styles.chipTextOn]}>{fr.fiscal.none}</Text>
      </TouchableOpacity>
      {titles.map((t) => (
        <TouchableOpacity
          key={t.id}
          style={[styles.chip, value === t.id && styles.chipOn]}
          onPress={() => onChange(t.id)}
          testID={`title-${t.id}`}
        >
          <Text style={[styles.chipText, value === t.id && styles.chipTextOn]}>
            {t.reference ?? `${fr.fiscal.title} #${t.id}`}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function AgreementModal({
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
  const styles = useStyles();
  const theme = useTheme();
  const [titleId, setTitleId] = useState<number | null>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communityId, setCommunityId] = useState<number | null>(null);
  const [cccRef, setCccRef] = useState("");
  const [signedAt, setSignedAt] = useState("");
  const [rate, setRate] = useState("800");
  const [volume, setVolume] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitleId(null);
    setCommunityId(null);
    setCccRef("");
    setSignedAt("");
    setRate("800");
    setVolume("");
    setError(null);
    listCommunities()
      .then((list) => {
        setCommunities(list);
        setCommunityId(list[0]?.id ?? null);
      })
      .catch((err) => console.error("communities load failed", err));
  }, [visible]);

  const submit = async () => {
    if (busy) return;
    if (titleId == null || communityId == null) {
      setError(fr.fiscal.required);
      return;
    }
    const rateValue = parseFloat(rate.replace(",", "."));
    const volumeValue = volume.trim() ? parseFloat(volume.replace(",", ".")) : null;
    if (!Number.isFinite(rateValue) || rateValue <= 0) {
      setError(fr.fiscal.amountRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createCommunityAgreement({
        title_id: titleId,
        community_org_id: communityId,
        ccc_ref: cccRef.trim() || null,
        ccc_signed_at: signedAt.trim() || null,
        fdl_rate_fcfa_m3: rateValue,
        annual_volume_m3: volumeValue != null && Number.isFinite(volumeValue) ? volumeValue : null,
      });
      onSaved();
    } catch (err) {
      console.error("agreement create failed", err);
      setError(fr.fiscal.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.fiscal.newAgreement}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <Text style={styles.fieldLabel}>{fr.fiscal.title}</Text>
            <TitleChips titles={titles} value={titleId} onChange={setTitleId} />

            <Text style={styles.fieldLabel}>{fr.fiscal.community}</Text>
            <View style={styles.chips}>
              {communities.length === 0 ? (
                <Text style={styles.dim}>{fr.fiscal.none}</Text>
              ) : (
                communities.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.chip, communityId === c.id && styles.chipOn]}
                    onPress={() => setCommunityId(c.id)}
                    testID={`community-${c.id}`}
                  >
                    <Text style={[styles.chipText, communityId === c.id && styles.chipTextOn]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>

            <TextInput
              style={styles.input}
              placeholder={fr.fiscal.cccRef}
              placeholderTextColor={theme.c.muted}
              value={cccRef}
              onChangeText={setCccRef}
              autoCapitalize="characters"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.fiscal.signedAt}
              placeholderTextColor={theme.c.muted}
              value={signedAt}
              onChangeText={setSignedAt}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.fiscal.fdlRate}
              placeholderTextColor={theme.c.muted}
              value={rate}
              onChangeText={setRate}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.fiscal.annualVolume}
              placeholderTextColor={theme.c.muted}
              value={volume}
              onChangeText={setVolume}
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
                testID="agreement-submit"
              >
                {busy ? (
                  <ActivityIndicator color={theme.c.forest} />
                ) : (
                  <Text style={styles.submitText}>{fr.fiscal.newAgreement}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DiligenceModal({
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
  const styles = useStyles();
  const theme = useTheme();
  const [titleId, setTitleId] = useState<number | null>(null);
  const [parcel, setParcel] = useState("");
  const [wkt, setWkt] = useState("");
  const [volume, setVolume] = useState("");
  const [consultation, setConsultation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitleId(null);
    setParcel("");
    setWkt("");
    setVolume("");
    setConsultation("");
    setError(null);
  }, [visible]);

  const submit = async () => {
    if (busy) return;
    if (!parcel.trim()) {
      setError(fr.fiscal.required);
      return;
    }
    const volumeValue = volume.trim() ? parseFloat(volume.replace(",", ".")) : null;
    const consultationValue = consultation.trim() ? parseInt(consultation, 10) : null;
    setBusy(true);
    setError(null);
    try {
      await createEudrDiligence({
        title_id: titleId,
        parcel_label: parcel.trim(),
        parcel_wkt: wkt.trim() || null,
        declared_volume_m3: volumeValue != null && Number.isFinite(volumeValue) ? volumeValue : null,
        consultation_document_id:
          consultationValue != null && Number.isFinite(consultationValue) ? consultationValue : null,
      });
      onSaved();
    } catch (err) {
      console.error("diligence create failed", err);
      setError(fr.fiscal.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.fiscal.newDiligence}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <Text style={styles.fieldLabel}>{fr.fiscal.title}</Text>
            <TitleChips titles={titles} value={titleId} onChange={setTitleId} />

            <TextInput
              style={styles.input}
              placeholder={fr.fiscal.parcel}
              placeholderTextColor={theme.c.muted}
              value={parcel}
              onChangeText={setParcel}
            />
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder={fr.fiscal.parcelWkt}
              placeholderTextColor={theme.c.muted}
              value={wkt}
              onChangeText={setWkt}
              autoCapitalize="none"
              multiline
            />
            <TextInput
              style={styles.input}
              placeholder={fr.fiscal.declaredVolume}
              placeholderTextColor={theme.c.muted}
              value={volume}
              onChangeText={setVolume}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.fiscal.consultationDoc}
              placeholderTextColor={theme.c.muted}
              value={consultation}
              onChangeText={setConsultation}
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
                testID="diligence-submit"
              >
                {busy ? (
                  <ActivityIndicator color={theme.c.forest} />
                ) : (
                  <Text style={styles.submitText}>{fr.fiscal.newDiligence}</Text>
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
    gap: 3,
    padding: 3,
    marginHorizontal: th.space.lg,
    marginTop: th.space.md,
    borderRadius: th.radius.md,
    backgroundColor: th.c.surface2,
    alignSelf: "stretch",
    maxWidth: 640,
  },
  segBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    borderRadius: th.radius.sm + 2,
  },
  segOn: { backgroundColor: th.c.surface, borderWidth: 1, borderColor: th.c.line },
  segText: { color: th.c.muted, fontSize: 14, fontFamily: th.fonts.body },
  segTextOn: { color: th.c.olive, fontFamily: th.fonts.bodyBold },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: th.space.lg },
  error: { color: th.c.risk, fontSize: 15, textAlign: "center", fontFamily: th.fonts.body },
  link: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  list: { padding: th.space.lg, gap: th.space.sm, paddingBottom: th.space.xxl },
  note: { color: th.c.muted, fontSize: 12, fontStyle: "italic", fontFamily: th.fonts.body },
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
  warn: { color: th.c.warn, fontSize: 12, fontFamily: th.fonts.bodyBold },
  dim: { color: th.c.muted, fontSize: 15, marginTop: th.space.sm, fontFamily: th.fonts.body },
  success: {
    color: th.c.ok,
    fontSize: 15,
    paddingHorizontal: th.space.lg,
    paddingTop: th.space.sm,
    fontFamily: th.fonts.bodyBold,

  },
  action: {
    backgroundColor: th.c.olive,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: th.space.xl,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  actionText: { color: th.c.onOlive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  smallBtn: {
    alignSelf: "flex-start",
    backgroundColor: th.c.surface2,
    borderWidth: 1,
    borderColor: th.c.line,
    borderRadius: 8,
    paddingVertical: th.space.sm,
    paddingHorizontal: th.space.lg,
    alignItems: "center",
    marginTop: th.space.xs,
  },
  smallBtnText: { color: th.c.olive, fontSize: 12, fontFamily: th.fonts.bodyBold },
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
  multiline: { minHeight: 72, textAlignVertical: "top" },
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
