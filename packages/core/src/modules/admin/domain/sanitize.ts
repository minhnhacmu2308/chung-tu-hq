// Thông tin hiện cho đội vận hành từ dữ liệu kỹ thuật – không lộ tên file, đường dẫn, nội dung chứng từ (A2 của spec admin).

/** Lỗi job: dòng đầu, bỏ đường dẫn / tên file / chuỗi trong ngoặc kép, tối đa 200 ký tự. */
export function sanitizeJobError(raw: string | null | undefined): string {
  const first = (raw ?? "").split("\n")[0]!.trim();
  if (!first) return "Lỗi không rõ nguyên nhân";
  const cleaned = first
    .replace(/(?:[A-Za-z]:)?(?:[\\/][\w.\-À-ỹ ]+){2,}/g, "<đường dẫn>")
    // Tên tệp: tối đa 3 từ viết hoa/số đứng trước phần đuôi ("Packing List.pdf", "INV 2026 01.pdf").
    .replace(/(?<=^|\s)(?:[\p{Lu}\d][\p{L}\d_\-]*\s){0,3}[\p{L}\d_\-]+\.(pdf|png|jpe?g|xlsx?|docx?|zip|xml|json|PDF|PNG|JPE?G|XLSX?|DOCX?|ZIP|XML|JSON)(?![\p{L}\d])/gu, "<tệp>")
    .replace(/"[^"]*"|'[^']*'/g, "<…>")
    .replace(/\s+/g, " ");
  return cleaned.length > 200 ? `${cleaned.slice(0, 197)}…` : cleaned;
}

/** Tên ngắn của thiết bị từ User-Agent – không lưu/hiện chuỗi gốc. */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return "Không rõ thiết bị";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Trình duyệt khác";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}

/** Tên loại việc của hàng đợi (hiện cho vận hành). */
export const QUEUE_LABELS: Record<string, string> = {
  health: "Kiểm tra hệ thống",
  "extract-document": "Đọc chứng từ",
  "run-agent": "AI Agent dựng tờ khai",
  "customs-send": "Truyền Hải quan",
  "customs-poll": "Hỏi trạng thái Hải quan",
  "skill-evaluate": "Đánh giá skill",
  "skill-sample-read": "Đọc mẫu skill",
  "cert-expiry": "Nhắc chứng thư hết hạn",
};
