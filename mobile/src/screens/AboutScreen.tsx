import Constants from "expo-constants";
import { ChevronDown, ChevronUp, Globe, Phone } from "lucide-react-native";
import React, { useState } from "react";
import { Image, Linking, Pressable, ScrollView, View } from "react-native";

import { ABOUT_SECTIONS, FAQ } from "../data/about";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Card, ScreenHeader, Segmented, Txt } from "../design/ui";
import { fr } from "../i18n/fr";

const SEAL = require("../../assets/leaf_logo.jpg");
const GREEN_LEAVES = require("../../assets/greenleave_logo.png");
const t = fr.about;

type Tab = "about" | "faq";

export default function AboutScreen({ onBack }: { onBack: () => void }) {
  const s = useStyles();
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>("about");
  const [open, setOpen] = useState<number | null>(0);

  return (
    <View style={s.screen} testID="about-screen">
      <ScreenHeader eyebrow={fr.header.ministry} title={t.title} onBack={onBack} backLabel={fr.history.back} />
      <View style={s.tabs}>
        <Segmented
          testID="about-tabs"
          options={[
            { key: "about", label: t.tabAbout },
            { key: "faq", label: t.tabFaq },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {tab === "about" ? (
          <>
            <Card raised style={s.hero}>
              <Image source={SEAL} style={s.seal} resizeMode="contain" accessibilityLabel={fr.header.ministry} />
              <Txt variant="label" tone="gold">
                {fr.auth.republic}
              </Txt>
              <Txt variant="title">{fr.appTitle}</Txt>
              <Txt variant="small" tone="muted">
                {t.version(Constants.expoConfig?.version ?? "—")}
              </Txt>
            </Card>
            <Card raised style={s.maker} testID="about-maker">
              <Image source={GREEN_LEAVES} style={s.makerLogo} resizeMode="contain" accessibilityLabel={t.company} />
              <Txt variant="label" tone="gold">
                {t.builtBy}
              </Txt>
              <Txt variant="title" tone="onForest" style={s.center}>
                {t.company}
              </Txt>
              <Txt variant="small" tone="onForest" style={s.center}>
                {t.builtByNote}
              </Txt>
              <Txt variant="caption" tone="onForest" style={s.center}>
                {t.pitch}
              </Txt>
            </Card>

            <Card style={s.block} testID="about-team">
              <Txt variant="label" tone="gold">
                {t.teamTitle}
              </Txt>
              {t.contacts.map((c) => (
                <Pressable
                  key={c.name}
                  testID={`contact-${c.name.split(" ")[0].toLowerCase()}`}
                  accessibilityRole="button"
                  accessibilityLabel={t.call(c.name)}
                  onPress={() => void Linking.openURL(`tel:${c.phone.replace(/\s/g, "")}`)}
                  style={({ pressed }) => [s.person, { borderLeftColor: c.accent === "gold" ? theme.c.gold : "#4664B2" }, pressed && s.pressed]}
                >
                  <View style={s.personTop}>
                    <View style={[s.avatar, { backgroundColor: c.accent === "gold" ? theme.c.gold : "#4664B2" }]}>
                      <Txt bold style={s.avatarText}>
                        {c.name.split(" ").map((w) => w[0]).join("")}
                      </Txt>
                    </View>
                    <View style={s.personTexts}>
                      <Txt bold>{c.name}</Txt>
                      <Txt variant="small" tone="olive" bold>
                        {c.role}
                      </Txt>
                      {c.detail ? (
                        <Txt variant="caption" tone="muted">
                          {c.detail}
                        </Txt>
                      ) : null}
                    </View>
                  </View>
                  <View style={s.phonePill}>
                    <Phone size={16} color={theme.c.forest} />
                    <Txt variant="small" bold numeric style={s.phoneText}>
                      {c.phone}
                    </Txt>
                  </View>
                </Pressable>
              ))}
              <Txt variant="label" tone="gold" style={s.linksTitle}>
                {t.linksTitle}
              </Txt>
              <View style={s.links}>
                <Pressable testID="link-web" accessibilityRole="link" onPress={() => void Linking.openURL(t.webUrl)} style={s.linkBtn}>
                  <Globe size={16} color={theme.c.olive} />
                  <Txt variant="small" bold tone="olive">
                    {t.webApp}
                  </Txt>
                </Pressable>
              </View>
              <Txt variant="caption" tone="muted" style={s.center}>
                {t.pilot}
              </Txt>
            </Card>
            {ABOUT_SECTIONS.map((section) => (
              <Card key={section.title} style={s.block}>
                <Txt variant="heading">{section.title}</Txt>
                <Txt tone="muted">{section.body}</Txt>
              </Card>
            ))}
          </>
        ) : (
          FAQ.map((item, i) => (
            <Card key={item.q} style={s.block}>
              <Pressable
                testID={`faq-${i}`}
                onPress={() => setOpen(open === i ? null : i)}
                style={s.question}
                accessibilityRole="button"
                accessibilityState={{ expanded: open === i }}
              >
                <Txt bold style={s.flex}>
                  {item.q}
                </Txt>
                {open === i ? <ChevronUp size={18} color={theme.c.olive} /> : <ChevronDown size={18} color={theme.c.olive} />}
              </Pressable>
              {open === i ? <Txt tone="muted">{item.a}</Txt> : null}
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  tabs: { paddingHorizontal: th.space.lg, paddingTop: th.space.md },
  content: { padding: th.space.lg, gap: th.space.md },
  hero: { alignItems: "center", gap: 4 },
  seal: { width: 96, height: 64, borderRadius: 8, marginBottom: th.space.sm },
  block: { gap: th.space.xs },
  center: { textAlign: "center" },
  maker: { alignItems: "center", gap: th.space.xs, backgroundColor: th.c.forest, borderColor: th.c.gold, borderWidth: 1.5 },
  makerLogo: { width: 260, height: 130, borderRadius: 12, backgroundColor: "#FFFFFF", marginBottom: th.space.sm },
  pressed: { opacity: 0.75 },
  personTop: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  person: {
    gap: th.space.sm,
    borderLeftWidth: 4,
    backgroundColor: th.c.surface2,
    borderRadius: th.radius.md,
    paddingHorizontal: th.space.md,
    paddingVertical: th.space.sm,
    minHeight: 64,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF" },
  personTexts: { flex: 1, minWidth: 0 },
  phonePill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    gap: 8,
    backgroundColor: th.c.gold,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  linksTitle: { marginTop: th.space.sm },
  links: { flexDirection: "row", gap: th.space.sm, flexWrap: "wrap" },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: th.c.olive,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 40,
  },
  phoneText: { color: th.c.forest },
  question: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  flex: { flex: 1 },
}));
