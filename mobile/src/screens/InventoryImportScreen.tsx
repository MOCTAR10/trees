import { FileSpreadsheet, Printer, Upload } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from "react-native";

import {
  confirmInventory,
  FellingAacOption,
  getInventoryModel,
  InventoryFile,
  InventoryImportRecord,
  InventoryModel,
  InventoryPreview,
  InventoryPreviewRow,
  InventoryRefusal,
  listFellingAacOptions,
  listInventoryImports,
  previewInventory,
} from "../api/client";
import { dec, frDate } from "../design/format";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, Card, EmptyState, Pill, PillTone, ScreenHeader, Stat, Txt } from "../design/ui";
import { fr } from "../i18n/fr";
import {
  exportInventoryPlatesPdf,
  exportInventoryTemplate,
  INVENTORY_TEMPLATE_TYPES,
  sharePdf,
  shareFile,
} from "../pdf";

const t = fr.inventory;
const PAGE = 50;
/** The inventory comes before the authorization: only these stop an import (art. 62). */
const IMPORT_BLOCKERS = new Set(["aac_not_held", "aac_closed", "title_not_exploitable"]);
const LEVEL_TONE: Record<InventoryPreviewRow["level"], PillTone> = { ok: "ok", warning: "warn", error: "risk" };

interface Props {
  onBack: () => void;
  initialAacId?: number | null;
  /** Test hook: replaces the browser file picker. */
  pickFile?: () => Promise<InventoryFile | null>;
}

function browserPick(): Promise<InventoryFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, blob: file } : null);
    };
    input.click();
  });
}

