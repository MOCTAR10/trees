import { UserPlus } from "lucide-react-native";
import React, { useState } from "react";
import { Switch, View } from "react-native";

import {
  addCoopMember,
  CoopMembership,
  CooperativeSpace,
  searchCoopCandidates,
  updateCoopMember,
} from "../../api/client";
import { CardGrid } from "../../design/layout";
import { makeStyles, useTheme } from "../../design/ThemeProvider";
import { Button, Card, Pill, Txt } from "../../design/ui";
import { frDate } from "../../design/format";
import { fr } from "../../i18n/fr";
import { aggregateAlerts, m3, MEMBERSHIP_TONE } from "./aggregate";
import { AddMemberDialog, MemberStatusDialog, StatusTarget } from "./MemberDialogs";

const t = fr.coop;

/** One member: status, dates, its own figures when active, and the actions on the membership. */
export function MemberCard({
  member,
  onOpen,
  onStatus,
  onReactivate,
}: {
  member: CoopMembership;
  onOpen?: (m: CoopMembership) => void;
  onStatus?: (target: StatusTarget) => void;
  onReactivate?: (m: CoopMembership) => void;
}) {
  const s = useStyles();
  const agg = member.aggregate;
  const alerts = aggregateAlerts(agg);
  return (
    <Card testID={`member-${member.id}`} style={s.card}>
      <View style={s.top}>
        <View style={s.flex}>
          <Txt bold>{member.member_name}</Txt>
          <Txt variant="caption" tone="muted">
            {[fr.org.type[member.member_org_type] ?? member.member_org_type, member.member_profile_label, t.provinces(member.member_provinces)]
              .filter(Boolean)
              .join(" · ")}
          </Txt>
        </View>
        <Pill tone={MEMBERSHIP_TONE[member.status]} label={t.status[member.status] ?? member.status} testID={`member-status-${member.id}`} />
      </View>
      <Txt variant="caption" tone="muted">
        {[t.joinedOn(frDate(member.joined_on)), member.left_on ? t.leftOn(frDate(member.left_on)) : null, member.added_via === "ministere" ? t.viaMinistry : null]
          .filter(Boolean)
          .join(" · ")}
      </Txt>
      {member.status_reason ? (
        <Txt variant="caption" tone={member.status === "active" ? "muted" : "warn"}>
          {t.reasonLine(member.status_reason)}
        </Txt>
      ) : null}
      {agg ? (
        <Txt variant="small">
          {`${agg.titles.total} ${t.titles.toLowerCase()} · ${agg.aac.total} ${t.aac} · ${t.felled} ${m3(agg.volumes.felled_m3)} ${t.m3}`}
        </Txt>
      ) : null}
      {alerts.map((a) => (
        <Txt key={a.text} variant="caption" tone={a.tone}>
          {`• ${a.text}`}
        </Txt>
      ))}
      <View style={s.actions}>
        {onOpen ? <Button compact variant="secondary" label={t.open} onPress={() => onOpen(member)} testID={`member-open-${member.id}`} /> : null}
        {member.status === "active" && onStatus ? (
          <Button
            compact
            variant="ghost"
            label={t.suspend}
            onPress={() => onStatus({ membership: member, status: "suspendue" })}
            testID={`member-suspend-${member.id}`}
          />
        ) : null}
        {member.status === "suspendue" && onReactivate ? (
          <Button compact variant="ghost" label={t.reactivate} onPress={() => onReactivate(member)} testID={`member-reactivate-${member.id}`} />
        ) : null}
        {member.status !== "sortie" && onStatus ? (
          <Button
            compact
            variant="ghost"
            label={t.leave}
            onPress={() => onStatus({ membership: member, status: "sortie" })}
            testID={`member-leave-${member.id}`}
          />
        ) : null}
      </View>
    </Card>
  );
}

/** Members managed by the cooperative: add, suspend, reactivate, record a leaving. */
export default function CoopMembers({
  space,
  onOpen,
  onChanged,
}: {
  space: CooperativeSpace;
  onOpen: (m: CoopMembership) => void;
  onChanged: () => Promise<void> | void;
}) {
  const theme = useTheme();
  const s = useStyles();
  const [showFormer, setShowFormer] = useState(false);
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState<StatusTarget | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "risk"; text: string } | null>(null);

  const former = space.members.filter((m) => m.status === "sortie");
  const shown = space.members.filter((m) => showFormer || m.status !== "sortie");

  const reactivate = async (m: CoopMembership) => {
    setNotice(null);
    try {
      await updateCoopMember(m.id, { status: "active" });
      setNotice({ tone: "ok", text: t.updated });
      await onChanged();
    } catch (err) {
      setNotice({ tone: "risk", text: err instanceof Error && err.message ? err.message : t.saveError });
    }
  };

  return (
    <View style={s.wrap} testID="coop-members">
      <Button
        testID="coop-add-member"
        label={t.addMember}
        onPress={() => {
          setNotice(null);
          setAdding(true);
        }}
        icon={<UserPlus size={16} color={theme.c.onOlive} />}
      />
      <Txt variant="caption" tone="muted">
        {t.counts(space.counts.active, space.counts.suspendue, space.counts.sortie)}
      </Txt>
      {notice ? (
        <Txt variant="small" tone={notice.tone} testID="coop-members-notice">
          {notice.text}
        </Txt>
      ) : null}
      {former.length ? (
        <View style={s.switchRow}>
          <Txt variant="small" tone="muted" style={s.flex}>
            {t.showFormer(former.length)}
          </Txt>
          <Switch
            testID="coop-show-former"
            value={showFormer}
            onValueChange={setShowFormer}
            trackColor={{ true: theme.c.olive, false: theme.c.line }}
            thumbColor={theme.c.surface}
          />
        </View>
      ) : null}
      {shown.length === 0 ? (
        <Txt tone="muted">{t.membersEmpty}</Txt>
      ) : (
        <CardGrid minColumnWidth={340}>
          {shown.map((m) => (
            <MemberCard key={m.id} member={m} onOpen={onOpen} onStatus={setTarget} onReactivate={(x) => void reactivate(x)} />
          ))}
        </CardGrid>
      )}

      <AddMemberDialog
        visible={adding}
        search={searchCoopCandidates}
        onAdd={addCoopMember}
        onClose={() => setAdding(false)}
        onDone={(added) => {
          setNotice({ tone: "ok", text: t.added(added.member_name) });
          void onChanged();
        }}
      />
      <MemberStatusDialog
        target={target}
        onSubmit={(m, change) => updateCoopMember(m.id, change)}
        onClose={() => setTarget(null)}
        onDone={() => {
          setNotice({ tone: "ok", text: t.updated });
          void onChanged();
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  wrap: { gap: th.space.md },
  card: { gap: th.space.xs },
  top: { flexDirection: "row", alignItems: "flex-start", gap: th.space.sm },
  flex: { flex: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: th.space.xs, marginTop: th.space.xs },
  switchRow: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
}));
