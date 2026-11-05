"use client";
// Bảng phím tắt của panel sửa ô (nút "Phím tắt" ở chân panel hoặc F1).
import { Button, Dialog, DialogContent, DialogFooter, useMessages } from "@kb/ui";
import { Keyboard } from "lucide-react";
import { PRINT_MESSAGES } from "./print.messages";

type Props = { open: boolean; onClose: () => void; onClosed?: () => void };

export function ShortcutsDialog({ open, onClose, onClosed }: Props) {
  const t = useMessages(PRINT_MESSAGES);
  const rows = [
    [t.keyEnter, t.doEnter],
    [t.keySave, t.doSave],
    [t.keyTab, t.doTab],
    [t.keyShiftTab, t.doShiftTab],
    [t.keyEsc, t.doEsc],
    [t.keyEsc2, t.doEsc2],
    [t.keyHelp, t.doHelp],
  ] as const;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t.shortcuts}
        icon={<Keyboard className="h-4 w-4" />}
        description={t.shortcutsDesc}
        onCloseAutoFocus={(e) => {
          if (!onClosed) return;
          e.preventDefault();
          onClosed();
        }}
      >
        <dl className="flex flex-col gap-3 text-sm">
          {rows.map(([key, does]) => (
            <div key={key} className="flex flex-col gap-0.5 cq-sm:flex-row cq-sm:gap-4">
              <dt className="shrink-0 font-semibold cq-sm:w-40">{key}</dt>
              <dd className="text-fg-muted">{does}</dd>
            </div>
          ))}
        </dl>
        <DialogFooter>
          <Button type="button" autoFocus onClick={onClose}>{t.close}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
