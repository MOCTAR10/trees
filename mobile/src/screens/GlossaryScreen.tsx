import React, { useMemo, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";

import { FILE_FLOW, FlowStep, GLOSSARY, LOG_LIFECYCLE, MORE_FLOWS, WORK_MODES } from "../data/glossary";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Card, ScreenHeader, Segmented, Txt } from "../design/ui";
import { fr } from "../i18n/fr";

const t = fr.glossary;

type Tab = "flows" | "terms";

interface Props {
  onBack: () => void;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export default function GlossaryScreen({ onBack }: Props) {
  const s = useStyles();
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>("flows");
  const [query, setQuery] = useState("");

  const sections = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return GLOSSARY;
    return GLOSSARY.map((section) => ({
      ...section,
      entries: section.entries.filter((e) => normalize(`${e.term} ${e.definition}`).includes(q)),
    })).filter((section) => section.entries.length > 0);
  }, [query]);

  return (
    <View style={s.screen} testID="glossary-screen">
      <ScreenHeader eyebrow={fr.header.ministry} title={t.title} onBack={onBack} backLabel={fr.history.back} />
      <View style={s.tabs}>
        <Segmented
          testID="glossary-tabs"
          options={[
            { key: "flows", label: t.tabFlows },
            { key: "terms", label: t.tabTerms },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === "flows" ? (
        <ScrollView contentContainerStyle={s.content}>
          <Card raised style={s.block}>
            <Txt variant="heading">{t.lifecycle}</Txt>
            <Txt variant="small" tone="muted">
              {t.lifecycleIntro}
            </Txt>
            <Flow steps={LOG_LIFECYCLE} testID="glossary-lifecycle" />
          </Card>
          <Card raised style={s.block}>
            <Txt variant="heading">{t.fileFlow}</Txt>
            <Flow steps={FILE_FLOW} testID="glossary-file-flow" />
          </Card>
          {MORE_FLOWS.map((flow) => (
            <Card raised style={s.block} key={flow.title}>
              <Txt variant="heading">{flow.title}</Txt>
              <Txt variant="small" tone="muted">
                {flow.intro}
              </Txt>
              <Flow steps={flow.steps} />
            </Card>
          ))}
          <Card raised style={s.block}>
            <Txt variant="heading">{t.workModes}</Txt>
            <View style={s.modes}>
              {WORK_MODES.map((mode) => (
                <View key={mode.title} style={s.mode}>
                  <Txt bold tone="olive">
                    {mode.title}
                  </Txt>
                  {mode.points.map((point) => (
                    <Txt key={point} variant="small" tone="muted">
                      {`• ${point}`}
                    </Txt>
                  ))}
                </View>
              ))}
            </View>
          </Card>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <TextInput
            testID="glossary-search"
            style={s.search}
            placeholder={t.search}
            placeholderTextColor={theme.c.muted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          {sections.length === 0 ? (
            <Txt tone="muted" style={s.empty}>
              {t.noResult}
            </Txt>
          ) : (
            sections.map((section) => (
              <Card key={section.key} style={s.block}>
                <Txt variant="label" tone="gold">
                  {section.title}
                </Txt>
                {section.entries.map((entry) => (
                  <View key={entry.term} style={s.row} testID={`glossary-term-${entry.term}`}>
                    <Txt bold style={s.term}>
                      {entry.term}
                    </Txt>
                    <Txt variant="small" style={s.flex}>
                      {entry.definition}
                    </Txt>
                  </View>
                ))}
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Flow({ steps, testID }: { steps: FlowStep[]; testID?: string }) {
  const s = useStyles();
  return (
    <View testID={testID}>
      {steps.map((step, i) => (
        <View key={step.label} style={s.step}>
          <View style={s.rail}>
            <View style={s.dot}>
              <Txt variant="caption" bold tone="onOlive">
                {String(i + 1)}
              </Txt>
            </View>
            {i < steps.length - 1 ? <View style={s.line} /> : null}
          </View>
          <View style={s.stepBody}>
            <View style={s.stepTop}>
              <Txt bold>{step.label}</Txt>
              <Txt variant="caption" tone="gold">
                {step.who}
              </Txt>
            </View>
            <Txt variant="small" tone="muted">
              {step.detail}
            </Txt>
          </View>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  tabs: { paddingHorizontal: th.space.lg, paddingTop: th.space.md },
  content: { padding: th.space.lg, gap: th.space.lg },
  block: { gap: th.space.sm },
  modes: { flexDirection: "row", gap: th.space.md, flexWrap: "wrap" },
  mode: { flex: 1, minWidth: 140, gap: 4 },
  search: {
    borderWidth: 1,
    borderColor: th.c.line,
    borderRadius: th.radius.md,
    backgroundColor: th.c.surface,
    color: th.c.ink,
    paddingHorizontal: th.space.md,
    paddingVertical: th.space.sm,
    fontFamily: th.fonts.body,
    fontSize: 15,
  },
  empty: { textAlign: "center" },
  row: { flexDirection: "row", gap: th.space.md, paddingVertical: 4 },
  term: { width: 96 },
  flex: { flex: 1 },
  step: { flexDirection: "row", gap: th.space.md },
  rail: { alignItems: "center", width: 26 },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: th.c.olive,
    alignItems: "center",
    justifyContent: "center",
  },
  line: { flex: 1, width: 2, backgroundColor: th.c.line, marginVertical: 2 },
  stepBody: { flex: 1, paddingBottom: th.space.md, gap: 2 },
  stepTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: th.space.sm },
}));
