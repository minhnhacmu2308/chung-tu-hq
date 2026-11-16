// Chọn một ảnh (logo, ảnh đại diện): xem trước + nút Tải ảnh/Đổi ảnh + Gỡ ảnh. Chỉ hiển thị: upload thật và hỏi xác nhận gỡ do app làm.
import { ImagePlus, Trash2 } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";
import { Avatar } from "./avatar.js";
import { Button } from "./button.js";

const MESSAGES = {
  vi: { upload: "Tải ảnh lên", replace: "Đổi ảnh", remove: "Gỡ ảnh", preview: "Ảnh hiện tại" },
  en: { upload: "Upload image", replace: "Change image", remove: "Remove image", preview: "Current image" },
  zh: { upload: "上传图片", replace: "更换图片", remove: "移除图片", preview: "当前图片" },
} satisfies Messages<"upload" | "replace" | "remove" | "preview">;

export type ImagePickerProps = {
  /** Ảnh hiện tại (URL / data URL); không có → `fallback` (vuông) hoặc chữ viết tắt của `name` (tròn). */
  src?: string | null | undefined;
  /** "square" cho logo (ảnh vừa khung, nền trắng), "circle" cho ảnh đại diện. */
  shape?: "square" | "circle";
  /** Tên người / doanh nghiệp: chữ viết tắt khi chưa có ảnh tròn. */
  name: string;
  fallback?: ReactNode;
  /** Mặc định PNG, JPEG, WebP. */
  accept?: string;
  hint?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  /** Đang tải ảnh lên. */
  loading?: boolean;
  /** Đang gỡ ảnh. */
  removing?: boolean;
  onPick: (file: File) => void;
  /** Có → hiện nút Gỡ ảnh khi đang có ảnh. */
  onRemove?: () => void;
  labels?: Partial<Record<keyof (typeof MESSAGES)["vi"], string>>;
  className?: string;
};

export function ImagePicker({
  src, shape = "square", name, fallback, accept = "image/png,image/jpeg,image/webp", hint, error, disabled, loading, removing, onPick, onRemove, labels, className,
}: ImagePickerProps) {
  const t = useMessages(MESSAGES, labels);
  const file = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const errorId = useId();
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex items-center gap-4", className)}>
      {shape === "circle" ? (
        <Avatar name={name} src={src ?? undefined} size="xl" />
      ) : (
        <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface">
          {src ? <img src={src} alt={t.preview} className="h-full w-full object-contain" /> : fallback}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={!!loading}
            disabled={disabled || removing}
            leftIcon={<ImagePlus aria-hidden="true" className="h-4 w-4" />}
            {...(describedBy ? { "aria-describedby": describedBy } : {})}
            onClick={() => file.current?.click()}
          >
            {src ? t.replace : t.upload}
          </Button>
          {src && onRemove && (
            <Button
              type="button"
              variant="danger-outline"
              size="sm"
              loading={!!removing}
              disabled={disabled || loading}
              leftIcon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
              onClick={onRemove}
            >
              {t.remove}
            </Button>
          )}
        </div>
        <input
          ref={file}
          type="file"
          accept={accept}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onPick(f);
          }}
        />
        {hint && <p id={hintId} className="text-xs text-fg-subtle">{hint}</p>}
        {error && <p id={errorId} role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
