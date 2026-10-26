"use client";
// Hộp xác nhận khi khai IDA/EDA mà còn gợi ý HYS chưa khai (spec §3.3, H2): khai HYS trước, hoặc vẫn khai (gọi lại với hysWaived).
import { Badge, Button, Dialog, DialogContent, DialogFooter, fill, Stack, useMessages } from "@kb/ui";
import type { HysProcedureCode, HysSuggestion } from "@kb/contracts";
import { Paperclip, Send } from "lucide-react";
import { HYS_MESSAGES, HYS_PROCEDURE_MESSAGES } from "./hys.messages";

export type HysSuggestDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: readonly HysSuggestion[];
  /** Nghiệp vụ đang khai (IDA/EDA) – hiện trong lời nhắc. */
  op: string;
  pending?: boolean;
  onDeclareHys: (code: HysProcedureCode) => void;
  onProceed: () => void;
};

/** Lý do gợi ý theo luật G1–G5 (dịch theo ngôn ngữ). */
export function useRuleText() {
  const t = useMessages(HYS_MESSAGES);
  return (s: HysSuggestion) => fill(t[`rule${s.rule}`], { field: s.fieldNo });
}

export function HysSuggestDialog({ open, onOpenChange, suggestions, op, pending = false, onDeclareHys, onProceed }: HysSuggestDialogProps) {
  const t = useMessages(HYS_MESSAGES);
  const names = useMessages(HYS_PROCEDURE_MESSAGES);
  const ruleText = useRuleText();
  const first = suggestions[0];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t.promptTitle} icon={<Paperclip className="h-4 w-4" />} size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onProceed();
          }}
        >
          <Stack gap="sm">
            <p className="text-sm text-fg-muted">{fill(t.promptBody, { op })}</p>
            {suggestions.length > 0 && (
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border" aria-label={t.suggestTitle}>
                {suggestions.map((s) => (
                  <li key={`${s.code}-${s.rule}`} className="flex flex-col gap-1 px-3 py-2">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                      <Badge tone="warning" variant="outline" className="font-mono">
                        {s.code}
                      </Badge>
                      {names[s.code]}
                    </span>
                    <span className="text-sm text-fg-muted">{ruleText(s)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Stack>
          <DialogFooter>
            <Button variant="secondary" type="button" disabled={!first || pending} leftIcon={<Paperclip className="h-4 w-4" />} onClick={() => first && onDeclareHys(first.code)}>
              {t.declareFirst}
            </Button>
            <Button type="submit" loading={pending} leftIcon={<Send className="h-4 w-4" />}>
              {t.proceed}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
