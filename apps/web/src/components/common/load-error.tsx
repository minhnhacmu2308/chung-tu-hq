import { Alert, Button, useMessages } from "@kb/ui";
import { LOAD_ERROR_MESSAGES } from "./common.messages";

/** Báo không tải được dữ liệu, kèm nút thử lại. Dùng thống nhất cho mọi khối tự tải dữ liệu. */
export function LoadError({ onRetry, title }: { onRetry: () => void; title?: string }) {
  const t = useMessages(LOAD_ERROR_MESSAGES);
  return (
    <Alert tone="danger" title={title ?? t.title} action={<Button size="sm" variant="secondary" onClick={onRetry}>{t.retry}</Button>}>
      {t.hint}
    </Alert>
  );
}
