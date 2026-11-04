"use client";
// Sau khi lưu bằng Enter trong panel sửa ô: hỏi Thoát panel (về bản in) hay Ở lại sửa tiếp.
// Nút mặc định là "Thoát panel" → Enter hai lần = lưu rồi thoát; Esc = Ở lại.
import { Button, Dialog, DialogContent, DialogFooter, fill, useMessages } from "@kb/ui";
import { CheckCircle2 } from "lucide-react";
import { PRINT_MESSAGES } from "./print.messages";

type Props = {
  open: boolean;
  /** "2.12 · Tên người xuất khẩu". */
  title: string;
  onExit: () => void;
  onStay: () => void;
  /** Hộp đóng (mọi lựa chọn): focus mặc định của Radix bị chặn, nơi gọi tự quyết (chỉ đặt lại khi "Ở lại"). */
  onClosed: () => void;
};

export function SavedDialog({ open, title, onExit, onStay, onClosed }: Props) {
  const t = useMessages(PRINT_MESSAGES);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onStay()}>
      <DialogContent
        title={fill(t.savedTitle, { title })}
        icon={<CheckCircle2 className="h-4 w-4" />}
        description={t.savedDesc}
        size="sm"
        // Phải chọn rõ ràng: bấm ra ngoài không đóng hộp (Esc = Ở lại).
        onInteractOutside={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed();
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onExit();
          }}
        >
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onStay}>{t.stay}</Button>
            <Button type="submit" autoFocus>{t.exitPanel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
