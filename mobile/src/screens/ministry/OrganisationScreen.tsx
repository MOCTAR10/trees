import { Factory, FileBadge, MapPin, UserPlus } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, TextInput, View } from "react-native";

import {
  createOrganisationAccount,
  getOrganisationSheet,
  getProvinces,
  OrganisationSheetFull,
  ProvinceSummary,
  registerTitle,
  setTitleProvince,
} from "../../api/client";
import MillRegister from "../../components/MillRegister";
import { makeStyles, useTheme } from "../../design/ThemeProvider";
import { Button, Card, Divider, EmptyState, KeyValue, Pill, ScreenHeader, Txt } from "../../design/ui";
import { frDate } from "../../design/format";
import { fr } from "../../i18n/fr";
import { exportInventoryPlatesPdf, sharePdf } from "../../pdf";

const t = fr.ministry;
const TITLE_TYPES = ["CFAD", "PFA", "PGG", "FC"] as const;
const STATUSES = ["actif", "provisoire", "exploration", "demande"] as const;
const ROLES = ["operator", "company"] as const;

interface Props {
  id: number;
  onBack: () => void;
}

function Chip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  const s = useStyles();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[s.chip, on && s.chipOn]}
      hitSlop={4}
    >
      <Txt variant="caption" bold={on} tone={on ? "onOlive" : "muted"}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** One organisation for the Ministry: titles (with province), compliance, accounts. */
