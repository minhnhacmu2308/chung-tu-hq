"use client";
// Bộ lọc của một hộp thư: chỉ lấy email từ người gửi / tên miền đã biết, từ khóa chứng từ (có sẵn + của doanh nghiệp),
// bỏ email quảng cáo theo từ loại trừ, chọn loại file. Lưu → có hiệu lực từ lần lấy thư tới (tùy chọn quét lại 30 ngày).
import {
  DEFAULT_MAIL_FILTERS, INBOX_FILE_EXTENSIONS, INBOX_FIRST_SYNC_DAYS, MailFiltersSchema, type MailConnection, type MailFilters, type MailKeywordMode, type MailKeywordScope,
} from "@kb/contracts";
import { Alert, Button, Checkbox, Dialog, DialogClose, DialogContent, DialogFooter, Field, fill, RadioGroup, Stack, Textarea, toast, useMessages } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Filter } from "lucide-react";
import { useEffect, useState } from "react";
import { mailboxKeys, updateMailFilters } from "@/api/mailbox";
import { MAIL_FILTERS_MESSAGES } from "./mail-filters-dialog.messages";

type Ext = (typeof INBOX_FILE_EXTENSIONS)[number];
type Draft = { senders: string; keywordMode: MailKeywordMode; keywords: string; keywordScope: MailKeywordScope; excludeKeywords: string; extensions: Ext[]; rescan: boolean };

/** Mỗi dòng một mục; chấp nhận cả dấu phẩy / chấm phẩy; bỏ dòng trống, bỏ trùng. */
export const splitList = (s: string) => [...new Set(s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean))];
const joinList = (xs: readonly string[]) => xs.join("\n");
const toDraft = (f: MailFilters): Draft => ({
  senders: joinList(f.senders), keywordMode: f.keywordMode, keywords: joinList(f.keywords), keywordScope: f.keywordScope, excludeKeywords: joinList(f.excludeKeywords),
  extensions: [...f.extensions], rescan: false,
});

/** Tóm tắt bộ lọc một dòng cho danh sách hộp thư; null = đang dùng mặc định. */
export function useFiltersSummary(f: MailFilters): string | null {
  const t = useMessages(MAIL_FILTERS_MESSAGES);
  const parts: string[] = [];
  if (f.senders.length) parts.push(fill(t.sumSenders, { n: f.senders.length }));
  if (f.keywordMode === "CUSTOM") parts.push(fill(t.sumCustom, { n: f.keywords.length }));
  else if (f.keywordMode === "OFF") parts.push(t.sumNoKeywords);
  else if (f.keywords.length) parts.push(fill(t.sumExtra, { n: f.keywords.length }));
  if (f.keywordMode !== "OFF" && f.keywordScope === "SUBJECT") parts.push(t.sumSubjectOnly);
  if (f.excludeKeywords.length) parts.push(fill(t.sumExclude, { n: f.excludeKeywords.length }));
  if (f.extensions.length < INBOX_FILE_EXTENSIONS.length) parts.push(f.extensions.map((e) => e.toUpperCase()).join(", "));
  return parts.length ? parts.join(" · ") : null;
}

