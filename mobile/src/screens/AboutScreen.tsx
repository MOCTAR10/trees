import Constants from "expo-constants";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import React, { useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";

import { ABOUT_SECTIONS, FAQ } from "../data/about";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Card, ScreenHeader, Segmented, Txt } from "../design/ui";
import { fr } from "../i18n/fr";

const SEAL = require("../../assets/leaf_logo.jpg");
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
  question: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  flex: { flex: 1 },
}));
