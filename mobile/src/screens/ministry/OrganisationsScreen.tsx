import { Building2, ChevronRight, Plus } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";

import {
  createOrganisation,
  getOrganisationDirectory,
  getProvinces,
  listOrgProfiles,
  OrganisationEntry,
  OrgProfileDefinition,
  OrgType,
  ProvinceSummary,
} from "../../api/client";
import { makeStyles, useTheme } from "../../design/ThemeProvider";
import { Button, EmptyState, Pill, Txt } from "../../design/ui";
import { fr } from "../../i18n/fr";

const t = fr.ministry;
const TYPES: OrgType[] = ["entreprise", "communaute", "cooperative"];

interface Props {
  initialProvince?: string | null;
  onOpen: (org: OrganisationEntry) => void;
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

function initials(name: string): string {
  const words = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter((w) => w.length > 2);
  return (words.slice(0, 3).map((w) => w[0]).join("") || name.slice(0, 2)).toUpperCase();
}

/** Legal entities (companies, communities, cooperatives) by province and type. */
export default function OrganisationsScreen({ initialProvince, onOpen }: Props) {
  const theme = useTheme();
  const s = useStyles();
  const [orgs, setOrgs] = useState<OrganisationEntry[]>([]);
  const [provinces, setProvinces] = useState<ProvinceSummary[]>([]);
  const [province, setProvince] = useState<string | null>(initialProvince ?? null);
  const [type, setType] = useState<OrgType | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setProvince(initialProvince ?? null);
  }, [initialProvince]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [rows, provs] = await Promise.all([getOrganisationDirectory(), getProvinces().catch(() => [])]);
      setOrgs(rows);
      setProvinces(provs);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const provinceName = useMemo(() => new Map(provinces.map((p) => [p.code, p.name])), [provinces]);
  const q = query.trim().toLowerCase();
  const shown = orgs.filter(
    (o) =>
      (!province || o.provinces.includes(province)) &&
      (!type || o.org_type === type) &&
      (!q || o.name.toLowerCase().includes(q)),
  );
  const typeCount = (k: OrgType) => orgs.filter((o) => o.org_type === k).length;

  return (
    <View style={s.screen} testID="organisations-screen">
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={loading && orgs.length > 0} onRefresh={() => void load()} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.titleRow}>
          <Txt variant="title" style={s.flex}>{`${t.orgsTitle} · ${orgs.length}`}</Txt>
          <Button
            testID="org-new"
            label={t.newOrg}
            compact
            onPress={() => setCreating(true)}
            icon={<Plus size={16} color={theme.c.onOlive} />}
          />
        </View>
        <TextInput
          testID="org-search"
          style={s.search}
          value={query}
          onChangeText={setQuery}
          placeholder={t.search}
          placeholderTextColor={theme.c.muted}
        />
        <View style={s.chips}>
          <Chip testID="org-type-all" label={t.allOrgTypes} on={!type} onPress={() => setType(null)} />
          {TYPES.map((k) => (
            <Chip key={k} testID={`org-type-${k}`} label={`${t.orgTypes[k]} ${typeCount(k)}`} on={type === k} onPress={() => setType(k)} />
          ))}
        </View>
        {provinces.length ? (
          <View style={s.chips}>
            <Chip testID="org-province-all" label={t.allProvinces} on={!province} onPress={() => setProvince(null)} />
            {provinces.map((p) => (
              <Chip
                key={p.code}
                testID={`org-province-${p.code}`}
                label={`${p.name}${p.organisations ? ` ${p.organisations}` : ""}`}
                on={province === p.code}
                onPress={() => setProvince(p.code)}
              />
            ))}
          </View>
        ) : null}

        {loading && orgs.length === 0 ? <ActivityIndicator color={theme.c.olive} /> : null}
        {error ? (
          <EmptyState message={fr.admin.error} tone="risk" action={{ label: fr.common.retry, onPress: () => void load() }} />
        ) : !loading && shown.length === 0 ? (
          <Txt tone="muted" testID="org-empty">
            {t.nothingPending}
          </Txt>
        ) : null}

