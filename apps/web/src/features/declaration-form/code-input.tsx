"use client";
// Ô mã có tra cứu danh mục VNACCS: màn chính chỉ hiện mã, tên mã hiện khi rê chuột / đặt con trỏ vào ô.
// Danh mục ngắn → danh sách thả xuống có ô lọc (Combobox); danh mục dài → gõ mã trực tiếp + nút tra cứu mở popup (DataTable tìm không dấu).
import { Alert, Button, Checkbox, cn, Combobox, createDataTableColumnHelper, DataTable, Dialog, DialogContent, fill, Input, SkeletonTable, Stack, Tooltip, useMessages, useUiLocale } from "@kb/ui";
import { CODE_LIST_META, codeListFor, type CodeListEntry, type CodeTable } from "@kb/contracts";
import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { codeName, codeScope, lookupMode, scopedEntries, type CodeScope } from "./code-scope";
import { FORM_MESSAGES } from "./form.messages";
import type { FormValues } from "./form-state";
import { LoadError } from "@/components/common/load-error";
import { formatNumber } from "@/lib/format";
import type { CodeListState } from "./code-list-cache";
import { useCodeListState } from "./use-code-list";

type Props = {
  table: CodeTable;
  fieldKey: string;
  kind: "IDA" | "EDA";
  /** Giá trị tờ khai – xét phạm vi lọc (cơ quan Hải quan, nhập/xuất). */
  values: FormValues;
  value: string;
  onChange: (value: string) => void;
  /** Tên chỉ tiêu – tiêu đề popup, nhãn nút tra cứu. */
  label: string;
  /** Ô trong bảng nhóm lặp (không có Field bao) – tên truy cập riêng. */
  ariaLabel?: string;
  /** Bề rộng ô mã (lớp token). */
  widthClass?: string;
};

const col = createDataTableColumnHelper<CodeListEntry>();

/** Popup tra cứu: bấm vào dòng là chọn, đóng bằng nút ✕ của popup (không có thao tác nào cần thanh nút ở đáy). */
function LookupDialog({ label, state, onRetry, scope, title, hasParent, parentLabel, oldCodes, inactiveCount, onPick }: {
  label: string; state: CodeListState | undefined; onRetry: () => void; scope: CodeScope | null; title: string; hasParent: boolean; parentLabel: string | undefined;
  oldCodes: boolean; inactiveCount: number; onPick: (code: string) => void;
}) {
  const t = useMessages(FORM_MESSAGES);
  const [all, setAll] = useState(false);
  const [inactive, setInactive] = useState(false);
  const entries = state?.status === "ready" ? state.list : null;
  const data = useMemo(() => (entries ? scopedEntries(entries, scope, { all, inactive }) : []), [entries, scope, all, inactive]);
  const columns = useMemo(
    () => col.columns([
      col.accessor("code", { header: t.colCode, cell: (c) => <span className="font-mono">{c.getValue()}</span> }),
      col.accessor("name", { header: t.colName, meta: { wrap: true } }),
      col.accessor((e) => e.note ?? "", { id: "note", header: t.colNote, meta: { wrap: true }, cell: (c) => <span className="text-fg-muted">{c.getValue()}</span> }),
      ...(hasParent ? [col.accessor((e) => e.parent ?? "", { id: "parent", header: parentLabel ?? t.colParent })] : []),
    ]),
    [hasParent, parentLabel, t],
  );
  return (
    <DialogContent title={fill(t.lookupTitle, { label })} icon={<Search className="h-4 w-4" />} description={`${title}${entries ? fill(t.lookupCount, { n: formatNumber(data.length) }) : ""}${t.lookupHint}`} size="lg">
      <Stack gap="sm">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {scope?.optional && <Checkbox label={fill(t.onlyShow, { scope: scope.label })} checked={!all} onChange={() => setAll((a) => !a)} />}
          {inactiveCount > 0 && <Checkbox label={t.showInactive} checked={inactive} onChange={() => setInactive((v) => !v)} />}
        </div>
        {oldCodes && (
          <Alert tone="warning" title={t.oldCodesTitle}>
            {t.oldCodesBody}
          </Alert>
        )}
        {state?.status === "error" ? <LoadError title={t.loadListError} onRetry={onRetry} />
        : !entries ? <SkeletonTable rows={6} cols={3} />
        : <DataTable aria-label={fill(t.listAria, { title })} columns={columns} data={data} getRowId={(e) => `${e.parent ?? ""}|${e.code}`} searchable pagination={{ mode: "client", initialPageSize: 10 }} onRowClick={(e) => onPick(e.code)} />}
      </Stack>
    </DialogContent>
  );
}