export default function OrganisationScreen({ id, onBack }: Props) {
  const theme = useTheme();
  const s = useStyles();
  const [data, setData] = useState<OrganisationSheetFull | null>(null);
  const [provinces, setProvinces] = useState<ProvinceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sheet, setSheet] = useState<"title" | "account" | "mill" | null>(null);
  const [provinceFor, setProvinceFor] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [d, p] = await Promise.all([getOrganisationSheet(id), getProvinces().catch(() => [])]);
      setData(d);
      setProvinces(p);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const header = (
    <ScreenHeader
      eyebrow={data ? `${t.orgTypeOne[data.entry.org_type]}${data.entry.profile_label ? ` · ${data.entry.profile_label}` : ""}` : t.orgsTitle}
      title={data?.entry.name ?? t.orgsTitle}
      onBack={onBack}
      backLabel={fr.history.back}
    />
  );

  if (!data) {
    return (
      <View style={s.screen}>
        {header}
        {loading ? (
          <ActivityIndicator style={s.loader} color={theme.c.olive} />
        ) : error ? (
          <EmptyState message={fr.admin.error} tone="risk" action={{ label: fr.common.retry, onPress: () => void load() }} />
        ) : null}
      </View>
    );
  }

  const e = data.entry;
  return (
    <View style={s.screen} testID="organisation-screen">
      {header}
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.kpis}>
          <Kpi value={String(data.titles.length)} label={fr.ministry.sheetTitles} />
          <Kpi value={e.surface_ha ? t.surface(e.surface_ha) : "—"} label="surface" />
          <Kpi value={String(data.accounts.length)} label={fr.ministry.sheetAccounts} />
        </View>

        <View style={s.actions}>
          <Button
            testID="org-register-title"
            label={t.registerTitle}
            variant="secondary"
            compact
            onPress={() => setSheet("title")}
            icon={<FileBadge size={16} color={theme.c.olive} />}
            style={s.flex}
          />
          <Button
            testID="org-create-account"
            label={t.createAccount}
            compact
            onPress={() => setSheet("account")}
            icon={<UserPlus size={16} color={theme.c.onOlive} />}
            style={s.flex}
          />
        </View>

        <Card style={s.compact}>
          <Txt variant="label" tone="muted">
            {t.sheetTitles}
          </Txt>
          {data.titles.length === 0 ? <Txt tone="muted">{t.noTitles}</Txt> : null}
          {data.titles.map((ti, i) => (
            <View key={ti.id}>
              {i > 0 ? <Divider /> : null}
              <View style={s.row} testID={`org-title-${ti.id}`}>
                <View style={s.flex}>
                  <Txt variant="small" bold>
                    {`${ti.title_type} · ${ti.reference ?? `n° ${ti.id}`}`}
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {ti.province_name
                      ? `${ti.province_name} (${ti.province_source === "manuel" ? t.provinceManual : t.provinceGeom})`
                      : t.noProvince}
                  </Txt>
                </View>
                <Pill
                  tone={ti.status === "actif" ? "ok" : ti.status === "rejete" || ti.status === "retire" ? "risk" : "warn"}
                  label={fr.titles.status[ti.status] ?? ti.status}
                />
                <Pressable
                  testID={`org-title-province-${ti.id}`}
                  onPress={() => setProvinceFor(ti.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t.chooseProvince}
                  style={s.iconBtn}
                >
                  <MapPin size={16} color={theme.c.olive} />
                </Pressable>
              </View>
            </View>
          ))}
        </Card>

        <Card style={s.compact} testID="org-compliance">
          <Txt variant="label" tone="muted">
            {t.sheetCompliance}
          </Txt>
          {data.warnings.length === 0 ? <Txt tone="ok">{t.noWarnings}</Txt> : null}
          {data.warnings.map((w, i) => (
            <Txt key={i} variant="small" tone="warn">
              {`• ${
                w.kind === "tax"
                  ? t.warnTax(w.label ?? `Taxe ${w.tax_type ?? ""}`, w.period_year)
                  : t.warnDocument(w.label ?? w.doc_type ?? "", w.status ?? "manquant")
              }`}
            </Txt>
          ))}
        </Card>

        <Card style={s.compact}>
          <Txt variant="label" tone="muted">
            {t.sheetAccounts}
          </Txt>
          {data.accounts.length === 0 ? <Txt tone="muted">{t.noAccounts}</Txt> : null}
          {data.accounts.map((a) => (
            <View key={a.id} style={s.row} testID={`org-account-${a.id}`}>
              <View style={s.flex}>
                <Txt variant="small" bold>
                  {[a.first_name, a.last_name].filter(Boolean).join(" ") || a.display_name}
                </Txt>
                <Txt variant="caption" tone="muted">
                  {[a.email, a.matricule].filter(Boolean).join(" · ")}
                </Txt>
              </View>
              <Pill tone={a.is_active ? "neutral" : "risk"} label={fr.roles[a.role] ?? a.role} />
            </View>
          ))}
        </Card>

        {data.certifications.length ? (
          <Card style={s.compact}>
            <Txt variant="label" tone="muted">
              {t.sheetCerts}
            </Txt>
            {data.certifications.map((c) => (
              <KeyValue
                key={c.id}
                label={`${c.scheme} · ${fr.cert.type[c.cert_type] ?? c.cert_type}`}
                value={fr.cert.status[c.status] ?? c.status}
              />
            ))}
          </Card>
        ) : null}
        {data.entry.org_type === "entreprise" ? (
          <Card style={s.compact} testID="org-inventory-imports">
            <Txt variant="label" tone="muted">
              {fr.inventory.ministryTitle}
            </Txt>
            {data.inventoryImports.length === 0 ? (
              <Txt variant="small" tone="muted">
                {fr.inventory.ministryEmpty}
              </Txt>
            ) : (
              data.inventoryImports.map((i) => (
                <View key={i.id} style={s.importRow} testID={`org-inventory-import-${i.id}`}>
                  <View style={s.importText}>
                    <Txt variant="small" bold>
                      {`${i.file_name} · ${frDate(i.created_at)}`}
                    </Txt>
                    <Txt variant="caption">
                      {fr.inventory.ministryLine(i.aac_label ?? "—", i.stems_created, i.kept_count)}
                    </Txt>
                    <Txt variant="caption" tone="muted">
                      {[i.imported_by_name ?? i.imported_by_email, i.model_version].filter(Boolean).join(" · ")}
                    </Txt>
                  </View>
                  <Button
                    compact
                    variant="ghost"
                    label={fr.inventory.plates}
                    onPress={() => void exportInventoryPlatesPdf(i.id).then(sharePdf).catch((err) => console.error("plates", err))}
                    testID={`org-inventory-plates-${i.id}`}
                  />
                </View>
              ))
            )}
          </Card>
        ) : null}
        {data.entry.org_type === "entreprise" ? (
          <Button
            testID="org-mill-register"
            label={t.millRegister}
            variant="secondary"
            icon={<Factory size={16} color={theme.c.olive} />}
            onPress={() => setSheet("mill")}
          />
        ) : null}
      </ScrollView>

      <Modal visible={sheet === "mill"} animationType="slide" onRequestClose={() => setSheet(null)}>
        <View style={s.full} testID="org-mill-sheet">
          <ScreenHeader title={t.millRegister} onBack={() => setSheet(null)} />
          <MillRegister mode="admin" orgId={id} />
        </View>
      </Modal>
      <RegisterTitle
        visible={sheet === "title"}
        orgId={id}
        provinces={provinces}
        onClose={() => setSheet(null)}
        onDone={() => void load()}
      />
      <CreateAccount visible={sheet === "account"} orgId={id} onClose={() => setSheet(null)} onDone={() => void load()} />
      <ProvincePicker
        titleId={provinceFor}
        provinces={provinces}
        onClose={() => setProvinceFor(null)}
        onDone={() => void load()}
      />
    </View>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  const s = useStyles();
  return (
    <View style={s.kpi}>
      <Txt variant="heading" numeric>
        {value}
      </Txt>
      <Txt variant="caption" tone="muted">
        {label}
      </Txt>
    </View>
  );
}

