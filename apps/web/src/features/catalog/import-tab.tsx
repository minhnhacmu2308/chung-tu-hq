"use client";
// Tab Nhập dữ liệu (spec §4, §6.4): chọn bộ mã (người phụ trách bộ hoặc Quản trị) → file .xlsx (đọc trên trình duyệt) → Ghép cột (mỗi cột → một
// trong 17 trường hoặc Bỏ qua; tự đoán theo tên / lần ghép trước của bộ – spec 2026-11-14 §4; bộ không phải nguồn gốc → bỏ cột thông tin mặt
// hàng, không gửi) + xem trước 5 dòng → xem trước lỗi theo dòng + chọn ĐVT Hải quan cho ĐVT lạ → nhập (file > 5.000 dòng chia nhiều lần nhập liên tiếp, tra tiến độ phần chạy
// nền) → tóm tắt mới / tự ghép / chờ duyệt / bỏ qua / lỗi + "Xem n mục chờ duyệt". "Lấy từ chứng từ đã đọc": tờ khai đã duyệt (người phụ trách
// bộ XNK mặc định hoặc Quản trị), hóa đơn / phiếu đóng gói (Quản trị). Giao diện chỉ ẩn nút – backend kiểm quyền thật.
import {
  CATALOG_IMPORT_MAX_ROWS_PER_REQUEST, isUnfilledLinkRow, itemUnitKey, validateItemRows, type CodeSet, type ImportFromDocumentsInput, type ItemColumnMap, type ItemImportRow,
} from "@kb/contracts";
import {
  Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Field, FileDropzone, fill, Grid, LoadingState, Progress, Select, SkeletonForm,
  Stack, StatCard, toast, useMessages, useUiLocale,
} from "@kb/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileStack, Inbox, ListChecks } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  catalogKeys, exportCrossReference, getCatalogImport, getCatalogSettings, importCatalogFromDocuments, importCatalogRows, listCatalogItems, listCodeSets,
} from "@/api/catalog";
import { LoadError } from "@/components/common/load-error";
import { formatNumber } from "@/lib/format";
import { errorText } from "@/lib/reason-codes";
import { saveBlob } from "@/lib/xlsx-download";
import { useCodeLists } from "../declaration-form/use-code-list";
import { useCatalogAccess } from "./catalog-access";
import { CATALOG_IMPORT_MESSAGES } from "./catalog.messages";
import { buildMappingTemplateXlsx, mappingTemplateRows, setTitle, type TargetAliasInfo } from "./catalog-xlsx";
import { effectiveColumnMap, missingRequired, recallColumnMap, saveColumnMap } from "./column-map";
import { ColumnMapper, MappedRowsPreview } from "./column-mapper";
import { CATALOG_MAPPING_MESSAGES } from "./column-mapping.messages";
import { MAPPING_TEMPLATE_MESSAGES } from "./mapping-template.messages";
import { ImportErrorTable, ImportPreview, type ImportErrorRow, type UnknownUnit } from "./import-preview";
import { JOB_FAILED, runImportInParts, waitForImports, type ImportProgress, type ImportRunResult } from "./import-run";
import { readFileBuffer, readItemWorkbook, toImportRows, type ItemSheet } from "./read-xlsx";

type Messages = (typeof CATALOG_IMPORT_MESSAGES)["vi"];
type Source = { name: string; sheet: ItemSheet };
/** Lần chạy đang hiện: tiến độ (khi đang chạy) hoặc kết quả. `rows`/`rowNumbers` để quy lỗi về dòng Excel + giá trị ô. */
type Run = {
  kind: "file" | "docs";
  setName: string | null;
  progress: ImportProgress;
  result: ImportRunResult | null;
  rows: readonly ItemImportRow[];
  rowNumbers: readonly number[];
};

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const TEMPLATE_PAGE = 200;
const valueOf = (row: ItemImportRow | undefined, field: string) => (row && field in row ? String(row[field as keyof ItemImportRow] ?? "") : "");

