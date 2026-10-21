import { Plus, ScanLine } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { acceptProjectInvitation, AuthUser, joinProject, listProjects, Project, ProjectRefusal } from "../api/client";
import { CardGrid } from "../design/layout";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, Card, EmptyState, Pill, PillTone, ScreenHeader, Segmented, Txt } from "../design/ui";
import { fr } from "../i18n/fr";
import { haptic } from "../utils/haptics";
import { isJoinable, isMyProject, myProjectState, MyProjectState, nextProjectAction } from "../utils/projectStatus";

const t = fr.projects;

type Tab = "mine" | "open";

export type ScanProject = { id: number; title: string; kind: "chantier" | "participatif" };

interface Props {
  user: AuthUser;
  onOpenProject: (project: Project) => void;
  onCreateProject: () => void;
  onBack: () => void;
  onScan?: (project: ScanProject) => void;
}

const STATE_TONE: Record<MyProjectState, PillTone> = { active: "ok", invited: "warn", owner: "gold", none: "neutral" };
let lastTab: Tab | null = null;

function detailLine(p: Project): string {
  if (p.kind === "chantier") {
    const where = [p.aac_label ? `AAC ${p.aac_label}` : null, p.company_name].filter(Boolean).join(" · ");
    const trees = p.registry_trees ? t.chantierTrees(p.registry_scanned ?? 0, p.registry_trees) : null;
    return [where, trees].filter(Boolean).join(" · ");
  }
  return t.goalLine(t.goal[p.objective] ?? t.goal.autre, t.target(p.target_type, p.target_value));
}

export default function ProjetsScreen({ user, onOpenProject, onCreateProject, onBack, onScan }: Props) {
  const s = useStyles();
  const theme = useTheme();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [tab, setTabState] = React.useState<Tab | null>(lastTab);
  const setTab = (next: Tab) => {
    lastTab = next;
    setTabState(next);
  };
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setProjects(await listProjects());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const admin = user.role === "admin";
  const mine = projects.filter((p) => isMyProject(p, user.id, admin));
  const joinable = projects.filter((p) => !isMyProject(p, user.id, admin) && isJoinable(p));
  const current: Tab = tab ?? (mine.length || !joinable.length ? "mine" : "open");
  const list = current === "mine" ? mine : joinable;
  const canCreate = admin || user.role === "company";

  const act = async (p: Project, action: (id: number) => Promise<unknown>, next: Tab) => {
    setBusyId(p.id);
    setActionError(null);
    try {
      await action(p.id);
      haptic("confirm");
      await load();
      setTab(next);
    } catch (err) {
      setActionError(err instanceof ProjectRefusal ? err.message : t.actionError);
    } finally {
      setBusyId(null);
    }
  };

  const onAction = (p: Project) => {
    const action = nextProjectAction(p, !!onScan);
    if (action === "join") void act(p, joinProject, "mine");
    else if (action === "accept") void act(p, acceptProjectInvitation, "mine");
    else if (action === "scan" && onScan) onScan({ id: p.id, title: p.title, kind: p.kind ?? "participatif" });
    else {
      haptic("tap");
      onOpenProject(p);
    }
  };

  const header = (
    <ScreenHeader
      eyebrow={t.eyebrow}
      title={t.title}
      onBack={onBack}
      backLabel={fr.history.back}
      right={
        canCreate ? (
          <Button
            testID="projects-create"
            label={t.create}
            variant="gold"
            compact
            onPress={onCreateProject}
            icon={<Plus size={16} color={theme.c.forest} />}
          />
        ) : undefined
      }
    />
  );

  return (
    <View style={s.screen} testID="projects-screen">
      {header}
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.intro} testID="projects-intro">
          <Txt variant="small">
            <Txt variant="small" bold>
              {`${t.kindChantier} · `}
            </Txt>
            {t.introChantier}
          </Txt>
          <Txt variant="small">
            <Txt variant="small" bold>
              {`${t.kindOpen} · `}
            </Txt>
            {t.introOpen}
          </Txt>
        </View>

        {loading && !projects.length ? (
          <ActivityIndicator style={s.loader} color={theme.c.olive} />
        ) : error ? (
          <EmptyState message={t.loadError} tone="risk" action={{ label: fr.common.retry, onPress: () => void load() }} />
        ) : (
          <>
            <Segmented
              testID="projects-tabs"
              options={[
                { key: "mine", label: t.tabMine(mine.length) },
                { key: "open", label: t.tabOpen(joinable.length) },
              ]}
              value={current}
              onChange={(k) => {
                haptic("select");
                setActionError(null);
                setTab(k);
              }}
            />
            {actionError ? (
              <Txt variant="small" tone="risk" testID="projects-error">
                {actionError}
              </Txt>
            ) : null}
            {list.length === 0 ? (
              <EmptyState message={current === "mine" ? t.emptyMine : t.emptyOpen} />
            ) : (
              <CardGrid testID="projects-list">
                {list.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    userId={user.id}
                    busy={busyId === p.id}
                    canScan={!!onScan}
                    onOpen={() => {
                      haptic("tap");
                      onOpenProject(p);
                    }}
                    onAction={() => onAction(p)}
                  />
                ))}
              </CardGrid>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ProjectCard({
  project: p,
  userId,
  busy,
  canScan,
  onOpen,
  onAction,
}: {
  project: Project;
  userId: number;
  busy: boolean;
  canScan: boolean;
  onOpen: () => void;
  onAction: () => void;
}) {
  const s = useStyles();
  const theme = useTheme();
  const state = myProjectState(p, userId);
  const action = nextProjectAction(p, canScan);
  const label = { join: t.join, accept: t.accept, scan: t.scan, open: t.open }[action];
  const chantier = p.kind === "chantier";
  return (
    <Card testID={`project-card-${p.id}`}>
      <Pressable testID={`project-open-${p.id}`} accessibilityRole="button" accessibilityLabel={p.title} onPress={onOpen} style={s.body}>
        <View style={s.pills}>
          <Pill tone={chantier ? "gold" : "info"} label={chantier ? t.kindChantier : t.kindOpen} testID={`project-kind-${p.id}`} />
          <Pill tone={STATE_TONE[state]} label={t.mine[state]} testID={`project-mine-${p.id}`} />
          {p.status !== "open" ? <Pill tone="neutral" label={t.closed} /> : null}
        </View>
        <Txt variant="heading" numberOfLines={2}>
          {p.title}
        </Txt>
        <Txt variant="small" tone="muted" numberOfLines={2}>
          {detailLine(p)}
        </Txt>
      </Pressable>
      <View style={s.footer}>
        <Txt variant="caption" tone="olive" bold style={s.flex}>
          {`${t.scans(p.scan_count)} · ${t.people(p.participant_count)}`}
        </Txt>
        <Button
          testID={`project-action-${p.id}`}
          label={label}
          variant={action === "open" ? "secondary" : "primary"}
          compact
          loading={busy}
          onPress={onAction}
          icon={action === "scan" ? <ScanLine size={16} color={theme.c.onOlive} strokeWidth={2.3} /> : undefined}
        />
      </View>
    </Card>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl },
  intro: { gap: th.space.xs },
  loader: { marginTop: th.space.xl },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: th.space.xs },
  footer: { flexDirection: "row", alignItems: "center", gap: th.space.sm, marginTop: th.space.xs },
  body: { gap: th.space.xs },
  flex: { flex: 1 },
}));
