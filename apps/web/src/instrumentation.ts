// Chạy một lần khi máy chủ Next khởi động: kiểm cấu hình môi trường ngay, không đợi tới request đầu tiên mới phát hiện thiếu biến.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PUBLIC_DATA_SOURCE !== "http") return;
  // Import động: chỉ tải composition root (DB/Redis client) ở runtime Node, không kéo vào edge/bundle client.
  const { assertEnv } = await import("@/container");
  // loadEnv ném Error liệt kê từng biến sai → tiến trình dừng với thông báo rõ ràng thay vì 503 lác đác.
  assertEnv();
}