        {shown.length ? (
          <View style={s.list}>
            {shown.map((o) => {
              const issues = [
                o.documents_missing ? t.docsMissing(o.documents_missing) : null,
                o.taxes_overdue ? t.taxesOverdue(o.taxes_overdue) : null,
              ].filter(Boolean) as string[];
              return (
                <Pressable
                  key={o.id}
                  testID={`org-${o.id}`}
                  onPress={() => onOpen(o)}
                  accessibilityRole="button"
                  style={({ pressed }) => [s.row, pressed && s.pressed]}
                >
                  <View style={s.logo}>
                    <Txt variant="caption" bold style={s.logoText}>
                      {initials(o.name)}
                    </Txt>
                  </View>
                  <View style={s.flex}>
                    <Txt variant="small" bold>
                      {o.name}
                    </Txt>
                    <Txt variant="caption" tone="muted">
                      {[
                        o.profile_label ?? t.orgTypeOne[o.org_type],
                        o.titles ? t.titlesCount(o.titles) : null,
                        o.surface_ha ? t.surface(o.surface_ha) : null,
                        o.provinces.length ? o.provinces.map((c) => provinceName.get(c) ?? c).join(", ") : t.noProvince,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Txt>
                  </View>
                  {issues.length ? (
                    <Pill tone={o.taxes_overdue ? "risk" : "warn"} label={issues[0]} />
                  ) : o.documents_pending ? (
                    <Pill tone="info" label={t.docsPending(o.documents_pending)} />
                  ) : (
                    <Pill tone="ok" label={t.upToDate} />
                  )}
                  <ChevronRight size={16} color={theme.c.muted} />
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
      <CreateOrganisation visible={creating} onClose={() => setCreating(false)} onCreated={() => void load()} />
    </View>
  );
}

function CreateOrganisation({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const theme = useTheme();
  const s = useStyles();
  const [profiles, setProfiles] = useState<OrgProfileDefinition[]>([]);
  const [name, setName] = useState("");
  const [profile, setProfile] = useState<string | null>(null);
  const [cooperative, setCooperative] = useState(false);
  const [taxId, setTaxId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName("");
    setProfile(null);
    setCooperative(false);
    setTaxId("");
    setError(null);
    listOrgProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
  }, [visible]);

  const submit = async () => {
    if (!name.trim() || (!profile && !cooperative)) {
      setError(t.required);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createOrganisation({
        name: name.trim(),
        profile_code: cooperative ? null : profile,
        org_type: cooperative ? "cooperative" : null,
        tax_id: taxId.trim() || null,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t.saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet} testID="org-create">
          <View style={s.sheetHead}>
            <Building2 size={18} color={theme.c.olive} />
            <Txt variant="heading">{t.newOrg}</Txt>
          </View>
          <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
            <Txt variant="caption" tone="muted">
              {t.orgName}
            </Txt>
            <TextInput testID="org-create-name" style={s.input} value={name} onChangeText={setName} placeholderTextColor={theme.c.muted} />
            <Txt variant="caption" tone="muted">
              {t.orgProfile}
            </Txt>
            <View style={s.chips}>
              {profiles.map((p) => (
                <Chip
                  key={p.code}
                  testID={`org-create-profile-${p.code}`}
                  label={p.label}
                  on={!cooperative && profile === p.code}
                  onPress={() => {
                    setCooperative(false);
                    setProfile(p.code);
                  }}
                />
              ))}
              <Chip
                testID="org-create-cooperative"
                label={t.orgTypeOne.cooperative}
                on={cooperative}
                onPress={() => {
                  setCooperative(true);
                  setProfile(null);
                }}
              />
            </View>
            <Txt variant="caption" tone="muted">
              {t.taxId}
            </Txt>
            <TextInput testID="org-create-tax" style={s.input} value={taxId} onChangeText={setTaxId} placeholderTextColor={theme.c.muted} />
            {error ? (
              <Txt variant="small" tone="risk">
                {error}
              </Txt>
            ) : null}
          </ScrollView>
          <View style={s.actions}>
            <Button label={t.cancel} variant="secondary" onPress={onClose} style={s.flex} />
            <Button testID="org-create-submit" label={t.create} loading={busy} onPress={() => void submit()} style={s.flex} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl },
  flex: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  search: {
    minHeight: 44,
    borderRadius: th.radius.md,
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.surface,
    color: th.c.ink,
    fontFamily: th.fonts.body,
    fontSize: 15,
    paddingHorizontal: th.space.md,
  },
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
  list: {
    backgroundColor: th.c.surface,
    borderRadius: th.radius.lg,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingHorizontal: th.space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.sm,
    paddingVertical: th.space.md,
    borderBottomWidth: 1,
    borderBottomColor: th.c.line,
  },
  pressed: { opacity: 0.7 },
  logo: {
    width: 38,
    height: 38,
    borderRadius: th.radius.md,
    backgroundColor: th.c.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { color: th.c.gold },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    maxHeight: "88%",
    backgroundColor: th.c.bg,
    borderTopLeftRadius: th.radius.xl,
    borderTopRightRadius: th.radius.xl,
    padding: th.space.lg,
    gap: th.space.md,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
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
  actions: { flexDirection: "row", gap: th.space.sm },
}));
