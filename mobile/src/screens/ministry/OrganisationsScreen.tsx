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
import { DataTable, useDesktop, useDialog } from "../../design/layout";
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
  const desktop = useDesktop();
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
  const provinceList = (o: OrganisationEntry) =>
    o.provinces.length ? o.provinces.map((c) => provinceName.get(c) ?? c).join(", ") : t.noProvince;
  const statePill = (o: OrganisationEntry) =>
    o.documents_missing || o.taxes_overdue ? (
      <Pill
        tone={o.taxes_overdue ? "risk" : "warn"}
        label={(o.documents_missing ? t.docsMissing(o.documents_missing) : t.taxesOverdue(o.taxes_overdue)) as string}
      />
    ) : o.documents_pending ? (
      <Pill tone="info" label={t.docsPending(o.documents_pending)} />
    ) : (
      <Pill tone="ok" label={t.upToDate} />
    );
  const stateRank = (o: OrganisationEntry) => (o.taxes_overdue ? 0 : o.documents_missing ? 1 : o.documents_pending ? 2 : 3);

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

        {shown.length && desktop ? (
          <DataTable
            testID="org-table"
            rows={shown}
            rowKey={(o) => String(o.id)}
            rowTestID={(o) => `org-${o.id}`}
            onRowPress={onOpen}
            initialSort={{ key: "name" }}
            columns={[
              {
                key: "name",
                title: t.cols.org,
                flex: 3,
                sortValue: (o) => o.name,
                render: (o) => (
                  <View style={s.nameCell}>
                    <View style={s.logo}>
                      <Txt variant="caption" bold style={s.logoText}>
                        {initials(o.name)}
                      </Txt>
                    </View>
                    <Txt variant="small" bold style={s.flex} numberOfLines={2}>
                      {o.name}
                    </Txt>
                  </View>
                ),
              },
              {
                key: "profile",
                title: t.cols.profile,
                flex: 1.6,
                sortValue: (o) => o.profile_label ?? t.orgTypeOne[o.org_type],
                render: (o) => (
                  <Txt variant="small" numberOfLines={2}>
                    {o.profile_label ?? t.orgTypeOne[o.org_type]}
                  </Txt>
                ),
              },
              {
                key: "province",
                title: t.cols.province,
                flex: 1.6,
                sortValue: (o) => (o.provinces.length ? provinceList(o) : null),
                render: (o) => (
                  <Txt variant="small" tone={o.provinces.length ? "ink" : "muted"} numberOfLines={2}>
                    {provinceList(o)}
                  </Txt>
                ),
              },
              {
                key: "titles",
                title: t.cols.titles,
                width: 80,
                align: "right",
                sortValue: (o) => o.titles,
                render: (o) => (
                  <Txt variant="small" numeric>
                    {String(o.titles)}
                  </Txt>
                ),
              },
              {
                key: "surface",
                title: t.cols.surface,
                width: 120,
                align: "right",
                sortValue: (o) => o.surface_ha,
                render: (o) => (
                  <Txt variant="small" numeric tone={o.surface_ha ? "ink" : "muted"}>
                    {o.surface_ha ? t.surface(o.surface_ha) : "—"}
                  </Txt>
                ),
              },
              { key: "state", title: t.cols.state, width: 190, sortValue: stateRank, render: statePill },
            ]}
          />
        ) : shown.length ? (
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
  const dialog = useDialog();
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
    <Modal visible={visible} transparent animationType={dialog.animation} onRequestClose={onClose}>
      <View style={[s.backdrop, dialog.backdrop]}>
        <View style={[s.sheet, dialog.sheet]} testID="org-create">
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
  nameCell: { flexDirection: "row", alignItems: "center", gap: th.space.md, alignSelf: "stretch" },
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
