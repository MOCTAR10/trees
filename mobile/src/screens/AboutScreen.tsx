import Constants from "expo-constants";
import { ChevronDown, ChevronUp, Phone } from "lucide-react-native";
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
              <Txt variant="title" tone="onForest">
                {t.company}
              </Txt>
              <Txt variant="small" tone="onForest" style={s.center}>
                {t.builtByNote}
              </Txt>
              <View style={s.contacts}>
                <Txt variant="label" tone="gold">
                  {t.contactsTitle}
                </Txt>
                {t.contacts.map((c) => (
                  <Pressable
                    key={c.name}
                    testID={`contact-${c.name.split(" ")[0].toLowerCase()}`}
                    accessibilityRole="button"
                    accessibilityLabel={t.call(c.name)}
                    onPress={() => void Linking.openURL(`tel:${c.phone.replace(/\s/g, "")}`)}
                    style={s.contact}
                  >
                    <View style={s.contactTexts}>
                      <Txt bold tone="onForest">
                        {c.name}
                      </Txt>
                      <Txt variant="caption" tone="onForest">
                        {c.role}
                      </Txt>
                    </View>
                    <View style={s.phonePill}>
                      <Phone size={14} color={theme.c.forest} />
                      <Txt variant="small" bold numeric style={s.phoneText}>
                        {c.phone}
                      </Txt>
                    </View>
                  </Pressable>
                ))}
              </View>
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
  makerLogo: { width: 220, height: 110, borderRadius: 12, backgroundColor: "#FFFFFF", marginBottom: th.space.sm },
  contacts: { alignSelf: "stretch", gap: th.space.sm, marginTop: th.space.md },
  contact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: th.space.sm,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: th.radius.md,
    paddingHorizontal: th.space.md,
    paddingVertical: th.space.sm,
    minHeight: 52,
  },
  contactTexts: { flex: 1 },
  phonePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: th.c.gold,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  phoneText: { color: th.c.forest },
  question: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  flex: { flex: 1 },
}));
