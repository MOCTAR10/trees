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
  createStudy,
  decideStudy,
  EnvironmentalStudy,
  issueStudyCertificate,
  listStudies,
  StudyType,
} from "../api/client";
import { fr } from "../i18n/fr";
import { exportStudyPdf, sharePdf } from "../pdf";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import Badge, { studyTone } from "./Badge";

/** Environmental studies (PPF / EIE) + certificat de conformité of a title
 * (Loi 016/01 ; Loi 007/2014).
 *
 * Company: declares a PPF (DGFAP) — Plan de Protection de la Faune — or an EIE
 * (DGE) — Étude d'Impact Environnemental — and exports the PDF. Ministry:
 * validates or rejects the study (motivated) and issues the certificat de
 * conformité once validated. Shared by CompanyTitles and AdminTitles.
 */
export default function TitleStudies({
  titleId,
  mode,
}: {
  titleId: number;
  mode: "company" | "admin";
}) {
  const th = useTheme();
  const styles = useStyles();
  const [studies, setStudies] = useState<EnvironmentalStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [declaring, setDeclaring] = useState<StudyType | null>(null);
  const [deciding, setDeciding] = useState<EnvironmentalStudy | null>(null);
  const [certifying, setCertifying] = useState<EnvironmentalStudy | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listStudies(titleId);
      setStudies(rows ?? []);
    } catch (err) {
      console.error("studies load failed", err);
    } finally {
      setLoading(false);
    }
  }, [titleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (
    study: EnvironmentalStudy,
    decision: "valide" | "rejete",
    motif: string,
  ) => {
    setBusy(true);
    setMessage(null);
    try {
      await decideStudy(titleId, study.id, decision, motif || null);
      setMessage(decision === "valide" ? fr.titles.study.validated : fr.titles.study.rejected);
      await load();
    } catch (err) {
      console.error("study decision failed", err);
      setMessage(fr.titles.study.error);
    } finally {
      setBusy(false);
    }
  };

  const certify = async (study: EnvironmentalStudy, reference: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await issueStudyCertificate(titleId, study.id, reference);
      setMessage(fr.titles.study.certified);
      await load();
    } catch (err) {
      console.error("certificate failed", err);
      setMessage(fr.titles.study.error);
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = async (id: number) => {
    setExporting(true);
    setMessage(null);
    try {
      await sharePdf(await exportStudyPdf(titleId, id));
    } catch (err) {
      console.error("study pdf failed", err);
      setMessage(fr.titles.study.error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{fr.titles.study.section}</Text>
        {mode === "company" ? (
          <View style={styles.links}>
            <TouchableOpacity
              onPress={() => {
                setMessage(null);
                setDeclaring("ppf");
              }}
              testID="study-add-ppf"
            >
              <Text style={styles.link}>+ {fr.titles.study.short.ppf}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setMessage(null);
                setDeclaring("eie");
              }}
              testID="study-add-eie"
            >
              <Text style={styles.link}>+ {fr.titles.study.short.eie}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {message ? <Text style={styles.success}>{message}</Text> : null}

      {loading ? (
        <ActivityIndicator color={th.c.olive} />
      ) : studies.length === 0 ? (
        <Text style={styles.dim}>{fr.titles.study.none}</Text>
      ) : (
        studies.map((study) => (
          <View key={study.id} style={styles.card} testID={`study-${study.id}`}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{fr.titles.study.type[study.study_type]}</Text>
              <Badge
                label={fr.titles.study.status[study.status] ?? study.status}
                tone={studyTone(study.status)}
              />
            </View>
            <Text style={styles.meta}>
              {`${fr.titles.study.reference} : ${study.reference}`}
              {study.authority ? ` · ${study.authority}` : ""}
            </Text>
            {study.conducted_at ? (
              <Text style={styles.meta}>
                {`${fr.titles.study.conductedAt} : ${study.conducted_at.slice(0, 10)}`}
              </Text>
            ) : null}
            {study.valid_from || study.valid_to ? (
              <Text style={styles.meta}>
                {`${fr.titles.study.validity} : ${study.valid_from ?? "—"} → ${study.valid_to ?? "—"}`}
              </Text>
            ) : null}
            {study.certificate_ref ? (
              <Text style={styles.meta}>
                {`${fr.titles.study.certificate} : ${study.certificate_ref}`}
                {study.certificate_issued_at
                  ? ` (${study.certificate_issued_at.slice(0, 10)})`
                  : ""}
              </Text>
            ) : null}
            {study.decision_motif ? <Text style={styles.meta}>{study.decision_motif}</Text> : null}

            <View style={styles.actionsRow}>
              {mode === "admin" && study.status === "soumis" ? (
                <>
                  <TouchableOpacity
                    style={[styles.smallBtn, styles.approve]}
                    disabled={busy}
                    onPress={() => {
                      setMessage(null);
                      void decide(study, "valide", "");
                    }}
                    testID={`study-validate-${study.id}`}
                  >
                    <Text style={styles.smallBtnText}>{fr.titles.study.validate}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallBtn, styles.reject]}
                    disabled={busy}
                    onPress={() => {
                      setMessage(null);
                      setDeciding(study);
                    }}
                    testID={`study-reject-${study.id}`}
                  >
                    <Text style={styles.smallBtnText}>{fr.titles.study.reject}</Text>
                  </TouchableOpacity>
                </>
              ) : null}
              {mode === "admin" && study.status === "valide" && !study.certificate_ref ? (
                <TouchableOpacity
                  style={[styles.smallBtn, styles.approve]}
                  disabled={busy}
                  onPress={() => {
                    setMessage(null);
                    setCertifying(study);
                  }}
                  testID={`study-certify-${study.id}`}
                >
                  <Text style={styles.smallBtnText}>{fr.titles.study.issueCertificate}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.smallBtn}
                disabled={exporting}
                onPress={() => void exportPdf(study.id)}
                testID={`study-pdf-${study.id}`}
              >
                <Text style={styles.smallBtnText}>{fr.titles.study.pdf}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      <DeclareModal
        titleId={titleId}
        type={declaring}
        onClose={() => setDeclaring(null)}
        onDeclared={() => {
          setDeclaring(null);
          setMessage(fr.titles.study.declared);
          void load();
        }}
      />

      <RejectModal
        target={deciding}
        onClose={() => setDeciding(null)}
        onConfirm={(study, motif) => {
          setDeciding(null);
          void decide(study, "rejete", motif);
        }}
      />

      <CertificateModal
        target={certifying}
        onClose={() => setCertifying(null)}
        onConfirm={(study, reference) => {
          setCertifying(null);
          void certify(study, reference);
        }}
      />
    </View>
  );
}

function DeclareModal({
  titleId,
  type,
  onClose,
  onDeclared,
}: {
  titleId: number;
  type: StudyType | null;
  onClose: () => void;
  onDeclared: () => void;
}) {
  const th = useTheme();
  const styles = useStyles();
  const [reference, setReference] = useState("");
  const [authority, setAuthority] = useState("");
  const [conductedAt, setConductedAt] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (type == null) return;
    setReference("");
    setAuthority(type === "ppf" ? "DGFAP" : "DGE");
    setConductedAt("");
    setValidFrom("");
    setValidTo("");
    setError(null);
  }, [type]);

  const submit = async () => {
    if (type == null || busy) return;
    if (!reference.trim()) {
      setError(fr.titles.study.referenceRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createStudy(titleId, {
        study_type: type,
        reference: reference.trim(),
        authority: authority.trim() || null,
        conducted_at: conductedAt.trim() || null,
        valid_from: validFrom.trim() || null,
        valid_to: validTo.trim() || null,
      });
      onDeclared();
    } catch (err) {
      console.error("create study failed", err);
      setError(fr.titles.study.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={type != null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>
            {type ? fr.titles.study.type[type] : fr.titles.study.section}
          </Text>
          <ScrollView contentContainerStyle={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={fr.titles.study.reference}
              placeholderTextColor={th.c.muted}
              value={reference}
              onChangeText={setReference}
              autoCapitalize="characters"
              testID="study-reference"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.titles.study.authority}
              placeholderTextColor={th.c.muted}
              value={authority}
              onChangeText={setAuthority}
              autoCapitalize="characters"
              testID="study-authority"
            />
            <TextInput
              style={styles.input}
              placeholder={`${fr.titles.study.conductedAt} (AAAA-MM-JJ)`}
              placeholderTextColor={th.c.muted}
              value={conductedAt}
              onChangeText={setConductedAt}
              testID="study-conducted"
            />
            <TextInput
              style={styles.input}
              placeholder="Début de validité (AAAA-MM-JJ)"
              placeholderTextColor={th.c.muted}
              value={validFrom}
              onChangeText={setValidFrom}
              testID="study-valid-from"
            />
            <TextInput
              style={styles.input}
              placeholder="Fin de validité (AAAA-MM-JJ)"
              placeholderTextColor={th.c.muted}
              value={validTo}
              onChangeText={setValidTo}
              testID="study-valid-to"
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
                testID="study-submit"
              >
                {busy ? (
                  <ActivityIndicator color={th.c.onOlive} />
                ) : (
                  <Text style={styles.submitText}>{fr.titles.study.declare}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function RejectModal({
  target,
  onClose,
  onConfirm,
}: {
  target: EnvironmentalStudy | null;
  onClose: () => void;
  onConfirm: (study: EnvironmentalStudy, motif: string) => void;
}) {
  const th = useTheme();
  const styles = useStyles();
  const [motif, setMotif] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMotif("");
    setError(null);
  }, [target]);

  const confirm = () => {
    if (target == null) return;
    if (!motif.trim()) {
      setError(fr.titles.study.motifRequired);
      return;
    }
    onConfirm(target, motif.trim());
  };

  return (
    <Modal visible={target != null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.titles.study.reject}</Text>
          <TextInput
            style={styles.input}
            placeholder={fr.titles.study.motif}
            placeholderTextColor={th.c.muted}
            value={motif}
            onChangeText={setMotif}
            testID="study-reject-motif"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>{fr.admin.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={confirm} testID="study-reject-submit">
              <Text style={styles.submitText}>{fr.titles.study.reject}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CertificateModal({
  target,
  onClose,
  onConfirm,
}: {
  target: EnvironmentalStudy | null;
  onClose: () => void;
  onConfirm: (study: EnvironmentalStudy, reference: string) => void;
}) {
  const th = useTheme();
  const styles = useStyles();
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReference("");
    setError(null);
  }, [target]);

  const confirm = () => {
    if (target == null) return;
    if (!reference.trim()) {
      setError(fr.titles.study.certificateRequired);
      return;
    }
    onConfirm(target, reference.trim());
  };

  return (
    <Modal visible={target != null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.titles.study.issueCertificate}</Text>
          <TextInput
            style={styles.input}
            placeholder={fr.titles.study.certificateRef}
            placeholderTextColor={th.c.muted}
            value={reference}
            onChangeText={setReference}
            autoCapitalize="characters"
            testID="study-cert-ref"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>{fr.admin.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={confirm}
              testID="study-cert-submit"
            >
              <Text style={styles.submitText}>{fr.titles.study.issueCertificate}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((th) => ({
  section: { gap: th.space.sm, marginTop: th.space.sm },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: th.space.sm,
  },
  sectionTitle: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  links: { flexDirection: "row", gap: th.space.lg },
  link: { color: th.c.olive, fontSize: 12, fontFamily: th.fonts.bodyBold },
  success: { color: th.c.ok, fontSize: 12, fontFamily: th.fonts.bodyBold },
  dim: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  card: {
    backgroundColor: th.c.surface2,
    borderRadius: 8,
    padding: th.space.sm,
    gap: th.space.xs,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: th.space.sm,
  },
  cardTitle: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold, flexShrink: 1 },
  meta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: th.space.sm,
    marginTop: th.space.xs,
  },
  smallBtn: {
    borderRadius: 8,
    paddingVertical: th.space.xs,
    paddingHorizontal: th.space.lg,
    backgroundColor: th.c.surface,
    borderWidth: 1,
    borderColor: th.c.line,
  },
  approve: { backgroundColor: th.c.ok, borderColor: th.c.ok },
  reject: { backgroundColor: th.c.risk, borderColor: th.c.risk },
  smallBtnText: { color: th.c.ink, fontSize: 12, fontFamily: th.fonts.bodyBold },
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
  form: { gap: 0 },
  input: {
    backgroundColor: th.c.surface2,
    borderRadius: 8,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm,
    color: th.c.ink,
    fontSize: 15,
    fontFamily: th.fonts.body,
    marginBottom: th.space.sm,
  },
  error: { color: th.c.risk, fontSize: 12, fontFamily: th.fonts.body },
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
    flex: 1,
    alignItems: "center",
    paddingVertical: th.space.lg,
    borderRadius: 10,
    backgroundColor: th.c.olive,
  },
  submitText: { color: th.c.onOlive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  submitDisabled: { opacity: 0.6 },
}));