export function ImportTab() {
  const t = useMessages(CATALOG_IMPORT_MESSAGES);
  const tm = useMessages(CATALOG_MAPPING_MESSAGES);
  const tt = useMessages(MAPPING_TEMPLATE_MESSAGES);
  const locale = useUiLocale();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const codeSets = useQuery({ queryKey: catalogKeys.codeSets, queryFn: listCodeSets });
  const settings = useQuery({ queryKey: catalogKeys.settings, queryFn: getCatalogSettings });
  const sets = useMemo(() => codeSets.data ?? [], [codeSets.data]);
  const access = useCatalogAccess(sets);
  // Danh mục ĐVT Hải quan phải tải xong mới nhập được (để ĐVT lạ hiện ra và chọn được ĐVT tương ứng).
  const unitLists = useCodeLists(["UNIT"] as const);
  const unitList = unitLists.lists.UNIT;
  const knownUnits = useMemo(() => (unitList ? new Set(unitList.map((u) => itemUnitKey(u.code))) : undefined), [unitList]);

  const [setId, setSetId] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<"failed" | "empty" | null>(null);
  const [map, setMap] = useState<ItemColumnMap>({});
  const [remembered, setRemembered] = useState(false);
  const [unitMap, setUnitMap] = useState<Record<string, string>>({});
  const [run, setRun] = useState<Run | null>(null);
  const [templating, setTemplating] = useState(false);

  const manageable = sets.filter((s) => access.managesSet(s.id));
  // Như backend: chế độ dùng chung → bộ "Mã chung" (loại SHARED, ưu tiên bộ mặc định); chưa biết chế độ cũng ưu tiên bộ SHARED nếu có.
  const sharedSets = settings.data?.effectiveMode === "PER_DEPARTMENT" ? [] : manageable.filter((s) => s.kind === "SHARED");
  const sharedSet = sharedSets.find((s) => s.isDefault) ?? sharedSets[0];
  const chosenSetId = setId || sharedSet?.id || (manageable.length === 1 ? manageable[0]!.id : "");
  const defaultSet = sets.find((s) => s.isDefault);
  const canDeclarations = access.canContribute && !!defaultSet && access.managesSet(defaultSet.id);
  const canInvoices = access.isAdmin;
  const targetSet = sets.find((s) => s.id === chosenSetId);
  const sourceSet = sets.find((s) => s.isSource);
  // Bộ không phải nguồn gốc: cột thông tin mặt hàng bỏ qua – không đọc, không gửi (server cũng bỏ).
  const isSource = !!targetSet?.isSource;
  const sendMap = useMemo(() => effectiveColumnMap(map, isSource), [map, isSource]);

  // Dòng của file đối chiếu chưa điền mã (có Mã nối, trống Mã hàng) → bỏ qua, không báo lỗi; giữ số dòng Excel của các dòng còn lại.
  const mapped = useMemo(() => {
    if (!source) return { rows: [] as ItemImportRow[], rowNumbers: [] as number[], unfilled: 0 };
    const all = toImportRows(source.sheet, sendMap);
    const keep = all.flatMap((r, i) => (isUnfilledLinkRow(r) ? [] : [i]));
    return { rows: keep.map((i) => all[i]!), rowNumbers: keep.map((i) => source.sheet.rowNumbers[i] ?? i + 1), unfilled: all.length - keep.length };
  }, [source, sendMap]);
  const rawRows = mapped.rows;
  const unknownUnits = useMemo<UnknownUnit[]>(() => {
    if (!knownUnits) return [];
    const byKey = new Map<string, UnknownUnit>();
    for (const r of rawRows) {
      const key = r.unit ? itemUnitKey(r.unit) : "";
      if (!key || knownUnits.has(key)) continue;
      const u = byKey.get(key) ?? { key, unit: r.unit!, count: 0 };
      u.count += 1;
      byKey.set(key, u);
    }
    return [...byKey.values()];
  }, [rawRows, knownUnits]);
  const rows = useMemo(() => rawRows.map((r) => (r.unit && unitMap[itemUnitKey(r.unit)] ? { ...r, unit: unitMap[itemUnitKey(r.unit)]! } : r)), [rawRows, unitMap]);
  const mapReady = missingRequired(map).length === 0;
  const validation = useMemo(() => (mapReady ? validateItemRows(rows, knownUnits ? { knownUnits } : {}) : null), [mapReady, rows, knownUnits]);
  const rowNumbers = mapped.rowNumbers;
  const previewErrors: ImportErrorRow[] = (validation?.errors ?? []).map((e, i) => ({
    id: `${e.row}:${e.field}:${i}`, row: rowNumbers[e.row - 1] ?? e.row, field: e.field, code: e.code, value: valueOf(rows[e.row - 1], e.field),
  }));
  const badRows = new Set(validation?.errors.map((e) => e.row)).size;
  const parts = Math.ceil(rows.length / CATALOG_IMPORT_MAX_ROWS_PER_REQUEST);

  const reset = () => {
    setSource(null);
    setMap({});
    setRemembered(false);
    setUnitMap({});
    setReadError(null);
    setRun(null);
  };
  /** Ghép cột cho file theo bộ: lần ghép trước của bộ (theo tiêu đề cột), còn lại đoán theo tên. */
  const applyRecall = (codeSetId: string, sheet: ItemSheet) => {
    const r = codeSetId ? recallColumnMap(codeSetId, sheet.headers, sheet.detected) : { map: sheet.detected, remembered: false };
    setMap(r.map);
    setRemembered(r.remembered);
  };
  const onFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    reset();
    setReading(true);
    try {
      const sheet = await readItemWorkbook(await readFileBuffer(file));
      if (!sheet || !sheet.rows.length) setReadError("empty");
      else {
        setSource({ name: file.name, sheet });
        applyRecall(chosenSetId, sheet);
      }
    } catch {
      setReadError("failed");
    } finally {
      setReading(false);
    }
  };
  const progressTo = (p: ImportProgress) => setRun((r) => (r ? { ...r, progress: p } : r));
  const finish = (result: ImportRunResult) => {
    setRun((r) => (r ? { ...r, result } : r));
    void qc.invalidateQueries({ queryKey: catalogKeys.all });
  };

  const startImport = async () => {
    const set = sets.find((s) => s.id === chosenSetId);
    if (!source || !set || !mapReady) return;
    saveColumnMap(set.id, source.sheet.headers, map);
    setRun({ kind: "file", setName: setTitle(set, locale), progress: { part: 1, parts: Math.max(1, parts), percent: 0 }, result: null, rows, rowNumbers });
    const result = await runImportInParts(rows, { codeSetId: set.id, fileName: source.name.slice(0, 260), columnMap: sendMap }, { importRows: importCatalogRows, getImport: getCatalogImport }, progressTo);
    finish(result);
  };
  /** File đối chiếu cho bộ đang chọn: mọi mặt hàng (mã nối + cột tham khảo bộ nguồn gốc) + mã/tên/ĐVT/hệ số đã có ở bộ này. */
  const downloadTemplate = async () => {
    if (!targetSet) return;
    setTemplating(true);
    try {
      const ref = await exportCrossReference();
      const info = new Map<string, TargetAliasInfo>();
      for (let p = 1, seen = 0; ; p++) {
        const r = await listCatalogItems({ codeSetId: targetSet.id, status: "ACTIVE", page: p, pageSize: TEMPLATE_PAGE });
        for (const row of r.rows) if (row.setCode) info.set(row.itemNo, { name: row.setName, unit: row.setUnit });
        seen += r.rows.length;
        if (seen >= r.total || r.rows.length === 0) break;
      }
      const rows = mappingTemplateRows(ref, sourceSet?.id ?? null, targetSet.id, info);
      // Trong file: tên bộ ngắn (tiêu đề cột “Mã XNK (tham khảo)”), không kèm loại bộ.
      const names = { set: targetSet.name, source: sourceSet?.name ?? tm.noSource };
      saveBlob(await buildMappingTemplateXlsx(rows, names, locale), `${tt.file}-${targetSet.name}.xlsx`);
      toast({ tone: "success", title: tt.done });
    } catch (e) {
      toast({ tone: "danger", title: tt.failed, description: errorText(e, locale, tt.failed) });
    } finally {
      setTemplating(false);
    }
  };
  const pull = async (from: ImportFromDocumentsInput["source"]) => {
    reset();
    setRun({ kind: "docs", setName: null, progress: { part: 1, parts: 1, percent: 0 }, result: null, rows: [], rowNumbers: [] });
    try {
      const imports = await importCatalogFromDocuments({ source: from });
      if (!imports.length) {
        setRun(null);
        toast({ tone: "info", title: t.docsEmpty });
        return;
      }
      finish(await waitForImports(imports, { getImport: getCatalogImport }, progressTo));
    } catch (e) {
      finish({ imports: [], counts: { created: 0, matched: 0, queued: 0, skipped: 0, errors: 0 }, errors: [], failed: { part: 1, parts: 1, error: e } });
    }
  };

  if (codeSets.isError) return <LoadError onRetry={() => void codeSets.refetch()} title={t.loadError} />;
  if (codeSets.isLoading || !access.ready) return <SkeletonForm fields={3} />;
  if (!sets.length)
    return (
      <EmptyState
        icon={<FileSpreadsheet />}
        title={t.noSetsTitle}
        description={t.noSetsDescription}
        action={<Button onClick={() => router.replace(`${pathname}?tab=code-sets`, { scroll: false })}>{t.goCodeSets}</Button>}
      />
    );
  if (run) return <RunView t={t} run={run} sets={sets} onQueue={() => router.replace(`${pathname}?tab=queue`, { scroll: false })} onDone={reset} />;

  return (
    <Stack gap="lg">
      {manageable.length === 0 ? (
        <EmptyState icon={<FileSpreadsheet />} title={t.noManagedTitle} description={t.noManagedDescription} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t.title}</CardTitle>
            <CardDescription>{t.hint}</CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap="lg">
              <Field label={t.setLabel} required className="w-full cq-md:max-w-md">
                <Select
                  options={manageable.map((s) => ({ value: s.id, label: setTitle(s, locale) }))}
                  placeholder={t.setPlaceholder}
                  value={chosenSetId}
                  onChange={(e) => {
                    setSetId(e.target.value);
                    if (source) applyRecall(e.target.value, source.sheet);
                  }}
                />
              </Field>
              {!source && targetSet && !isSource && (
                <Alert
                  tone="info"
                  title={tt.title}
                  action={
                    <Button size="sm" variant="secondary" leftIcon={<Download className="h-4 w-4" />} loading={templating} disabled={templating} onClick={() => void downloadTemplate()}>
                      {tt.button}
                    </Button>
                  }
                >
                  {fill(tt.hint, { set: setTitle(targetSet, locale), source: sourceSet ? setTitle(sourceSet, locale) : tm.noSource })}
                </Alert>
              )}
              {!source && (
                <Stack gap="sm">
                  <FileDropzone accept=".xlsx" multiple={false} maxSize={MAX_FILE_BYTES} disabled={!chosenSetId || reading} onFiles={(f) => void onFiles(f)} />
                  <p className="text-sm text-fg-muted">{t.hsTip}</p>
                  {reading && <LoadingState size="sm" title={t.reading} />}
                  {readError && <Alert tone="danger">{readError === "empty" ? t.fileEmpty : t.readFailed}</Alert>}
                </Stack>
              )}
              {source && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="min-w-0 break-words text-sm text-fg">{fill(t.fileInfo, { file: source.name, sheet: source.sheet.sheetName, n: formatNumber(source.sheet.rows.length) })}</p>
                    <Button variant="secondary" size="sm" onClick={reset}>{t.chooseOther}</Button>
                  </div>
                  <Stack gap="sm">
                    <h3 className="font-semibold text-fg">{t.mapTitle}</h3>
                    <ColumnMapper
                      headers={source.sheet.headers}
                      map={map}
                      onChange={(next) => {
                        setMap(next);
                        setRemembered(false);
                      }}
                      isSource={isSource}
                      setName={targetSet ? setTitle(targetSet, locale) : ""}
                      sourceName={sourceSet ? setTitle(sourceSet, locale) : null}
                      remembered={remembered}
                    />
                    <p className="text-sm text-fg-muted">{t.hsTip}</p>
                  </Stack>
                  {mapped.unfilled > 0 && <Alert tone="info">{fill(tt.skipped, { n: formatNumber(mapped.unfilled) })}</Alert>}
                  {mapReady && (
                    <Stack gap="sm">
                      <h3 className="font-semibold text-fg">{tm.previewTitle}</h3>
                      <MappedRowsPreview rows={rows} rowNumbers={rowNumbers} map={sendMap} />
                    </Stack>
                  )}
                  <Stack gap="sm">
                    <h3 className="font-semibold text-fg">{t.previewTitle}</h3>
                    {validation ? (
                      <ImportPreview
                        ok={validation.ok.length}
                        bad={badRows}
                        unknownUnits={unknownUnits}
                        unitMap={unitMap}
                        onUnitMap={(key, code) => setUnitMap(({ [key]: _, ...rest }) => (code ? { ...rest, [key]: code } : rest))}
                        errors={previewErrors}
                      />
                    ) : (
                      <Alert tone="info">{t.mapMissing}</Alert>
                    )}
                  </Stack>
                  {parts > 1 && <Alert tone="info">{fill(t.partsNote, { n: formatNumber(rows.length), parts, max: formatNumber(CATALOG_IMPORT_MAX_ROWS_PER_REQUEST) })}</Alert>}
                  {!knownUnits && unitLists.error && (
                    <Alert tone="danger" action={<Button size="sm" variant="secondary" onClick={unitLists.retry}>{t.retry}</Button>}>{t.unitsLoadError}</Alert>
                  )}
                  {!knownUnits && !unitLists.error && <LoadingState size="sm" title={t.unitsLoading} />}
                  <div className="flex flex-wrap justify-end gap-3">
                    <Button
                      leftIcon={<FileSpreadsheet className="h-4 w-4" />}
                      disabled={!chosenSetId || !knownUnits || !validation || validation.ok.length === 0}
                      onClick={() => void startImport()}
                    >
                      {badRows
                        ? fill(t.importButtonWithErrors, { n: formatNumber(validation?.ok.length ?? 0), m: formatNumber(badRows) })
                        : fill(t.importButton, { n: formatNumber(validation?.ok.length ?? 0) })}
                    </Button>
                  </div>
                </>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}
      {(canDeclarations || canInvoices) && (
        <Card>
          <CardHeader>
            <CardTitle>{t.docsTitle}</CardTitle>
            <CardDescription>{t.docsHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <Grid cols={{ base: 1, md: 2 }} gap="md">
              {canDeclarations && defaultSet && (
                <DocsSource title={t.docsDeclarations} hint={fill(t.docsDeclarationsHint, { set: setTitle(defaultSet, locale) })} icon={<FileStack className="h-4 w-4" />} onClick={() => void pull("DECLARATIONS")} />
              )}
              {canInvoices && <DocsSource title={t.docsInvoices} hint={t.docsInvoicesHint} icon={<Inbox className="h-4 w-4" />} onClick={() => void pull("INVOICES")} />}
            </Grid>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

function DocsSource({ title, hint, icon, onClick }: { title: string; hint: string; icon: ReactNode; onClick: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="secondary" leftIcon={icon} onClick={onClick}>{title}</Button>
      <p className="text-sm text-fg-muted">{hint}</p>
    </div>
  );
}

function RunView({ t, run, sets, onQueue, onDone }: { t: Messages; run: Run; sets: readonly CodeSet[]; onQueue: () => void; onDone: () => void }) {
  const locale = useUiLocale();
  const { result, progress } = run;
  if (!result) {
    const label = run.kind === "docs" ? t.runningDocs : progress.parts > 1 ? fill(t.runningPart, { part: progress.part, parts: progress.parts }) : t.running;
    return (
      <Card>
        <CardContent className="pt-6">
          <Progress value={progress.percent} label={label} showValue aria-label={t.progressLabel} />
        </CardContent>
      </Card>
    );
  }
  const { counts, failed } = result;
  const excelRow = (index: number | undefined) => (index === undefined ? 0 : (run.rowNumbers[index] ?? index + 1));
  // Lấy từ chứng từ: mỗi bộ đối tác một lần nhập, số dòng đánh lại từ 1 → ghi bộ mã (kèm loại) cạnh từng lỗi và liệt kê các bộ đã nhận.
  const setOfImport = new Map(result.imports.map((i) => [i.id, sets.find((s) => s.id === i.codeSetId)]));
  const groupOf = (importId: string | undefined) => {
    const set = importId ? setOfImport.get(importId) : undefined;
    return set ? setTitle(set, locale) : undefined;
  };
  const errors: ImportErrorRow[] = result.errors.map((e, i) => {
    const group = run.kind === "docs" ? groupOf(e.importId) : undefined;
    return {
      id: `${e.importId ?? ""}:${e.index}:${e.field}:${i}`, row: excelRow(e.index), field: e.field, code: e.code, value: valueOf(run.rows[e.index], e.field),
      ...(group ? { group } : {}),
    };
  });
  const docsSets = run.kind === "docs" ? [...new Set(result.imports.map((i) => groupOf(i.id)).filter((x): x is string => !!x))].join(", ") : "";
  const setName = run.setName ?? docsSets;
  const reason = failed ? (failed.error === JOB_FAILED ? t.jobFailed : errorText(failed.error, locale, t.importFailed)) : "";
  const title = failed && !result.imports.length ? t.importFailed : run.kind === "docs" ? t.summaryDocsTitle : t.summaryTitle;
  const stats: [string, number][] = [
    [t.statCreated, counts.created], [t.statMatched, counts.matched], [t.statQueued, counts.queued], [t.statSkipped, counts.skipped], [t.statErrors, counts.errors],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {setName && <CardDescription>{fill(t.summaryInto, { set: setName })}</CardDescription>}
      </CardHeader>
      <CardContent>
        <Stack gap="lg">
          {failed && (
            <Alert tone="danger">
              <p>
                {run.kind === "file" && failed.fromIndex !== undefined
                  ? fill(t.partFailed, { part: failed.part, parts: failed.parts, from: excelRow(failed.fromIndex), to: excelRow(failed.toIndex), reason })
                  : fill(t.docsFailed, { reason })}
              </p>
              {failed.part > 1 && <p>{t.partFailedBefore}</p>}
            </Alert>
          )}
          <Grid cols={{ base: 2, md: 3 }} gap="md">
            {stats.map(([label, value]) => (
              <StatCard key={label} label={label} value={value} />
            ))}
          </Grid>
          {errors.length > 0 && <ImportErrorTable rows={errors} />}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={onDone}>{run.kind === "file" ? t.importAnother : t.close}</Button>
            {counts.queued > 0 && (
              <Button leftIcon={<ListChecks className="h-4 w-4" />} onClick={onQueue}>
                {fill(t.viewQueue, { n: formatNumber(counts.queued) })}
              </Button>
            )}
          </div>
        </Stack>
      </CardContent>
    </Card>
  );
}
