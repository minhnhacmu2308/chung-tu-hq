// Chạy một lần khi máy chủ Next khởi động: kiểm cấu hình môi trường ngay, không đợi tới request đầu tiên mới phát hiện thiếu biến.
export async function register() {
  // Import động nằm TRONG nhánh `NEXT_RUNTIME === "nodejs"`: bản dựng edge thay biến này bằng "edge" và bỏ cả nhánh,
  // nên composition root (DB/Redis, argon2) không bị kéo vào bundle edge. Dạng `if (!== "nodejs") return` không loại được.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "http") return;
    const { assertEnv } = await import("@/container");
    // loadEnv ném Error liệt kê từng biến sai → tiến trình dừng với thông báo rõ ràng thay vì 503 lác đác.
    assertEnv();
  }
}
