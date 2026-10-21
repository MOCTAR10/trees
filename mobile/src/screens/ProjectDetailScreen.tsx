import { Check, MapPin, ScanLine } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, ScrollView, TextInput, View } from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";

import {
  acceptProjectInvitation,
  AuthUser,
  declineProjectInvitation,
  getProject,
  inviteToProject,
  joinProject,
  leaveProject,
  ProjectDetail,
  ProjectRefusal,
} from "../api/client";
import { dec } from "../design/format";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, Card, Divider, EmptyState, Pill, ScreenHeader, Stat, Txt } from "../design/ui";
import { fr } from "../i18n/fr";
import { haptic } from "../utils/haptics";
import { regionForBox } from "../utils/mapMath";
import { canJoinProject, myProjectState } from "../utils/projectStatus";
import type { ScanProject } from "./ProjetsScreen";

const t = fr.projects;

interface Props {
  id: number;
  user: AuthUser;
  onBack: () => void;
  onScan?: (project: ScanProject) => void;
}

function zoneText(p: ProjectDetail): string {
  if (p.aac_id && p.aac_label) return t.zoneAac(p.aac_label);
  if (p.radius_km && p.latitude != null && p.longitude != null) return t.zoneCircle(dec(p.radius_km, p.radius_km % 1 ? 1 : 0));
  return t.zoneNone;
}

function refusal(err: unknown): string {
  return err instanceof ProjectRefusal ? err.message : t.actionError;
}

