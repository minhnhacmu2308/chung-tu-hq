import { getInboxAttachmentFile } from "@kb/core/modules/mailbox";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** Kiểu nội dung theo đuôi file (đã lọc khi lấy thư) – không tin mime do người gửi email khai, tránh trả HTML chạy trên tên miền của mình. */
const TYPE_BY_EXT: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

// Xem trước file đính kèm trong hộp thư chứng từ (trả thẳng nội dung, không lộ khóa kho lưu trữ). ZIP → tải về.
export const dynamic = "force-dynamic";
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  const f = fromResult(await getInboxAttachmentFile(getContainer().mailbox, ctx, params.id!));
  const type = TYPE_BY_EXT[f.fileName.toLowerCase().split(".").pop() ?? ""];
  return new Response(new Uint8Array(f.bytes), {
    headers: {
      "content-type": type ?? "application/octet-stream",
      "content-length": String(f.bytes.length),
      "content-disposition": `${type ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      "cache-control": "private, no-store",
    },
  });
});