function FormSheet({
  visible,
  title,
  onClose,
  onSubmit,
  busy,
  error,
  testID,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
  testID: string;
  children: React.ReactNode;
}) {
  const s = useStyles();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet} testID={testID}>
          <Txt variant="heading">{title}</Txt>
          <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
            {children}
            {error ? (
              <Txt variant="small" tone="risk">
                {error}
              </Txt>
            ) : null}
          </ScrollView>
          <View style={s.actions}>
            <Button label={t.cancel} variant="secondary" onPress={onClose} style={s.flex} />
            <Button testID={`${testID}-submit`} label={t.create} loading={busy} onPress={onSubmit} style={s.flex} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function RegisterTitle({
  visible,
  orgId,
  provinces,
  onClose,
  onDone,
}: {
  visible: boolean;
  orgId: number;
  provinces: ProvinceSummary[];
  onClose: () => void;
  onDone: () => void;
}) {
  const theme = useTheme();
  const s = useStyles();
  const [type, setType] = useState<(typeof TITLE_TYPES)[number]>("CFAD");
  const [reference, setReference] = useState("");
  const [surface, setSurface] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("actif");
  const [province, setProvince] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setType("CFAD");
    setReference("");
    setSurface("");
    setStatus("actif");
    setProvince(null);
    setError(null);
  }, [visible]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const ha = parseFloat(surface.replace(",", "."));
      await registerTitle({
        holder_org_id: orgId,
        title_type: type,
        reference: reference.trim() || null,
        zone: type === "FC" || type === "PGG" ? "rural" : "permanent",
        surface_ha: ha > 0 ? ha : null,
        status,
        province_code: province,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t.saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet visible={visible} title={t.registerTitle} onClose={onClose} onSubmit={() => void submit()} busy={busy} error={error} testID="title-register">
      <Txt variant="caption" tone="muted">
        {t.titleType}
      </Txt>
      <View style={s.chips}>
        {TITLE_TYPES.map((k) => (
          <Chip key={k} testID={`title-register-type-${k}`} label={k} on={type === k} onPress={() => setType(k)} />
        ))}
      </View>
      <Txt variant="caption" tone="muted">
        {t.titleRef}
      </Txt>
      <TextInput testID="title-register-ref" style={s.input} value={reference} onChangeText={setReference} placeholderTextColor={theme.c.muted} />
      <Txt variant="caption" tone="muted">
        {t.titleSurface}
      </Txt>
      <TextInput
        testID="title-register-surface"
        style={s.input}
        value={surface}
        onChangeText={setSurface}
        keyboardType="numeric"
        placeholderTextColor={theme.c.muted}
      />
      <Txt variant="caption" tone="muted">
        {t.titleStatus}
      </Txt>
      <View style={s.chips}>
        {STATUSES.map((k) => (
          <Chip key={k} testID={`title-register-status-${k}`} label={t.titleStatuses[k]} on={status === k} onPress={() => setStatus(k)} />
        ))}
      </View>
      <Txt variant="caption" tone="muted">
        {t.titleProvince}
      </Txt>
      <View style={s.chips}>
        {provinces.map((p) => (
          <Chip
            key={p.code}
            testID={`title-register-province-${p.code}`}
            label={p.name}
            on={province === p.code}
            onPress={() => setProvince(province === p.code ? null : p.code)}
          />
        ))}
      </View>
    </FormSheet>
  );
}

