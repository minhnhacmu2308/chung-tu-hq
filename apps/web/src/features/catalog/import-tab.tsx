"use client";
// Tab Nhập dữ liệu (spec §4, §6.4): chọn bộ mã (người phụ trách bộ hoặc Quản trị) → file .xlsx (đọc trên trình duyệt) → ghép cột (tự nhận theo
// tên) → xem trước lỗi theo dòng + chọn ĐVT Hải quan cho ĐVT lạ → nhập (file > 5.000 dòng chia nhiều lần nhập liên tiếp, tra tiến độ phần chạy
// nền) → tóm tắt mới / tự ghép / chờ duyệt / bỏ qua / lỗi + "Xem n mục chờ duyệt". "Lấy từ chứng từ đã đọc": tờ khai đã duyệt (người phụ trách
// bộ XNK mặc định hoặc Quản trị), hóa đơn / phiếu đóng gói (Quản trị). Giao diện chỉ ẩn nút – backend kiểm quyền thật.
import {
  CATALOG_IMPORT_MAX_ROWS_PER_REQUEST, itemUnitKey, validateItemRows, type CodeSet, type ImportFromDocumentsInput, type ItemColumnMap, type ItemImportRow,
} from "@kb/contracts";
import {
  Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Field, FileDropzone, fill, Grid, LoadingState, Progress, Select, SkeletonForm,
  Stack, StatCard, toast, useMessages, useUiLocale,
} from "@kb/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, FileStack, Inbox, ListChecks } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { catalogKeys, getCatalogImport, getCatalogSettings, importCatalogFromDocuments, importCatalogRows, listCodeSets } from "@/api/catalog";
import { LoadError } from "@/components/common/load-error";
import { formatNumber } from "@/lib/format";
import { errorText } from "@/lib/reason-codes";
import { useCodeLists } from "../declaration-form/use-code-list";
import { useCatalogAccess } from "./catalog-access";
import { CATALOG_IMPORT_MESSAGES } from "./catalog.messages";
import { setTitle } from "./catalog-xlsx";
import { ColumnMapper } from "./column-mapper";
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
const valueOf = (row: ItemImportRow | undefined, field: string) => (row && field in row ? String(row[field as keyof ItemImportRow] ?? "") : "");

export function ImportTab() {
  const t = useMessages(CATALOG_IMPORT_MESSAGES);
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
  const [unitMap, setUnitMap] = useState<Record<string, string>>({});
  const [run, setRun] = useState<Run | null>(null);

  const manageable = sets.filter((s) => access.managesSet(s.id));
  // Như backend: chế độ dùng chung → bộ "Mã chung" (loại SHARED, ưu tiên bộ mặc định); chưa biết chế độ cũng ưu tiên bộ SHARED nếu có.
  const sharedSets = settings.data?.effectiveMode === "PER_DEPARTMENT" ? [] : manageable.filter((s) => s.kind === "SHARED");
  const sharedSet = sharedSets.find((s) => s.isDefault) ?? sharedSets[0];
  const chosenSetId = setId || sharedSet?.id || (manageable.length === 1 ? manageable[0]!.id : "");
  const defaultSet = sets.find((s) => s.isDefault);
  const canDeclarations = access.canContribute && !!defaultSet && access.managesSet(defaultSet.id);
  const canInvoices = access.isAdmin;

  const rawRows = useMemo(() => (source ? toImportRows(source.sheet, map) : []), [source, map]);
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
  const mapReady = map.code !== undefined && map.name !== undefined;
  const validation = useMemo(() => (mapReady ? validateItemRows(rows, knownUnits ? { knownUnits } : {}) : null), [mapReady, rows, knownUnits]);
  const rowNumbers = source?.sheet.rowNumbers ?? [];
  const previewErrors: ImportErrorRow[] = (validation?.errors ?? []).map((e, i) => ({
    id: `${e.row}:${e.field}:${i}`, row: rowNumbers[e.row - 1] ?? e.row, field: e.field, code: e.code, value: valueOf(rows[e.row - 1], e.field),
  }));
  const badRows = new Set(validation?.errors.map((e) => e.row)).size;
  const parts = Math.ceil(rows.length / CATALOG_IMPORT_MAX_ROWS_PER_REQUEST);

  const reset = () => {
    setSource(null);
    setMap({});
    setUnitMap({});
    setReadError(null);
    setRun(null);
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
        setMap(sheet.detected);
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
    setRun({ kind: "file", setName: setTitle(set, locale), progress: { part: 1, parts: Math.max(1, parts), percent: 0 }, result: null, rows, rowNumbers });
    const result = await runImportInParts(rows, { codeSetId: set.id, fileName: source.name.slice(0, 260), columnMap: map }, { importRows: importCatalogRows, getImport: getCatalogImport }, progressTo);
    finish(result);
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
                <Select options={manageable.map((s) => ({ value: s.id, label: setTitle(s, locale) }))} placeholder={t.setPlaceholder} value={chosenSetId} onChange={(e) => setSetId(e.target.value)} />
              </Field>
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
                    <p className="text-sm text-fg-muted">{t.mapHint}</p>
                    <ColumnMapper headers={source.sheet.headers} map={map} onChange={setMap} />
                    <p className="text-sm text-fg-muted">{t.hsTip}</p>
                  </Stack>
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
