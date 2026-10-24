"use client";
// Bước ② Sửa nội dung: mỗi dòng đã chọn là một khối thu gọn; trong khối, bảng so sánh Trước (tờ khai gốc, chỉ đọc) | Sau (sửa được) theo từng chỉ tiêu.
// Tiền thuế Sau tự tính lại (applyAmaLineEdit); ô Sau khác Trước được đánh dấu "đã đổi". Mô tả/xuất xứ và thuế – thu khác nằm trong khối thu gọn.
import { Badge, Button, Card, CardContent, Disclosure, fill, Grid, Input, Stack, toast, useMessages, useUiLocale } from "@kb/ui";
import {
  AMA_COMPUTED_KEYS, AMA_LINE_LAYOUT, AMA_OTHER_TAX_SLOTS, amaLineDelta, amaLineLocked, LINE_LOCK_REASON, parseDec, type PostAmendmentLine,
} from "@kb/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Calculator, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { postAmendmentKeys, removePostAmendmentLine, updatePostAmendmentField } from "@/api/post-amendment";
import { formatMoney, formatNumber } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { AmendLockProvider, type FieldLockLookup } from "../declaration-form/amend-context";
import { BlockView } from "../declaration-form/block-view";
import { CodeInput } from "../declaration-form/code-input";
import { conditionContext } from "../declaration-form/form-state";
import { ViewPrefsProvider } from "../declaration-form/view-prefs";
import { StickyActionBar } from "../dossier-detail/steps/declaration-parts";
import type { AmaStepCtx } from "./ama-context";
import { AMA_MESSAGES } from "./ama.messages";
import { amaChangeSummary, applyEdits, changedKeys, importCompareRows, lineSaves, otherCompareRows, otherSlotsInUse, type CompareRow } from "./ama-wizard";

type Edits = Record<string, Record<string, string>>;

/** Số hiển thị theo định dạng chung, giữ tối đa 4 chữ số thập phân; không phải số thì để nguyên. */
function shown(v: string | undefined, numeric: boolean | undefined): string {
  const t = (v ?? "").trim();
  if (!t) return "—";
  if (!numeric || !parseDec(t)) return t;
  return formatNumber(t, Math.min(4, t.split(".")[1]?.length ?? 0));
}
const signed = (v: string | null) => (v === null ? null : `${v.startsWith("-") ? "−" : "+"}${formatMoney(v.replace("-", ""), undefined, 0)}`);

export function EditLines({ ctx, onDirtyChange }: { ctx: AmaStepCtx; onDirtyChange: (n: number) => void }) {
  const { a, editable } = ctx;
  const qc = useQueryClient();
  const t = useMessages(AMA_MESSAGES);
  const [edits, setEdits] = useState<Edits>({});
  const dirty = Object.values(edits).reduce((n, e) => n + Object.keys(e).length, 0);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const drafts = a.lines.map((l) => applyEdits(l, edits[l.id] ?? {}));
  const summary = amaChangeSummary({ ...a, lines: drafts });
  const change = (lineId: string, key: string, value: string) => setEdits((e) => ({ ...e, [lineId]: { ...e[lineId], [key]: value } }));

  const save = useMutation({
    mutationFn: async () => {
      // Gửi giá trị người khai nhập ("" = bỏ sửa tay) – máy chủ tự tính lại như ở đây.
      const saves = lineSaves(edits, a.lines.map((l) => l.id));
      for (const { lineId, key, value } of saves) await updatePostAmendmentField(ctx.dossierId, { lineId, key, value });
      // Chờ dữ liệu mới về rồi mới bỏ nháp – không thì ô vừa lưu chớp về giá trị cũ một nhịp.
      await qc.refetchQueries({ queryKey: postAmendmentKeys.view(ctx.dossierId) });
      return saves.length;
    },
    onSuccess: (n) => {
      toast({ tone: "success", title: fill(t.savedChanges, { n: formatNumber(n) }) });
      setEdits({});
    },
    onError: toastMutationError(t.saveLinesFailed),
    onSettled: ctx.refresh,
  });
  const remove = useMutation({
    mutationFn: (lineId: string) => removePostAmendmentLine(ctx.dossierId, lineId),
    onSuccess: (_d, lineId) => {
      setEdits(({ [lineId]: _, ...rest }) => rest);
      toast({ tone: "success", title: t.removed });
      ctx.refresh();
    },
    onError: toastMutationError(t.removeFailed),
  });

  return (
    <ViewPrefsProvider>
      <Stack gap="md">
        {drafts.map((d, i) => (
          <LineCard
            key={d.id}
            kind={ctx.kind}
            line={d}
            defaultOpen={i === 0}
            editable={editable}
            onChange={(k, v) => change(d.id, k, v)}
            onRemove={() => remove.mutate(d.id)}
            removing={remove.isPending && remove.variables === d.id}
          />
        ))}
        <Card>
          <CardContent className="flex flex-wrap items-baseline justify-between gap-2 pt-5">
            <p className="text-sm text-fg-muted">
              {t.totalTaxLabel} {formatMoney(summary.taxBefore, "VND", 0)} → <span className="font-medium text-fg">{formatMoney(summary.taxAfter, "VND", 0)}</span>
            </p>
            <p className="text-sm font-semibold tabular-nums text-fg">{signed(summary.taxDelta)} VND</p>
          </CardContent>
        </Card>
      </Stack>

      <StickyActionBar>
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-xs text-fg-muted">{fill(t.linesChanged, { l: formatNumber(summary.lines), c: formatNumber(summary.changed) })}</p>
          {dirty > 0 && <p className="text-sm font-medium text-warning-subtle-fg">{fill(t.unsavedN, { n: formatNumber(dirty) })}</p>}
        </div>
        {dirty > 0 ? (
          <>
            <Button variant="ghost" leftIcon={<Undo2 className="h-4 w-4" />} disabled={save.isPending} onClick={() => setEdits({})}>
              {t.undo}
            </Button>
            <Button leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate()}>
              {fill(t.saveN, { n: formatNumber(dirty) })}
            </Button>
          </>
        ) : (
          <>
            {editable && (
              <Button variant="ghost" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => ctx.goSub("pick")}>
                {t.pickMore}
              </Button>
            )}
            <Button rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => ctx.goSub("reason")}>
              {t.nextReason}
            </Button>
          </>
        )}
      </StickyActionBar>
    </ViewPrefsProvider>
  );
}

