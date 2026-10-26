// Hộp xác nhận thao tác nguy hiểm / cần cân nhắc (xóa vĩnh viễn, hủy hồ sơ, ngắt kết nối…) dùng chung cả hệ thống:
// đầu popup có icon trong ô màu + vạch màu trên đỉnh, thân là đối tượng bị ảnh hưởng + Alert hậu quả cùng tông,
// chân có "Giữ lại" (focus sẵn – Enter vô tình không xóa nhầm) và nút xác nhận. Không tự ghép Dialog cho việc này trong app.
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useMessages, type Messages } from "../lib/i18n.js";
import { Button } from "./button.js";
import { Dialog, DialogContent, DialogFooter } from "./dialog.js";
import { Alert } from "./feedback.js";

const MESSAGES = {
  vi: { keep: "Giữ lại", irreversible: "Không thể hoàn tác" },
  en: { keep: "Keep", irreversible: "This can't be undone" },
  zh: { keep: "保留", irreversible: "此操作无法撤销" },
} satisfies Messages<"keep" | "irreversible">;

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Icon đầu popup (vd `Trash2` khi xóa). Bỏ trống → tam giác cảnh báo. */
  icon?: ReactNode;
  /** danger = xóa / hủy, nút xác nhận đỏ · warning = cần cân nhắc, nút xác nhận chính. */
  tone?: "danger" | "warning";
  /** Dòng phụ dưới tiêu đề (vd mã hồ sơ). */
  description?: ReactNode;
  /** Đối tượng bị ảnh hưởng, in đậm đầu thân (vd tiêu đề email). */
  subject?: ReactNode;
  /** Hậu quả – nằm trong Alert cùng tông. */
  children?: ReactNode;
  /** Thêm tiêu đề "Không thể hoàn tác" cho Alert hậu quả. */
  irreversible?: boolean;
  confirmLabel: ReactNode;
  onConfirm: () => void;
  /** Đang chạy: nút xác nhận quay, không đóng được popup. */
  loading?: boolean;
  labels?: { keep?: string; irreversible?: string };
};

export function ConfirmDialog({
  open, onOpenChange, title, icon, tone = "danger", description, subject, children, irreversible, confirmLabel, onConfirm, loading = false, labels,
}: ConfirmDialogProps) {
  const l = useMessages(MESSAGES, labels);
  return (
    <Dialog open={open} onOpenChange={(o) => (o || !loading) && onOpenChange(o)}>
      <DialogContent
        title={title}
        icon={icon ?? <TriangleAlert className="h-4 w-4" />}
        tone={tone}
        size="sm"
        allowPresentationToggle={false}
        {...(description ? { description } : {})}
      >
        {subject && <p className="line-clamp-2 break-words text-sm font-medium text-fg">{subject}</p>}
        {(children || irreversible) && (
          <Alert tone={tone} {...(irreversible ? { title: l.irreversible } : {})}>
            {children}
          </Alert>
        )}
        <DialogFooter>
          {/* Focus sẵn ở "Giữ lại": Enter / Space vô tình không chạy thao tác. FocusScope của Dialog thấy đã có focus bên trong nên không dời đi. */}
          <Button autoFocus variant="ghost" disabled={loading} onClick={() => onOpenChange(false)}>
            {l.keep}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
