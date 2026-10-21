import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, RefreshControl, ScrollView, View } from "react-native";

import { AuthUser, CooperativeSpace, getCooperativeSpace } from "../api/client";
import RoleHeader from "../components/RoleHeader";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { EmptyState, Segmented, Txt } from "../design/ui";
import { fr } from "../i18n/fr";
import CoopDocuments from "./cooperative/CoopDocuments";
import CoopMemberDetail from "./cooperative/CoopMemberDetail";
import CoopMembers from "./cooperative/CoopMembers";
import CoopOverview from "./cooperative/CoopOverview";
import CoopResidues from "./cooperative/CoopResidues";

interface Props {
  user: AuthUser;
  onLogout: () => void;
  showHeader?: boolean;
}

const TABS = ["overview", "members", "compliance", "residues"] as const;
type Tab = (typeof TABS)[number];

/** Cooperative space: summary of the members, members, own pieces, wood residues. */
export default function CooperativeScreen({ showHeader = true }: Props) {
  const theme = useTheme();
  const s = useStyles();
  const [tab, setTab] = useState<Tab>("overview");
  const [space, setSpace] = useState<CooperativeSpace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSpace(await getCooperativeSpace());
    } catch (err) {
      setError(String(err).includes("409") ? fr.coop.noOrg : fr.cooperative.error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (memberId == null) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setMemberId(null);
      return true;
    });
    return () => sub.remove();
  }, [memberId]);

  if (memberId != null) {
    return <CoopMemberDetail membershipId={memberId} onBack={() => setMemberId(null)} />;
  }

  const body = () => {
    if (tab === "residues") return <CoopResidues />;
    if (!space) {
      return loading ? (
        <ActivityIndicator style={s.loader} color={theme.c.olive} />
      ) : (
        <EmptyState message={error ?? fr.cooperative.error} tone="risk" action={{ label: fr.common.retry, onPress: () => void load() }} />
      );
    }
    return (
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      >
        {tab === "overview" ? <CoopOverview space={space} /> : null}
        {tab === "members" ? <CoopMembers space={space} onOpen={(m) => setMemberId(m.id)} onChanged={load} /> : null}
        {tab === "compliance" ? <CoopDocuments space={space} onChanged={load} /> : null}
      </ScrollView>
    );
  };

  return (
    <View style={s.container} testID="cooperative-screen">
      {showHeader && <RoleHeader title={fr.cooperative.title} subtitle={fr.cooperative.subtitle} />}
      <View style={s.top}>
        {space ? (
          <Txt variant="title" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75} testID="coop-name">
            {space.organization.name}
          </Txt>
        ) : null}
        <Segmented testID="coop-tabs" options={TABS.map((key) => ({ key, label: fr.coop.tabs[key] }))} value={tab} onChange={setTab} />
      </View>
      {body()}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.c.bg },
  top: { paddingHorizontal: t.space.lg, paddingTop: t.space.md, gap: t.space.sm },
  loader: { flex: 1 },
  content: { padding: t.space.lg, gap: t.space.md, paddingBottom: t.space.xxl },
}));