type LineCardProps = {
  kind: "IDA" | "EDA";
  line: PostAmendmentLine;
  defaultOpen: boolean;
  editable: boolean;
  onChange: (key: string, value: string) => void;
  onRemove: () => void;
  removing: boolean;
};

function LineCard({ kind, line, defaultOpen, editable, onChange, onRemove, removing }: LineCardProps) {
  const t = useMessages(AMA_MESSAGES);
  const locale = useUiLocale();
  const v = line.values;
  const changed = new Set(changedKeys(line));
  const delta = amaLineDelta(v);
  const [extraSlots, setExtraSlots] = useState(0);
  const inUse = otherSlotsInUse(v);
  const slots = [...inUse, ...AMA_OTHER_TAX_SLOTS.filter((n) => !inUse.includes(n)).slice(0, extraSlots)].sort((x, y) => x - y);
  const descChanged = ["HAG_CMA", "HAG_ORA", "APP_MA_HANG_SAU"].some((k) => changed.has(k));
  const lock: FieldLockLookup = (key) =>
    !editable ? { basis: "SOFTWARE", reason: "" } : amaLineLocked(key) ? { basis: "SOFTWARE", reason: key === "HAG_RAN" || key.startsWith("HAG_C") || key.startsWith("HAG_OR") ? LINE_LOCK_REASON : "" } : null;
  const ran = v["HAG_RAN"] ?? String(line.ran);
  const desc = (v["HAG_CMA"] || v["HAG_CMB"] || "").trim();

  const rows = (list: CompareRow[], deltaOf: (r: CompareRow) => string | null) =>
    list.map((r) => <CompareRowView key={r.after} kind={kind} row={r} line={line} changed={changed.has(r.after)} delta={r.computed ? deltaOf(r) : null} editable={editable} onChange={onChange} />);

  return (
    <Disclosure
      defaultOpen={defaultOpen}
      title={
        <span className="flex min-w-0 flex-col">
          <span>{fill(t.lineN, { n: ran })}</span>
          {desc && <span className="truncate text-xs font-normal text-fg-muted">{desc}</span>}
        </span>
      }
      meta={changed.size > 0 ? <Badge tone="info">{fill(t.cellsChanged, { n: formatNumber(changed.size) })}</Badge> : <Badge tone="neutral">{t.unchanged}</Badge>}
      {...(editable
        ? {
            actions: (
              <Button size="sm" variant="ghost" leftIcon={<Trash2 className="h-4 w-4" />} loading={removing} onClick={onRemove} aria-label={fill(t.removeLineAria, { n: ran })}>
                <span className="cq-max-sm:sr-only">{t.removeLine}</span>
              </Button>
            ),
          }
        : {})}
    >
      <Stack gap="md">
        <div className="@container">
          <Grid cols={{ base: 1, md: 3 }} gap="sm" aria-hidden="true" className="hidden border-b border-border pb-2 text-xs font-medium text-fg-muted cq-md:grid">
            <span>{t.colField}</span>
            <span>{t.colBefore}</span>
            <span>{t.colAfter}</span>
          </Grid>
          {rows(importCompareRows(locale), () => signed(delta.importTax))}
        </div>

        <Disclosure title={t.descGroup} defaultOpen={descChanged} {...(descChanged ? { meta: <Badge tone="info">{t.changedBadge}</Badge> } : {})}>
          <AmendLockProvider kind={kind} values={v} active={false} override={lock}>
            {AMA_LINE_LAYOUT.map((b) => (
              <BlockView key={b.id} kind={kind} block={b} values={v} onChange={editable ? onChange : undefined} ctx={conditionContext(kind, v)} showInapplicable={false} showActions={false} />
            ))}
          </AmendLockProvider>
        </Disclosure>

        <Disclosure title={t.taxGroup} meta={slots.length ? <Badge tone="neutral">{fill(t.kindsN, { n: formatNumber(slots.length) })}</Badge> : <span>{t.none}</span>} defaultOpen={slots.some((n) => otherCompareRows(n).some((r) => changed.has(r.after)))}>
          <Stack gap="md">
            {slots.map((n) => (
              <div key={n} className="@container">
                <p className="mb-1 text-sm font-medium text-fg">{fill(t.taxGroupN, { n })}</p>
                {rows(otherCompareRows(n), () => signed(delta.other.find((o) => o.slot === n)?.amount ?? null))}
              </div>
            ))}
            {editable && slots.length < AMA_OTHER_TAX_SLOTS.length && (
              <div>
                <Button size="sm" variant="ghost" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setExtraSlots((s) => s + 1)}>
                  {t.addTax}
                </Button>
              </div>
            )}
          </Stack>
        </Disclosure>
      </Stack>
    </Disclosure>
  );
}

