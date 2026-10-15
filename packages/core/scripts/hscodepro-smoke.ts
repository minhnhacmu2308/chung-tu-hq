// Kiểm khói API HSCodePro theo checklist §10 của docs/integrations/hscodepro-api-v1.md.
// Chạy: HSCODEPRO_URL=… HSCODEPRO_INTERNAL_KEY=… pnpm hscodepro:smoke   (thiếu thì đọc từ .env gốc)
// Máy giả lập: pnpm fpt-mock → HSCODEPRO_URL=http://localhost:7070 HSCODEPRO_INTERNAL_KEY=dev-hs-key
// Không in khóa. Gọi API thật tạo lượt phân loại (tốn hạn mức của HSCodePro) – chỉ chạy khi cần.
import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
import type { HsJob } from "@kb/contracts";
import { HsApiError } from "../src/modules/declaration/application/ports.js";
import { HscodeproHttpService } from "../src/modules/declaration/infrastructure/hs-classifier.js";

const url = process.env["HSCODEPRO_URL"];
const key = process.env["HSCODEPRO_INTERNAL_KEY"];
if (!url || !key) {
  console.error("Thiếu HSCODEPRO_URL hoặc HSCODEPRO_INTERNAL_KEY");
  process.exit(2);
}
const svc = new HscodeproHttpService(url, key);
const results: { step: string; ok: boolean; note: string }[] = [];
const record = (step: string, ok: boolean, note: string) => {
  results.push({ step, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step} – ${note}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function settle(id: string, maxMs = 5 * 60_000): Promise<HsJob> {
  const until = Date.now() + maxMs;
  for (;;) {
    const j = await svc.get(id);
    if (j.status !== "processing" || Date.now() > until) return j;
    await sleep(3000);
  }
}
const ITEMS = [
  { line_no: 1, description: "Thanh trượt dẫn hướng MGN12H, dài 500 mm", quantity: 100, unit: "PCE", origin_country: "TW", value_usd: 2840, invoice_hs: "8466.93", co_form: null },
  { line_no: 2, description: "Vít me bi SFU1605, dài 600 mm", quantity: 40, unit: "PCE", origin_country: "TW", value_usd: 2180, invoice_hs: "8483.40", co_form: null },
  { line_no: 3, description: "Gối đỡ vít me BK12/BF12 (không lắp ổ bi)", quantity: 50, unit: "SET", origin_country: "TW", value_usd: 600, co_form: null },
];

console.log(`HSCodePro smoke → ${new URL(url).origin}`);
// 1. Khóa + đường dẫn đúng → 404 cho id không tồn tại.
try {
  await svc.get("khong-ton-tai");
  record("1. khóa + đường dẫn", false, "mong 404, nhận 200");
} catch (e) {
  record("1. khóa + đường dẫn", e instanceof HsApiError && e.status === 404, e instanceof HsApiError ? `${e.status} ${e.code}` : String(e));
}
// 2 + 3. Invoice 3 dòng → chạy tới hết processing; in trạng thái từng dòng (không tự trả lời câu hỏi).
try {
  const job = await svc.create({ external_ref: "SMOKE-KHAIBAO", items: ITEMS });
  const done = await settle(job.id);
  const lines = done.items.map((i) => `#${i.line_no} ${i.status}${i.result ? ` ${i.result.hs_code} (${i.result.confidence}%)` : ""}${i.question ? ` hỏi: ${i.question.questions.map((q) => q.question).join(" | ")}` : ""}${i.error ? ` lỗi ${i.error.code}` : ""}`);
  record("2. tạo lượt 3 dòng", done.status !== "processing", `${done.status}: ${lines.join("; ")}`);
} catch (e) {
  record("2. tạo lượt 3 dòng", false, String(e));
}
// 4. C/O form E + xuất xứ CN → FTA (hoặc MFN kèm cảnh báo).
try {
  const job = await svc.create({ items: [{ line_no: 1, description: "Ổ bi cầu rãnh sâu 6204-2RS", origin_country: "CN", co_form: "E" }] });
  const done = await settle(job.id);
  const r = done.items[0]?.result;
  record("4. C/O form E", !!r, r ? `basis ${r.tax?.import.basis ?? "—"} ${r.tax?.import.agreement ?? ""}${r.warnings.length ? ` · cảnh báo: ${r.warnings.join("; ")}` : ""}` : `dòng ${done.items[0]?.status}`);
} catch (e) {
  record("4. C/O form E", false, String(e));
}
// 5. Xuất xứ 3 ký tự → 400 có details.field.
try {
  await svc.create({ items: [{ line_no: 1, description: "Vít me bi SFU1605", origin_country: "TWN" }] as never });
  record("5. lỗi 400 có field", false, "mong 400, nhận 202");
} catch (e) {
  record("5. lỗi 400 có field", e instanceof HsApiError && e.status === 400 && !!e.details?.some((d) => d.field.includes("origin_country")), e instanceof HsApiError ? `${e.status} ${e.code} ${JSON.stringify(e.details ?? [])}` : String(e));
}
// 6. Tạo rồi hủy ngay → dòng chưa xong thành cancelled.
try {
  const job = await svc.create({ items: ITEMS });
  await svc.cancel(job.id);
  const after = await svc.get(job.id);
  record("6. hủy lượt", after.items.every((i) => i.status === "cancelled" || i.status === "completed" || i.status === "failed"), after.items.map((i) => `#${i.line_no} ${i.status}`).join(", "));
} catch (e) {
  record("6. hủy lượt", false, String(e));
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} PASS`);
process.exit(failed ? 1 : 0);
