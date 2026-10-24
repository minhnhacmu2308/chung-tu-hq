// Chạy một lần khi máy chủ Next khởi động: kiểm cấu hình môi trường ngay, không đợi tới request đầu tiên mới phát hiện thiếu biến.
export async function register() {
  // Giữ đúng dạng `if (process.env.NEXT_RUNTIME === "nodejs") { await import(...) }`: webpack thay NEXT_RUNTIME lúc biên dịch và bỏ
  // hẳn nhánh chết, nên bản edge (proxy.ts) không kéo composition root (bullmq, argon2, postgres…) vào bundle. Viết `return` sớm
  // thì webpack vẫn đóng gói import phía sau → "Module not found" khi dev.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "http") return;
    const { assertEnv } = await import("@/container");
    // loadEnv ném Error liệt kê từng biến sai → tiến trình dừng với thông báo rõ ràng thay vì 503 lác đác.
    assertEnv();
  }
}