export default function InventoryImportScreen({ onBack, initialAacId, pickFile }: Props) {
  const s = useStyles();
  const theme = useTheme();
  const canUpload = Platform.OS === "web" || pickFile != null;
  const [aacOptions, setAacOptions] = React.useState<FellingAacOption[] | null>(null);
  const [aacId, setAacId] = React.useState<number | null>(initialAacId ?? null);
  const [model, setModel] = React.useState<InventoryModel | null>(null);
  const [guideOpen, setGuideOpen] = React.useState(false);
  const [file, setFile] = React.useState<InventoryFile | null>(null);
  const [preview, setPreview] = React.useState<InventoryPreview | null>(null);
  const [done, setDone] = React.useState<InventoryPreview | null>(null);
  const [busy, setBusy] = React.useState<"preview" | "import" | "plates" | "xlsx" | "csv" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [shown, setShown] = React.useState(PAGE);
  const [history, setHistory] = React.useState<InventoryImportRecord[]>([]);

  const loadHistory = React.useCallback(() => {
    listInventoryImports()
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  React.useEffect(() => {
    listFellingAacOptions()
      .then(setAacOptions)
      .catch(() => setAacOptions([]));
    getInventoryModel()
      .then(setModel)
      .catch(() => setModel(null));
    loadHistory();
  }, [loadHistory]);

  const selected = aacOptions?.find((a) => a.id === aacId) ?? null;
  const blocker = selected?.blocker && IMPORT_BLOCKERS.has(selected.blocker) ? selected.blocker : null;

  const reset = () => {
    setFile(null);
    setPreview(null);
    setDone(null);
    setError(null);
    setShown(PAGE);
  };

  const check = async (picked: InventoryFile) => {
    if (!selected) return;
    setBusy("preview");
    setError(null);
    setPreview(null);
    setDone(null);
    setShown(PAGE);
    try {
      setPreview(await previewInventory(selected.id, picked));
    } catch (err) {
      console.error("inventory preview failed", err);
      setError(err instanceof InventoryRefusal ? err.message : t.error);
    } finally {
      setBusy(null);
    }
  };

  const choose = async () => {
    const picked = await (pickFile ?? browserPick)();
    if (!picked) return;
    setFile(picked);
    await check(picked);
  };

  const confirm = async () => {
    if (!selected || !file) return;
    setBusy("import");
    setError(null);
    try {
      setDone(await confirmInventory(selected.id, file));
      setPreview(null);
      loadHistory();
    } catch (err) {
      console.error("inventory import failed", err);
      setError(err instanceof InventoryRefusal ? err.message : t.error);
    } finally {
      setBusy(null);
    }
  };

  const plates = async (importId: number) => {
    setBusy("plates");
    try {
      await sharePdf(await exportInventoryPlatesPdf(importId));
    } catch (err) {
      console.error("inventory plates failed", err);
      setError(t.error);
    } finally {
      setBusy(null);
    }
  };

  const template = async (format: "xlsx" | "csv") => {
    setBusy(format);
    try {
      await shareFile(await exportInventoryTemplate(format), INVENTORY_TEMPLATE_TYPES[format]);
    } catch (err) {
      console.error("inventory template failed", err);
      setError(t.error);
    } finally {
      setBusy(null);
    }
  };

  const toReview = preview ? [...preview.rows.filter((r) => r.level === "error"), ...preview.rows.filter((r) => r.level === "warning")] : [];

  return (
    <View style={s.container}>
      <ScreenHeader eyebrow={t.eyebrow} title={t.title} onBack={onBack} backLabel={fr.capture.back} />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Txt variant="small" tone="muted">
          {t.intro}
        </Txt>

        <Txt variant="label" tone="olive" style={s.step}>
          {t.stepAac}
        </Txt>
        <Txt variant="small" tone="muted">
          {t.aacHint}
        </Txt>
        {aacOptions == null ? (
          <ActivityIndicator color={theme.c.olive} />
        ) : aacOptions.length === 0 ? (
          <EmptyState message={t.aacNone} />
        ) : (
          <View style={s.grid}>
            {aacOptions.map((a) => {
              const on = a.id === aacId;
              const blocked = a.blocker && IMPORT_BLOCKERS.has(a.blocker);
              return (
                <Pressable
                  key={a.id}
                  testID={`inventory-aac-${a.id}`}
                  onPress={() => {
                    setAacId(a.id);
                    reset();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[s.option, on && s.optionOn]}
                >
                  <View style={s.rowBetween}>
                    <Txt variant="body" bold style={s.flex1}>
                      {a.label}
                    </Txt>
                    <Pill label={blocked ? t.aacBlocked : t.aacReady} tone={blocked ? "risk" : "ok"} />
                  </View>
                  <Txt variant="small" tone="muted">
                    {[a.ufa_label, a.title_reference, a.campaign_year].filter(Boolean).join(" · ")}
                  </Txt>
                  {blocked ? (
                    <Txt variant="small" tone="risk">
                      {fr.felling.blockers[a.blocker as string] ?? a.blocker}
                    </Txt>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}

        <Txt variant="label" tone="olive" style={s.step}>
          {t.stepGuide}
        </Txt>
        <Card testID="inventory-guide">
          {model ? (
            <>
              <Txt variant="small">{model.help}</Txt>
              <Txt variant="caption" tone="muted">
                {`${t.limits(model.max_rows, model.max_file_mb)} ${t.version(model.version)}`}
              </Txt>
            </>
          ) : null}
          <View style={s.actions}>
            <Button
              compact
              variant="secondary"
              label={busy === "xlsx" ? t.templateBusy : t.templateXlsx}
              loading={busy === "xlsx"}
              icon={<FileSpreadsheet size={18} color={theme.c.olive} />}
              onPress={() => void template("xlsx")}
              testID="inventory-template-xlsx"
            />
            <Button
              compact
              variant="secondary"
              label={busy === "csv" ? t.templateBusy : t.templateCsv}
              loading={busy === "csv"}
              onPress={() => void template("csv")}
              testID="inventory-template-csv"
            />
            {model ? (
              <Button
                compact
                variant="ghost"
                label={guideOpen ? t.guideHide : t.guideShow}
                onPress={() => setGuideOpen((v) => !v)}
                testID="inventory-guide-toggle"
              />
            ) : null}
          </View>
          {guideOpen && model
            ? model.columns.map((c) => (
                <View key={c.key} style={s.column} testID={`inventory-column-${c.key}`}>
                  <View style={s.rowBetween}>
                    <Txt variant="body" bold style={s.flex1}>
                      {c.key}
                    </Txt>
                    <Pill label={c.required ? t.required : t.optional} tone={c.required ? "info" : "neutral"} />
                  </View>
                  <Txt variant="small">{c.help}</Txt>
                  <Txt variant="caption" tone="muted">
                    {[`${t.format} : ${c.kind}`, `${t.example} : ${c.example}`, c.values.length ? `${t.values} : ${c.values.join(", ")}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </Txt>
                  <Txt variant="caption" tone="olive">
                    {`${t.legal} : ${c.legal}`}
                  </Txt>
                </View>
              ))
            : null}
        </Card>

        <Txt variant="label" tone="olive" style={s.step}>
          {t.stepFile}
        </Txt>
        {!canUpload ? (
          <Card testID="inventory-web-only">
            <Txt variant="small">{t.webOnly}</Txt>
          </Card>
        ) : (
          <Button
            label={file ? t.changeFile : t.pickFile}
            variant={file ? "secondary" : "primary"}
            icon={<Upload size={18} color={file ? theme.c.olive : theme.c.onOlive} />}
            disabled={!selected || !!blocker || busy != null}
            loading={busy === "preview"}
            onPress={() => void choose()}
            testID="inventory-pick"
          />
        )}
        {busy === "preview" ? (
          <Txt variant="small" tone="muted">
            {t.checking}
          </Txt>
        ) : null}
        {error ? (
          <Txt variant="body" tone="risk" testID="inventory-error">
            {error}
          </Txt>
        ) : null}

        {preview ? (
          <View style={s.section} testID="inventory-preview">
            <Txt variant="small" tone="muted">
              {`${preview.file_name} · ${preview.aac.label}`}
            </Txt>
            <View style={s.stats}>
              <Stat compact value={String(preview.summary.rows)} label={t.summaryRows} />
              <Stat compact value={String(preview.summary.ok)} label={t.summaryOk} tone="ok" />
              <Stat compact value={String(preview.summary.warnings)} label={t.summaryWarnings} tone="warn" />
              <Stat compact value={String(preview.summary.errors)} label={t.summaryErrors} tone="risk" testID="inventory-errors" />
              <Stat compact value={String(preview.summary.to_fell)} label={t.summaryToFell} />
              <Stat compact value={String(preview.summary.kept)} label={t.summaryKept} />
            </View>
            {preview.file_issues.length ? (
              <Card>
                <Txt variant="label" tone="olive">
                  {t.fileIssues}
                </Txt>
                {preview.file_issues.map((i) => (
                  <Txt key={i.code} variant="small" tone="warn">
                    {i.detail ? `${i.label} : ${i.detail}` : i.label}
                  </Txt>
                ))}
              </Card>
            ) : null}
            {toReview.length === 0 ? (
              <Card>
                <Txt variant="body" tone="ok" bold testID="inventory-all-clear">
                  {t.allClear}
                </Txt>
              </Card>
            ) : (
              <>
                <Txt variant="label" tone="olive">
                  {`${t.rowsTitle} (${toReview.length})`}
                </Txt>
                {toReview.slice(0, shown).map((r) => (
                  <Card key={r.line} testID={`inventory-row-${r.line}`}>
                    <View style={s.rowBetween}>
                      <Txt variant="body" bold style={s.flex1}>
                        {`${t.line(r.line)} · ${r.tree_code ?? t.generated}`}
                      </Txt>
                      <Pill label={r.level === "error" ? t.summaryErrors : t.summaryWarnings} tone={LEVEL_TONE[r.level]} />
                    </View>
                    <Txt variant="small" tone="muted">
                      {[
                        r.scientific_name ?? r.essence,
                        r.dhp_cm != null ? `DHP ${dec(r.dhp_cm)} cm` : null,
                        r.dme_cm != null ? `DME ${dec(r.dme_cm, 0)} cm` : null,
                        r.destination ? t.destination[r.destination] : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Txt>
                    <View style={s.pills}>
                      {r.issues.map((i) => (
                        <Pill key={`${i.code}-${i.column}`} label={i.label} tone={i.level === "error" ? "risk" : "warn"} />
                      ))}
                    </View>
                  </Card>
                ))}
                {toReview.length > shown ? (
                  <Button
                    variant="ghost"
                    label={t.showMore(Math.min(PAGE, toReview.length - shown))}
                    onPress={() => setShown((n) => n + PAGE)}
                  />
                ) : null}
              </>
            )}

            <Txt variant="label" tone="olive" style={s.step}>
              {t.stepConfirm}
            </Txt>
            {preview.can_confirm ? (
              <>
                {preview.summary.warnings ? (
                  <Txt variant="small" tone="muted">
                    {t.warningsNote}
                  </Txt>
                ) : null}
                <Button
                  label={t.confirm(preview.summary.rows)}
                  loading={busy === "import"}
                  disabled={busy != null}
                  onPress={() => void confirm()}
                  testID="inventory-confirm"
                />
              </>
            ) : (
              <Txt variant="body" tone="risk" testID="inventory-blocked">
                {t.errorsBlock(preview.summary.errors)}
              </Txt>
            )}
          </View>
        ) : null}

        {done?.import ? (
          <Card testID="inventory-done">
            <Txt variant="heading" tone="ok">
              {t.confirmed(done.import.stems_created)}
            </Txt>
            <Txt variant="small" tone="muted">
              {t.confirmedHint}
            </Txt>
            <View style={s.actions}>
              <Button
                compact
                label={busy === "plates" ? t.platesBusy : t.plates}
                loading={busy === "plates"}
                icon={<Printer size={18} color={theme.c.onOlive} />}
                onPress={() => void plates(done.import!.id)}
                testID="inventory-plates"
              />
              <Button compact variant="secondary" label={t.another} onPress={reset} testID="inventory-another" />
            </View>
          </Card>
        ) : null}

        <Txt variant="label" tone="olive" style={s.step}>
          {t.history}
        </Txt>
        {history.length === 0 ? (
          <EmptyState message={t.historyEmpty} />
        ) : (
          history.map((h) => (
            <Card key={h.id} testID={`inventory-import-${h.id}`}>
              <View style={s.rowBetween}>
                <Txt variant="body" bold style={s.flex1}>
                  {h.file_name}
                </Txt>
                <Txt variant="small" tone="muted">
                  {frDate(h.created_at)}
                </Txt>
              </View>
              <Txt variant="small">{`${h.aac_label ?? "—"} · ${t.importLine(h.stems_created, h.kept_count)}`}</Txt>
              <Txt variant="caption" tone="muted">
                {t.by(h.imported_by_name ?? h.imported_by_email ?? "—", frDate(h.created_at))}
              </Txt>
              <Button
                compact
                variant="secondary"
                label={t.plates}
                disabled={busy != null}
                onPress={() => void plates(h.id)}
                testID={`inventory-import-plates-${h.id}`}
                style={s.start}
              />
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  container: { flex: 1, backgroundColor: th.c.bg },
  body: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl, width: "100%", maxWidth: 960, alignSelf: "center" },
  step: { marginTop: th.space.md },
  section: { gap: th.space.md },
  flex1: { flex: 1 },
  start: { alignSelf: "flex-start" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: th.space.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: th.space.sm },
  option: {
    flexGrow: 1,
    flexBasis: 260,
    backgroundColor: th.c.surface,
    borderRadius: th.radius.lg,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.lg,
    gap: th.space.xs,
  },
  optionOn: { borderColor: th.c.olive, borderWidth: 2, backgroundColor: th.c.surface2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: th.space.sm },
  column: { borderTopWidth: 1, borderTopColor: th.c.line, paddingTop: th.space.sm, gap: 2 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: th.space.sm },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: th.space.xs },
}));