export function MailFiltersDialog({ connection, onOpenChange }: { connection: MailConnection | null; onOpenChange: (open: boolean) => void }) {
  const t = useMessages(MAIL_FILTERS_MESSAGES);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(DEFAULT_MAIL_FILTERS));
  const [errors, setErrors] = useState<Partial<Record<"senders" | "keywords" | "excludeKeywords" | "extensions", string>>>({});
  useEffect(() => {
    if (connection) {
      setDraft(toDraft(connection.filters));
      setErrors({});
    }
  }, [connection]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = useMutation({
    mutationFn: (input: { filters: MailFilters; rescan: boolean }) => updateMailFilters(connection!.id, input),
    onSuccess: (_r, input) => {
      void qc.invalidateQueries({ queryKey: mailboxKeys.overview });
      toast({ tone: "success", title: fill(t.saved, { email: connection?.email ?? "" }), description: input.rescan ? fill(t.savedRescan, { days: INBOX_FIRST_SYNC_DAYS }) : t.savedNext });
      onOpenChange(false);
    },
  });

  function submit() {
    const candidate = {
      senders: splitList(draft.senders), keywordMode: draft.keywordMode, keywords: splitList(draft.keywords), keywordScope: draft.keywordScope,
      excludeKeywords: splitList(draft.excludeKeywords), extensions: draft.extensions,
    };
    const parsed = MailFiltersSchema.safeParse(candidate);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "senders") next.senders = fill(t.errSender, { value: String(candidate.senders[Number(issue.path[1])] ?? "") });
        else if (key === "keywords") next.keywords = draft.keywordMode === "CUSTOM" && !candidate.keywords.length ? t.errCustomEmpty : t.errTerm;
        else if (key === "excludeKeywords") next.excludeKeywords = t.errTerm;
        else if (key === "extensions") next.extensions = t.errExtensions;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate({ filters: parsed.data, rescan: draft.rescan });
  }

  const toggleExt = (e: Ext, on: boolean) => set("extensions", on ? INBOX_FILE_EXTENSIONS.filter((x) => x === e || draft.extensions.includes(x)) : draft.extensions.filter((x) => x !== e));

  return (
    <Dialog open={connection !== null} onOpenChange={onOpenChange}>
      <DialogContent title={t.title} description={connection ? fill(t.description, { email: connection.email }) : undefined} icon={<Filter className="h-4 w-4" />}>
        {/* noValidate: kiểm bằng MailFiltersSchema, báo lỗi ngay tại ô (thay cho bong bóng của trình duyệt). */}
        <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Stack gap="md">
            <Field label={t.senders} hint={t.sendersHint} error={errors.senders}>
              {/* kb-allow-raw: ví dụ địa chỉ email / tên miền (không dịch) */}
              <Textarea rows={3} value={draft.senders} placeholder={"ops@forwarder.vn\n@nhacungcap.com"} onChange={(e) => set("senders", e.target.value)} />
            </Field>

            <RadioGroup<MailKeywordMode>
              label={t.keywordMode}
              value={draft.keywordMode}
              onChange={(v) => set("keywordMode", v)}
              options={[
                { value: "DEFAULT", label: t.modeDefault, description: t.modeDefaultHint },
                { value: "CUSTOM", label: t.modeCustom, description: t.modeCustomHint },
                { value: "OFF", label: t.modeOff, description: t.modeOffHint },
              ]}
            />
            {draft.keywordMode !== "OFF" && (
              <>
                <Field label={draft.keywordMode === "CUSTOM" ? t.keywordsCustom : t.keywordsExtra} hint={t.keywordsHint} error={errors.keywords} required={draft.keywordMode === "CUSTOM"}>
                  {/* kb-allow-raw: ví dụ từ khóa chứng từ (không dịch) */}
                  <Textarea rows={3} value={draft.keywords} placeholder={"PO\nlệnh giao hàng\ndebit note"} onChange={(e) => set("keywords", e.target.value)} />
                </Field>
                <RadioGroup<MailKeywordScope>
                  label={t.scope}
                  orientation="horizontal"
                  value={draft.keywordScope}
                  onChange={(v) => set("keywordScope", v)}
                  options={[
                    { value: "SUBJECT", label: t.scopeSubject },
                    { value: "ALL", label: t.scopeAll },
                  ]}
                />
              </>
            )}

            <Field label={t.exclude} hint={t.excludeHint} error={errors.excludeKeywords}>
              {/* kb-allow-raw: ví dụ từ loại trừ (không dịch) */}
              <Textarea rows={2} value={draft.excludeKeywords} placeholder={"newsletter\nkhuyến mãi"} onChange={(e) => set("excludeKeywords", e.target.value)} />
            </Field>

            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="text-sm font-medium text-fg">{t.extensions}</legend>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                {INBOX_FILE_EXTENSIONS.map((e) => (
                  <Checkbox key={e} label={e.toUpperCase()} checked={draft.extensions.includes(e)} onChange={(ev) => toggleExt(e, ev.target.checked)} />
                ))}
              </div>
              {errors.extensions && <p className="text-xs text-danger">{errors.extensions}</p>}
            </fieldset>

            <Checkbox label={fill(t.rescan, { days: INBOX_FIRST_SYNC_DAYS })} checked={draft.rescan} onChange={(e) => set("rescan", e.target.checked)} />

            {save.isError && <Alert tone="danger">{save.error.message}</Alert>}
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDraft(toDraft(DEFAULT_MAIL_FILTERS))}>{t.reset}</Button>
            <DialogClose asChild>
              <Button type="button" variant="ghost">{t.cancel}</Button>
            </DialogClose>
            <Button type="submit" loading={save.isPending}>{t.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