type RowProps = {
  kind: "IDA" | "EDA";
  row: CompareRow;
  line: PostAmendmentLine;
  changed: boolean;
  delta: string | null;
  editable: boolean;
  onChange: (key: string, value: string) => void;
};

/** Một hàng: tên chỉ tiêu · Trước · Sau. Màn hẹp xếp dọc: tên, "Trước: …", rồi ô Sau. */
function CompareRowView({ kind, row, line, changed, delta, editable, onChange }: RowProps) {
  const t = useMessages(AMA_MESSAGES);
  const v = line.values;
  const value = v[row.after] ?? "";
  const manual = row.computed && line.manual.includes(row.after) && AMA_COMPUTED_KEYS.has(row.after);
  const aria = fill(t.afterAria, { label: row.label });
  const control = !editable ? (
    <p className="text-sm font-medium text-fg">{shown(value, row.numeric)}</p>
  ) : row.codeTable ? (
    <CodeInput table={row.codeTable} fieldKey={row.after} kind={kind} values={v} value={value} onChange={(x) => onChange(row.after, x)} label={row.label} ariaLabel={aria} />
  ) : (
    <Input className="w-full cq-md:max-w-xs" aria-label={aria} inputMode={row.numeric ? "decimal" : undefined} value={value} onChange={(e) => onChange(row.after, e.currentTarget.value)} />
  );
  return (
    <Grid cols={{ base: 1, md: 3 }} gap="sm" className="items-start border-b border-border py-2 last:border-b-0">
      <p className="text-sm font-medium text-fg">{row.label}</p>
      <p className="text-sm text-fg-muted">
        <span className="cq-md:hidden">{t.beforePrefix}</span>
        {shown(v[row.before], row.numeric)}
      </p>
      <div className="flex min-w-0 flex-col gap-1">
        {control}
        {(changed || row.computed) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            {changed && <Badge tone="info">{t.changedBadge}</Badge>}
            {row.computed && !manual && <span>{t.autoCalc}</span>}
            {manual && (
              <>
                <span>{t.manual}</span>
                {editable && (
                  <Button size="sm" variant="ghost" leftIcon={<Calculator className="h-4 w-4" />} onClick={() => onChange(row.after, "")}>
                    {t.recalc}
                  </Button>
                )}
              </>
            )}
            {delta && <span className="font-medium tabular-nums text-fg">{delta}</span>}
          </div>
        )}
      </div>
    </Grid>
  );
}