export function CodeInput({ table, fieldKey, kind, values, value, onChange, label, ariaLabel, widthClass = "w-32" }: Props) {
  const t = useMessages(FORM_MESSAGES);
  const locale = useUiLocale();
  const id = codeListFor(table)!;
  const meta = CODE_LIST_META[id];
  const { state, retry } = useCodeListState(id);
  const list = state?.status === "ready" ? state.list : null;
  const [open, setOpen] = useState(false);
  const nameId = useId();
  const office = values["TK_CH"] ?? "";
  // Phạm vi chỉ phụ thuộc cơ quan Hải quan / loại tờ khai – giữ nguyên giữa các lần gõ để không lọc lại hàng chục nghìn mã.
  const scope = useMemo(() => codeScope(id, fieldKey, kind, { TK_CH: office }, locale), [id, fieldKey, kind, office, locale]);
  const entries = useMemo(() => (list ? scopedEntries(list, scope, { all: false, inactive: false }) : []), [list, scope]);
  const name = list ? codeName(list, value, scope) : undefined;

  if (list && lookupMode(entries, scope) === "dropdown") {
    // Giá trị đang có mà không nằm trong danh mục (vd "C&F" cách viết cũ) vẫn giữ để không mất dữ liệu.
    // Mô tả = tên + ghi chú (hướng dẫn dùng mã, tên đầy đủ…): gọn một dòng khi đóng, bấm “Mở rộng” trong danh sách để đọc hết.
    const options = entries.map((e) => ({ value: e.code, label: e.code, description: e.note ? `${e.name} – ${e.note}` : e.name }));
    if (value && !options.some((o) => o.value === value)) options.unshift({ value, label: value, description: t.notInList });
    return (
      <Combobox
        // Tối thiểu w-32: đủ chỗ cho mã + nút mở + nút xóa, không bị cắt chữ.
        className={cn(widthClass === "w-24" || widthClass === "w-28" ? "w-32" : widthClass, "shrink-0")}
        options={options}
        value={value || null}
        onChange={(v) => onChange(v ?? "")}
        clearable
        expandable
        placeholder={t.pickCode}
        labels={{ search: t.searchCode }}
        {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
      />
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Tooltip content={name ?? (value ? t.notInList : t.typeOrLookup)}>
        <Input className={cn(widthClass, "shrink-0")} value={value} onChange={(e) => onChange(e.currentTarget.value.toUpperCase())} aria-describedby={name ? nameId : undefined} {...(ariaLabel ? { "aria-label": ariaLabel } : {})} />
      </Tooltip>
      {name && <span id={nameId} className="sr-only">{name}</span>}
      <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-fg-muted" aria-label={fill(t.lookupAria, { label })} onClick={() => setOpen(true)}>
        <Search className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <LookupDialog
            label={label} state={state} onRetry={retry} scope={scope} title={meta.title} hasParent={meta.hasParent} parentLabel={meta.parentLabel}
            oldCodes={Boolean(meta.usesOldOfficeCodes)} inactiveCount={meta.inactive}
            onPick={(code) => { onChange(code); setOpen(false); }}
          />
        )}
      </Dialog>
    </div>
  );
}
