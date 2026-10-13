import { Alert, Button } from "@kb/ui";

/** Báo không tải được dữ liệu, kèm nút thử lại. Dùng thống nhất cho mọi khối tự tải dữ liệu. */
export function LoadError({ onRetry, title = "Không tải được dữ liệu" }: { onRetry: () => void; title?: string }) {
  return (
    <Alert tone="danger" title={title} action={<Button size="sm" variant="secondary" onClick={onRetry}>Thử lại</Button>}>
      Kiểm tra kết nối rồi thử lại.
    </Alert>
  );
}
