import React from "react";
import { Pressable, ScrollView, View } from "react-native";

import { makeStyles } from "../design/ThemeProvider";
import { Txt } from "../design/ui";
import { fr } from "../i18n/fr";

export type CompanyTab =
  | "accueil"
  | "abattage"
  | "grumes"
  | "tracabilite"
  | "documents"
  | "titres"
  | "cert"
  | "taxes"
  | "fiscal"
  | "residues";

export const COMPANY_GROUPS: { key: string; tabs: CompanyTab[] }[] = [
  { key: "accueil", tabs: ["accueil"] },
  { key: "exploitation", tabs: ["abattage", "grumes", "tracabilite"] },
  { key: "conformite", tabs: ["documents", "titres", "cert"] },
  { key: "finances", tabs: ["taxes", "fiscal"] },
  { key: "circulaire", tabs: ["residues"] },
];

export function groupOf(tab: CompanyTab): string {
  return COMPANY_GROUPS.find((g) => g.tabs.includes(tab))?.key ?? "accueil";
}

interface Props {
  tab: CompanyTab;
  labels: Record<CompanyTab, string>;
  onChange: (tab: CompanyTab) => void;
}

/** Two-level company navigation: work areas, then the screens of the area. */
export default function CompanyNav({ tab, labels, onChange }: Props) {
  const s = useStyles();
  const group = groupOf(tab);
  const tabs = COMPANY_GROUPS.find((g) => g.key === group)?.tabs ?? [];
  return (
    <View style={s.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {COMPANY_GROUPS.map((g) => {
          const on = g.key === group;
          return (
            <Pressable
              key={g.key}
              testID={`company-group-${g.key}`}
              onPress={() => onChange(g.tabs[0])}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[s.group, on && s.groupOn]}
            >
              <Txt variant="small" bold tone={on ? "onOlive" : "muted"}>
                {fr.companySpace.groups[g.key]}
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>
      {tabs.length > 1 ? (
        <View style={s.subRow}>
          {tabs.map((k) => {
            const on = k === tab;
            return (
              <Pressable
                key={k}
                testID={`company-tab-${k}`}
                onPress={() => onChange(k)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[s.sub, on && s.subOn]}
              >
                <Txt variant="caption" bold={on} tone={on ? "olive" : "muted"}>
                  {labels[k]}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  wrap: { backgroundColor: th.c.surface, borderBottomWidth: 1, borderBottomColor: th.c.line },
  row: { paddingHorizontal: th.space.md, paddingVertical: th.space.sm, gap: th.space.xs },
  group: {
    minHeight: 34,
    paddingHorizontal: th.space.md,
    borderRadius: th.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  groupOn: { backgroundColor: th.c.olive },
  subRow: { flexDirection: "row", paddingHorizontal: th.space.md, gap: th.space.md },
  sub: { paddingVertical: th.space.sm, borderBottomWidth: 2, borderBottomColor: "transparent" },
  subOn: { borderBottomColor: th.c.gold },
}));