export default function ProjectDetailScreen({ id, user, onBack, onScan }: Props) {
  const s = useStyles();
  const theme = useTheme();
  const [project, setProject] = React.useState<ProjectDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteNote, setInviteNote] = React.useState<{ text: string; ok: boolean } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setProject(await getProject(id));
    } catch (err) {
      setLoadError(err instanceof ProjectRefusal ? err.message : t.loadError);
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      haptic("confirm");
      if (after) after();
      else await load();
    } catch (err) {
      setActionError(refusal(err));
    } finally {
      setBusy(false);
    }
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setBusy(true);
    setInviteNote(null);
    try {
      await inviteToProject(id, [email]);
      haptic("confirm");
      setInviteEmail("");
      setInviteNote({ text: t.invited(email), ok: true });
      await load();
    } catch (err) {
      setInviteNote({ text: err instanceof ProjectRefusal ? err.message : t.inviteError, ok: false });
    } finally {
      setBusy(false);
    }
  };

  const points = React.useMemo(
    () => (project?.contributions ?? []).filter((c) => c.latitude != null && c.longitude != null),
    [project],
  );
  const circle =
    project?.radius_km && project.latitude != null && project.longitude != null
      ? { center: { latitude: project.latitude, longitude: project.longitude }, km: project.radius_km }
      : null;
  const region = React.useMemo(() => {
    const lats = points.map((p) => p.latitude as number);
    const lons = points.map((p) => p.longitude as number);
    if (circle) {
      const d = circle.km / 111;
      lats.push(circle.center.latitude - d, circle.center.latitude + d);
      lons.push(circle.center.longitude - d, circle.center.longitude + d);
    }
    if (!lats.length) return null;
    return regionForBox(Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats));
  }, [points, circle]);

  const header = (
    <ScreenHeader
      eyebrow={project?.kind === "chantier" ? t.kindChantier : t.kindOpen}
      title={project?.title ?? t.title}
      onBack={onBack}
      backLabel={fr.history.back}
    />
  );

  if (loading && !project) {
    return (
      <View style={s.screen}>
        {header}
        <ActivityIndicator style={s.loader} color={theme.c.olive} />
      </View>
    );
  }
  if (!project) {
    return (
      <View style={s.screen}>
        {header}
        <EmptyState message={loadError ?? t.notFound} tone="risk" action={{ label: fr.common.retry, onPress: () => void load() }} />
      </View>
    );
  }

  const state = myProjectState(project, user.id);
  const open = project.status === "open";
  const myScans = project.my_scan_count ?? 0;
  const step = !open ? -1 : state !== "active" ? 0 : myScans === 0 ? 1 : 2;
  const steps = [state === "invited" ? t.stepAccept : t.stepJoin, t.stepGo, t.stepScan];
  const scanTarget: ScanProject = { id: project.id, title: project.title, kind: project.kind ?? "participatif" };

  let primary: React.ReactNode = null;
  if (!open) {
    primary = (
      <Txt variant="small" tone="warn" testID="project-closed">
        {t.closedNote}
      </Txt>
    );
  } else if (state === "invited") {
    primary = (
      <View style={s.row}>
        <Button
          testID="project-decline"
          label={t.decline}
          variant="secondary"
          disabled={busy}
          onPress={() => void run(() => declineProjectInvitation(id))}
          style={s.flex}
        />
        <Button
          testID="project-accept"
          label={t.accept}
          loading={busy}
          onPress={() => void run(() => acceptProjectInvitation(id))}
          style={s.flex}
        />
      </View>
    );
  } else if (state === "active") {
    primary = onScan ? (
      <Button
        testID="project-scan"
        label={t.scanForProject}
        onPress={() => onScan(scanTarget)}
        icon={<ScanLine size={18} color={theme.c.onOlive} strokeWidth={2.3} />}
      />
    ) : (
      <Txt variant="small" tone="muted" testID="project-scan-phone">
        {t.scanOnPhone}
      </Txt>
    );
  } else if (state === "owner" && !canJoinProject(project)) {
    primary = (
      <Txt variant="small" tone="muted" testID="project-owner">
        {t.ownerNote}
      </Txt>
    );
  } else if (canJoinProject(project)) {
    primary = <Button testID="project-join" label={t.join} loading={busy} onPress={() => void run(() => joinProject(id))} />;
  } else {
    primary = (
      <Txt variant="small" tone="muted" testID="project-invitation-only">
        {t.invitationOnly}
      </Txt>
    );
  }

  return (
    <View style={s.screen} testID="project-detail">
      {header}
      <ScrollView contentContainerStyle={s.content}>
        <Card raised>
          <View style={s.pills}>
            <Pill tone={project.kind === "chantier" ? "gold" : "info"} label={project.kind === "chantier" ? t.kindChantier : t.kindOpen} />
            <Pill tone={state === "active" ? "ok" : state === "invited" ? "warn" : state === "owner" ? "gold" : "neutral"} label={t.mine[state]} testID="project-mine" />
            {!open ? <Pill tone="neutral" label={t.closed} /> : null}
          </View>
          {project.description ? <Txt variant="small">{project.description}</Txt> : null}
          {project.kind !== "chantier" ? (
            <Txt variant="small" tone="olive" bold testID="project-goal">
              {t.goalLine(t.goal[project.objective] ?? t.goal.autre, t.target(project.target_type, project.target_value))}
            </Txt>
          ) : null}
          <View style={s.stats}>
            <Stat compact value={String(project.scan_count)} label={t.countScans} testID="project-count-scans" />
            <Stat compact value={String(myScans)} label={t.countMine} testID="project-count-mine" />
            <Stat compact value={String(project.species_count)} label={t.countSpecies} />
            <Stat compact value={String(project.participant_count)} label={t.countPeople} />
          </View>
        </Card>

        <Card testID="project-how">
          <Txt variant="label" tone="gold">
            {t.howTitle}
          </Txt>
          {steps.map((label, i) => {
            const done = i < step;
            const now = i === step;
            return (
              <View key={label} style={[s.step, now && s.stepNow]} testID={`project-step-${i}`} accessibilityState={{ selected: now }}>
                <View style={[s.stepDot, done && s.stepDotDone, now && s.stepDotNow]}>
                  {done ? (
                    <Check size={14} color={theme.c.onOlive} strokeWidth={3} />
                  ) : (
                    <Txt variant="caption" bold tone={now ? "onOlive" : "muted"}>
                      {String(i + 1)}
                    </Txt>
                  )}
                </View>
                <Txt variant="small" bold={now} style={s.flex}>
                  {label}
                </Txt>
                {now ? <Pill tone="gold" label={t.stepNow} /> : done ? <Pill tone="ok" label={t.stepDone} /> : null}
              </View>
            );
          })}
          <Txt variant="caption" tone="muted">
            {t.scanRule}
          </Txt>
          {primary}
          {actionError ? (
            <Txt variant="small" tone="risk" testID="project-error">
              {actionError}
            </Txt>
          ) : null}
          {open && state === "active" ? (
            <Button
              testID="project-leave"
              label={t.leave}
              variant="ghost"
              compact
              disabled={busy}
              onPress={() => void run(() => leaveProject(id))}
            />
          ) : null}
        </Card>

        <Card testID="project-zone">
          <View style={s.row}>
            <MapPin size={16} color={theme.c.goldInk} />
            <Txt variant="label" tone="gold">
              {t.zoneTitle}
            </Txt>
          </View>
          <Txt variant="small" testID="project-zone-text">
            {zoneText(project)}
          </Txt>
          {region ? (
            <MapView style={s.map} initialRegion={region} toolbarEnabled={false}>
              {circle ? (
                <Circle
                  center={circle.center}
                  radius={circle.km * 1000}
                  strokeColor={theme.c.gold}
                  fillColor="rgba(217,180,74,0.12)"
                  strokeWidth={2}
                />
              ) : null}
              {points.map((c) => (
                <Marker
                  key={c.id}
                  coordinate={{ latitude: c.latitude as number, longitude: c.longitude as number }}
                  title={c.species_scientific_name ?? t.unknownSpecies}
                  description={c.owner_name}
                  pinColor={theme.c.olive}
                />
              ))}
            </MapView>
          ) : null}
        </Card>

        {project.participants ? (
          <Card testID="project-people">
            <Txt variant="label" tone="gold">
              {t.inviteTitle}
            </Txt>
            <View style={s.row}>
              <TextInput
                testID="project-invite-email"
                value={inviteEmail}
                onChangeText={setInviteEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="agent@exemple.ga"
                placeholderTextColor={theme.c.muted}
                style={s.input}
              />
              <Button testID="project-invite" label={t.invite} variant="secondary" compact disabled={busy} onPress={() => void handleInvite()} />
            </View>
            {inviteNote ? (
              <Txt variant="small" tone={inviteNote.ok ? "ok" : "risk"}>
                {inviteNote.text}
              </Txt>
            ) : null}
            {project.participants.map((pp, i) => (
              <View key={pp.user_id}>
                {i > 0 ? <Divider /> : null}
                <View style={s.row}>
                  <Txt variant="small" style={s.flex}>
                    {[pp.first_name, pp.last_name].filter(Boolean).join(" ") || pp.display_name}
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {t.personStatus[pp.status] ?? pp.status}
                  </Txt>
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        <Card testID="project-contributions">
          <Txt variant="label" tone="gold">
            {t.contributions}
          </Txt>
          {project.contributions.length === 0 ? (
            <Txt variant="small" tone="muted">
              {t.noContributions}
            </Txt>
          ) : (
            project.contributions.map((c, i) => (
              <View key={c.id}>
                {i > 0 ? <Divider /> : null}
                <Txt variant="small" bold style={s.italic}>
                  {c.species_scientific_name ?? t.unknownSpecies}
                </Txt>
                <Txt variant="caption" tone="muted">
                  {[
                    c.owner_name,
                    c.measured_dbh_cm != null ? t.dbh(dec(c.measured_dbh_cm, 0)) : null,
                    new Date(c.created_at).toLocaleDateString("fr-FR"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Txt>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  loader: { marginTop: th.space.xl },
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: th.space.xs },
  stats: { flexDirection: "row", gap: th.space.sm, marginTop: th.space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  flex: { flex: 1 },
  italic: { fontStyle: "italic" },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.sm,
    paddingVertical: th.space.sm,
    paddingHorizontal: th.space.sm,
    borderRadius: th.radius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  stepNow: { borderColor: th.c.gold, backgroundColor: th.c.surface2 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: th.c.line,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotDone: { backgroundColor: th.c.ok, borderColor: th.c.ok },
  stepDotNow: { backgroundColor: th.c.olive, borderColor: th.c.olive },
  input: {
    flex: 1,
    backgroundColor: th.c.bg,
    borderRadius: th.radius.md,
    borderWidth: 1,
    borderColor: th.c.line,
    color: th.c.ink,
    fontFamily: th.fonts.body,
    paddingHorizontal: th.space.md,
    paddingVertical: th.space.sm,
  },
  map: { height: 200, borderRadius: th.radius.md, marginTop: th.space.xs },
}));
