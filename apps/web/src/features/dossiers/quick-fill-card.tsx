"use client";
// Điền nhanh form Tạo hồ sơ (ADR 0010): "Nhờ AI điền" theo câu yêu cầu (model rẻ, chỉ gợi ý – không tạo hồ sơ) hoặc sao chép thông tin form từ hồ sơ cũ.
import {
  Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Combobox, Dialog, DialogContent, DialogFooter, Field, fill, Stack, Textarea, useMessages, useUiLocale,
} from "@kb/ui";
import { useMutation } from "@tanstack/react-query";
import { Copy, Sparkles } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { draftDossier, type Dossier, type DossierDraft } from "@/api/dossiers";
import { LoadError } from "@/components/common/load-error";
import { errorText } from "@/lib/reason-codes";
import { draftFromDossier } from "./apply-draft";
import { QUICK_FILL_MESSAGES } from "./quick-fill.messages";

type Outcome = { n: number; from?: string; byAi: boolean } | null;

export function QuickFillCard({ dossiers, loading, failed = false, onRetry = () => {}, onApply }: {
  dossiers: readonly Dossier[] | undefined;
  /** Tải danh sách hồ sơ lỗi – hộp sao chép báo lỗi thay vì "chưa có hồ sơ". */
  failed?: boolean;
  /** Tải lại danh sách hồ sơ (nút Thử lại trong hộp sao chép). */
  onRetry?: () => void;
  loading: boolean;
  /** Ghi gợi ý vào form, trả số ô đã điền. */
  onApply: (draft: DossierDraft) => number;
}) {
  const t = useMessages(QUICK_FILL_MESSAGES);
  const locale = useUiLocale();
  const [prompt, setPrompt] = useState("");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  const ai = useMutation({
    mutationFn: () => draftDossier({ prompt: prompt.trim() }),
    onMutate: () => setOutcome(null),
    onSuccess: (d) => setOutcome({ n: onApply(d), byAi: true, ...(d.fromDossier ? { from: d.fromDossier.code } : {}) }),
  });

  const copyFrom = (d: Dossier) => {
    ai.reset();
    setOutcome({ n: onApply(draftFromDossier(d)), from: d.code, byAi: false });
    setCopyOpen(false);
  };

  const run = () => {
    if (prompt.trim().length >= 3 && !ai.isPending) ai.mutate();
  };
  const submitPrompt = (e: FormEvent) => {
    e.preventDefault();
    run();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submitPrompt}>
          <Stack gap="md">
            <Field label={t.promptLabel} hint={t.promptHint}>
              <Textarea
                rows={2}
                value={prompt}
                maxLength={1000}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  // Enter gửi luôn (Shift+Enter xuống dòng) – yêu cầu thường chỉ một câu.
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    run();
                  }
                }}
                placeholder={t.promptPlaceholder}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" leftIcon={<Sparkles className="h-4 w-4" />} loading={ai.isPending} disabled={prompt.trim().length < 3}>
                {t.aiFill}
              </Button>
              <Button type="button" variant="secondary" leftIcon={<Copy className="h-4 w-4" />} onClick={() => setCopyOpen(true)}>
                {t.copy}
              </Button>
            </div>
            {ai.isError && <Alert tone="danger" title={t.aiFailed}>{errorText(ai.error, locale)}</Alert>}
            {outcome && outcome.n > 0 && (
              <Alert tone="success" title={outcome.from ? fill(t.filledFrom, { n: outcome.n, code: outcome.from }) : fill(t.filledByAi, { n: outcome.n })}>
                {t.filledHint}
              </Alert>
            )}
            {outcome && outcome.n === 0 && <Alert tone="warning" title={t.nothingFilled}>{t.nothingFilledHint}</Alert>}
          </Stack>
        </form>
      </CardContent>
      <CopyDialog open={copyOpen} onOpenChange={setCopyOpen} dossiers={dossiers} loading={loading} failed={failed} onRetry={onRetry} onPick={copyFrom} />
    </Card>
  );
}

function CopyDialog({ open, onOpenChange, dossiers, loading, failed, onRetry, onPick }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dossiers: readonly Dossier[] | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onPick: (d: Dossier) => void;
}) {
  const t = useMessages(QUICK_FILL_MESSAGES);
  const [id, setId] = useState<string | null>(null);
  // Mã hồ sơ · đối tác · loại hình – dữ liệu nghiệp vụ, không dịch.
  const options = useMemo(() => (dossiers ?? []).map((d) => ({ value: d.id, label: `${d.code} · ${d.partner} · ${d.typeCode}` })), [dossiers]);
  const picked = dossiers?.find((d) => d.id === id);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setId(null); onOpenChange(o); }}>
      <DialogContent title={t.copyTitle} icon={<Copy className="h-4 w-4" />} description={t.copyDescription} size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (picked) {
              onPick(picked);
              setId(null);
            }
          }}
        >
          {failed ? (
            <LoadError onRetry={onRetry} />
          ) : (
            <Field label={t.dossierLabel} required>
              <Combobox options={options} value={id} onChange={setId} loading={loading} placeholder={t.dossierPlaceholder} emptyText={t.noDossiers} />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
            <Button type="submit" disabled={!picked}>{t.apply}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
