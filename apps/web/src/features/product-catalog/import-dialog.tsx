"use client";
import { Alert, Button, Dialog, DialogContent, DialogFooter, FileDropzone, fill, Progress, Spinner, Stack, toast, useMessages, useUiLocale } from "@kb/ui";
import { useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { importProducts, productKeys } from "@/api/products";
import { errorText } from "@/lib/reason-codes";
import { REQUIRED_COLUMN_HEADERS } from "./import-columns.vi";
import { chunks, parseCatalogWorkbook, type ParsedCatalog } from "./import-xlsx";
import { formatHs } from "./format";
import { PRODUCT_IMPORT_MESSAGES } from "./product-catalog.messages";

const SHOWN = 5;
type State =
  | { step: "pick"; error?: string }
  | { step: "reading" }
  | { step: "preview"; parsed: ParsedCatalog }
  | { step: "importing"; parsed: ParsedCatalog; done: number }
  | { step: "failed"; parsed: ParsedCatalog; done: number; error: string };

/** Import bảng kê dòng hàng (Excel): đọc + gộp ngay trên trình duyệt, xem trước, rồi gửi từng lô 500 mặt hàng. */
export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useMessages(PRODUCT_IMPORT_MESSAGES);
  const locale = useUiLocale();
  const qc = useQueryClient();
  const [state, setState] = useState<State>({ step: "pick" });
  const busy = state.step === "reading" || state.step === "importing";

  const close = (o: boolean) => {
    if (busy) return;
    onOpenChange(o);
    if (!o) setState({ step: "pick" });
  };

  const read = async (file: File) => {
    setState({ step: "reading" });
    try {
      const parsed = await parseCatalogWorkbook(await file.arrayBuffer());
      if (parsed.missingColumns.length) {
        setState({ step: "pick", error: fill(t.missingColumns, { cols: parsed.missingColumns.map((c) => REQUIRED_COLUMN_HEADERS[c as keyof typeof REQUIRED_COLUMN_HEADERS] ?? c).join(", ") }) });
        return;
      }
      setState({ step: "preview", parsed });
    } catch {
      setState({ step: "pick", error: t.readFailed });
    }
  };

  const run = async (parsed: ParsedCatalog) => {
    let done = 0;
    let created = 0;
    let updated = 0;
    setState({ step: "importing", parsed, done });
    try {
      for (const items of chunks(parsed.items)) {
        const r = await importProducts({ items });
        created += r.created;
        updated += r.updated;
        done += items.length;
        setState({ step: "importing", parsed, done });
      }
      toast({ tone: "success", title: fill(t.done, { created, updated }) });
      onOpenChange(false);
      setState({ step: "pick" });
    } catch (e) {
      setState({ step: "failed", parsed, done, error: errorText(e, locale, t.failed) });
    } finally {
      void qc.invalidateQueries({ queryKey: productKeys.all });
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title={t.title}
        icon={<FileSpreadsheet className="h-4 w-4" />}
        description={fill(t.desc, { nameCol: REQUIRED_COLUMN_HEADERS.name, hsCol: REQUIRED_COLUMN_HEADERS.hsCode })}
        size="lg"
      >
        <Stack gap="md">
          {state.step === "pick" && (
            <>
              {state.error && <Alert tone="danger">{state.error}</Alert>}
              <FileDropzone
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                multiple={false}
                maxSize={20 * 1024 * 1024}
                labels={{ title: t.dropTitle }}
                onFiles={(files) => files[0] && void read(files[0])}
              />
            </>
          )}
          {state.step === "reading" && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-fg-muted" role="status">
              <Spinner />
              {t.reading}
            </div>
          )}
          {(state.step === "preview" || state.step === "importing" || state.step === "failed") && <Preview parsed={state.parsed} />}
          {state.step === "importing" && (
            <Progress value={state.done} max={state.parsed.items.length} label={fill(t.importing, { done: state.done, total: state.parsed.items.length })} showValue />
          )}
          {state.step === "failed" && (
            <Alert tone="danger" title={t.failed}>
              {state.error}
              {state.done > 0 && <> · {fill(t.partial, { done: state.done, total: state.parsed.items.length })}</>}
            </Alert>
          )}
        </Stack>
        <DialogFooter>
          {state.step === "pick" || state.step === "reading" ? (
            <Button variant="ghost" onClick={() => close(false)} disabled={busy}>{t.cancel}</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setState({ step: "pick" })} disabled={busy}>{t.chooseOther}</Button>
              <Button loading={state.step === "importing"} disabled={!state.parsed.items.length} onClick={() => void run(state.parsed)}>
                {fill(t.start, { n: state.parsed.items.length })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Preview({ parsed }: { parsed: ParsedCatalog }) {
  const t = useMessages(PRODUCT_IMPORT_MESSAGES);
  const issueText = (i: ParsedCatalog["issues"][number]) => fill(i.reason === "missingName" ? t.issueMissingName : t.issueInvalidHs, { row: i.row });
  return (
    <Stack gap="sm">
      <Alert tone="info" title={fill(t.summary, { rows: parsed.rows, items: parsed.items.length })}>{t.summaryHint}</Alert>
      {parsed.conflicts.length > 0 && (
        <Alert tone="warning" title={fill(t.conflictsTitle, { n: parsed.conflicts.length })}>
          <ul className="flex flex-col gap-1">
            {parsed.conflicts.slice(0, SHOWN).map((c) => (
              <li key={c.name} className="min-w-0">
                <span className="font-mono">{c.hsCodes.map(formatHs).join(" / ")}</span> · {c.name}
              </li>
            ))}
            {parsed.conflicts.length > SHOWN && <li>{fill(t.more, { n: parsed.conflicts.length - SHOWN })}</li>}
          </ul>
        </Alert>
      )}
      {parsed.issues.length > 0 && (
        <Alert tone="warning" title={fill(t.issuesTitle, { n: parsed.issues.length })}>
          <ul className="flex flex-col gap-1">
            {parsed.issues.slice(0, SHOWN).map((i) => <li key={i.row}>{issueText(i)}</li>)}
            {parsed.issues.length > SHOWN && <li>{fill(t.more, { n: parsed.issues.length - SHOWN })}</li>}
          </ul>
        </Alert>
      )}
    </Stack>
  );
}