function CreateAccount({ visible, orgId, onClose, onDone }: { visible: boolean; orgId: number; onClose: () => void; onDone: () => void }) {
  const theme = useTheme();
  const s = useStyles();
  const [role, setRole] = useState<(typeof ROLES)[number]>("operator");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [matricule, setMatricule] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setRole("operator");
    setFirst("");
    setLast("");
    setEmail("");
    setPassword("");
    setMatricule("");
    setError(null);
  }, [visible]);

  const submit = async () => {
    if (!email.trim() || password.length < 8 || (role === "operator" && (!first.trim() || !last.trim()))) {
      setError(t.required);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createOrganisationAccount(orgId, {
        email: email.trim(),
        password,
        role,
        first_name: first.trim() || undefined,
        last_name: last.trim() || undefined,
        matricule: matricule.trim() || undefined,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t.saveError);
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, testID: string, extra: object = {}) => (
    <>
      <Txt variant="caption" tone="muted">
        {label}
      </Txt>
      <TextInput testID={testID} style={s.input} value={value} onChangeText={set} placeholderTextColor={theme.c.muted} {...extra} />
    </>
  );

  return (
    <FormSheet visible={visible} title={t.createAccount} onClose={onClose} onSubmit={() => void submit()} busy={busy} error={error} testID="account-create">
      <Txt variant="caption" tone="muted">
        {t.accountRole}
      </Txt>
      <View style={s.chips}>
        {ROLES.map((k) => (
          <Chip key={k} testID={`account-create-role-${k}`} label={t.accountRoles[k]} on={role === k} onPress={() => setRole(k)} />
        ))}
      </View>
      {field(t.firstName, first, setFirst, "account-create-first", { autoCapitalize: "words" })}
      {field(t.lastName, last, setLast, "account-create-last", { autoCapitalize: "words" })}
      {field(t.accountEmail, email, setEmail, "account-create-email", { autoCapitalize: "none", keyboardType: "email-address" })}
      {field(t.accountPassword, password, setPassword, "account-create-password", { secureTextEntry: true })}
      {field(t.matricule, matricule, setMatricule, "account-create-matricule", { autoCapitalize: "characters" })}
    </FormSheet>
  );
}

function ProvincePicker({
  titleId,
  provinces,
  onClose,
  onDone,
}: {
  titleId: number | null;
  provinces: ProvinceSummary[];
  onClose: () => void;
  onDone: () => void;
}) {
  const s = useStyles();
  const [busy, setBusy] = useState(false);
  const choose = async (code: string | null) => {
    if (titleId == null) return;
    setBusy(true);
    try {
      await setTitleProvince(titleId, code);
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={titleId != null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet} testID="province-picker">
          <Txt variant="heading">{t.chooseProvince}</Txt>
          <View style={s.chips}>
            {provinces.map((p) => (
              <Chip key={p.code} testID={`province-pick-${p.code}`} label={p.name} on={false} onPress={() => void choose(p.code)} />
            ))}
          </View>
          <View style={s.actions}>
            <Button label={t.cancel} variant="secondary" onPress={onClose} style={s.flex} disabled={busy} />
            <Button label={t.provinceGeom} variant="ghost" onPress={() => void choose(null)} style={s.flex} disabled={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((th) => ({
  full: { flex: 1, backgroundColor: th.c.bg },
  screen: { flex: 1, backgroundColor: th.c.bg },
  loader: { flex: 1 },
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl },
  flex: { flex: 1 },
  kpis: { flexDirection: "row", gap: th.space.sm },
  kpi: {
    flex: 1,
    alignItems: "center",
    backgroundColor: th.c.surface,
    borderRadius: th.radius.md,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingVertical: th.space.sm,
  },
  actions: { flexDirection: "row", gap: th.space.sm },
  compact: { padding: th.space.md, gap: th.space.xs },
  importRow: { flexDirection: "row", alignItems: "center", gap: th.space.sm, borderTopWidth: 1, borderTopColor: th.c.line, paddingTop: th.space.xs },
  importText: { flex: 1, gap: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: th.space.sm, paddingVertical: th.space.sm },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: th.space.xs },
  chip: {
    minHeight: 32,
    paddingHorizontal: th.space.md,
    borderRadius: th.radius.pill,
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: th.c.olive, borderColor: th.c.olive },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    maxHeight: "90%",
    backgroundColor: th.c.bg,
    borderTopLeftRadius: th.radius.xl,
    borderTopRightRadius: th.radius.xl,
    padding: th.space.lg,
    gap: th.space.md,
  },
  form: { gap: th.space.sm },
  input: {
    minHeight: 48,
    borderRadius: th.radius.md,
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.surface2,
    color: th.c.ink,
    fontFamily: th.fonts.body,
    fontSize: 15,
    paddingHorizontal: th.space.md,
  },
}));
