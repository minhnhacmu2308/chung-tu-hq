"use client";
// Hỏi khi panel sửa ô còn thay đổi chưa lưu mà người dùng chọn ô khác / đóng panel / Tab sang ô khác / sang bước OCR: Lưu · Bỏ thay đổi · Ở lại.
import { Button, Dialog, DialogContent, DialogFooter } from "@kb/ui";
import { Save } from "lucide-react";
import { formatNumber } from "@/lib/format";

type Props = {
  open: boolean;
  /** "1.44 · Tổng trị giá hóa đơn". */
  title: string;
  count: number;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
  /** Hộp đóng (mọi lựa chọn): focus mặc định của Radix bị chặn, nơi gọi tự quyết (chỉ đặt lại khi "Ở lại"). */
  onClosed: () => void;
};

export function UnsavedDialog({ open, title, count, saving, onSave, onDiscard, onStay, onClosed }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onStay()}>
      <DialogContent
        title={`Lưu thay đổi ở ${title}?`}
        icon={<Save className="h-4 w-4" />}
        description={`Có ${formatNumber(count)} chỉ tiêu chưa lưu. Rời ô này mà không lưu sẽ mất thay đổi.`}
        size="sm"
        // Phải chọn rõ ràng (Esc = Ở lại): hộp có thể mở ngay lúc nhấn chuột xuống (tab kích hoạt khi mousedown) – lần nhả chuột / focus
        // ngay sau đó nằm ngoài hộp không được tính là bấm ra ngoài.
        onInteractOutside={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed();
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={saving} onClick={onStay}>Ở lại</Button>
            <Button type="button" variant="secondary" disabled={saving} onClick={onDiscard}>Bỏ thay đổi</Button>
            <Button type="submit" loading={saving} autoFocus>Lưu</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
