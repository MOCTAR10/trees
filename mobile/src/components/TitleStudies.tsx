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
import { colors, spacing, type } from "../theme";
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
        <ActivityIndicator color={colors.accent} />
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
              placeholderTextColor={colors.textDim}
              value={reference}
              onChangeText={setReference}
              autoCapitalize="characters"
              testID="study-reference"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.titles.study.authority}
              placeholderTextColor={colors.textDim}
              value={authority}
              onChangeText={setAuthority}
              autoCapitalize="characters"
              testID="study-authority"
            />
            <TextInput
              style={styles.input}
              placeholder={`${fr.titles.study.conductedAt} (AAAA-MM-JJ)`}
              placeholderTextColor={colors.textDim}
              value={conductedAt}
              onChangeText={setConductedAt}
              testID="study-conducted"
            />
            <TextInput
              style={styles.input}
              placeholder="Début de validité (AAAA-MM-JJ)"
              placeholderTextColor={colors.textDim}
              value={validFrom}
              onChangeText={setValidFrom}
              testID="study-valid-from"
            />
            <TextInput
              style={styles.input}
              placeholder="Fin de validité (AAAA-MM-JJ)"
              placeholderTextColor={colors.textDim}
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
                  <ActivityIndicator color={colors.primary} />
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
            placeholderTextColor={colors.textDim}
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
            placeholderTextColor={colors.textDim}
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

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.sm },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  sectionTitle: { color: colors.accent, fontSize: type.body, fontWeight: "800" },
  links: { flexDirection: "row", gap: spacing.md },
  link: { color: colors.accent, fontSize: type.caption, fontWeight: "800" },
  success: { color: colors.success, fontSize: type.caption, fontWeight: "700" },
  dim: { color: colors.textDim, fontSize: type.caption },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  cardTitle: { color: colors.text, fontSize: type.body, fontWeight: "700", flexShrink: 1 },
  meta: { color: colors.textDim, fontSize: type.caption },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  smallBtn: {
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  approve: { backgroundColor: colors.success, borderColor: colors.success },
  reject: { backgroundColor: colors.error, borderColor: colors.error },
  smallBtnText: { color: colors.text, fontSize: type.caption, fontWeight: "800" },
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
  form: { gap: 0 },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: type.body,
    marginBottom: spacing.sm,
  },
  error: { color: colors.error, fontSize: type.caption },
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
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  submitText: { color: colors.primary, fontSize: type.body, fontWeight: "800" },
  submitDisabled: { opacity: 0.6 },
});
