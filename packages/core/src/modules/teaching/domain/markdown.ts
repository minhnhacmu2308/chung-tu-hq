// Bộ quy tắc khai báo của doanh nghiệp dạng Markdown – bản xuất từ bài học đã duyệt (nơi lưu gốc là DB, code áp dụng). Thuần.
import { LESSON_AUTO_FILL_AFTER, type LessonContext } from "@kb/contracts";
import { isAutoFill, type LessonRow } from "./lessons.js";

const CONTEXT_LABEL: Record<keyof LessonContext, string> = { supplier: "Nhà cung cấp", carrier: "Hãng vận chuyển", mode: "Phương thức", office: "Chi cục", partNo: "Mặt hàng" };

const when = (c: LessonContext) => {
  const parts = (Object.entries(c) as [keyof LessonContext, string][]).filter(([k]) => k !== "partNo").map(([k, v]) => `${CONTEXT_LABEL[k]} ${v}`);
  return parts.length ? parts.join(", ") : "Mọi lô";
};
const partOf = (c: LessonContext) => (c.partNo ?? "").replace(/^[PD]:/, "");
const cell = (s: string | null | undefined) => (s ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
const trust = (r: LessonRow) => (isAutoFill(r) ? "Tự điền" : r.conflicts.length ? `Mâu thuẫn (${r.conflicts.map((c) => `${c.value} ×${c.hits}`).join("; ")})` : `Cần kiểm (${r.hits}/${LESSON_AUTO_FILL_AFTER})`);

export function rulesMarkdown(input: { orgName: string; generatedAt: Date; lessons: LessonRow[]; labels: Record<string, string> }): string {
  const active = input.lessons.filter((r) => r.status === "ACTIVE");
  const fields = active.filter((r) => r.kind === "FIELD").sort((a, b) => a.fieldCode.localeCompare(b.fieldCode) || b.hits - a.hits);
  const clauses = active.filter((r) => r.kind === "CLAUSE");
  const lines = active.filter((r) => r.kind === "LINE").sort((a, b) => partOf(a.context).localeCompare(partOf(b.context)));
  const out = [
    `# Quy tắc khai báo – ${input.orgName}`,
    "",
    `Xuất lúc ${input.generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC từ ${active.length} bài học đang dùng (mục Dạy khai báo).`,
    `Gặp từ ${LESSON_AUTO_FILL_AFTER} lần trở lên, không mâu thuẫn → app tự điền; ít hơn → điền sẵn, đánh dấu cần kiểm. Giá trị trên chứng từ của lô luôn được ưu tiên.`,
    "",
    "## Chỉ tiêu chung theo ngữ cảnh",
    "",
  ];
  if (fields.length) {
    out.push("| Chỉ tiêu | Khi | Giá trị | Số lần | Mức | Học từ TK |", "|---|---|---|---|---|---|");
    for (const r of fields) out.push(`| ${cell(input.labels[r.fieldCode] ?? r.fieldCode)} (${r.fieldCode}) | ${cell(when(r.context))} | ${cell(r.value)} | ${r.hits} | ${trust(r)} | ${cell(r.lastDeclarationNo)} |`);
  } else out.push("_Chưa có._");
  out.push("", "## Câu cố định", "");
  if (clauses.length) {
    for (const r of clauses) out.push(`- **${cell(input.labels[r.fieldCode] ?? r.fieldCode)}** · ${cell(when(r.context))} · ${r.hits} lần · ${trust(r)}: ${cell(r.value)}`);
  } else out.push("_Chưa có._");
  out.push("", "## Mặt hàng", "");
  if (lines.length) {
    out.push("| Mặt hàng | Nhà cung cấp | Mã HS | Mô tả khai báo | Thuế NK | Biểu thuế | GTGT | Số lần | Mức |", "|---|---|---|---|---|---|---|---|---|");
    for (const r of lines) {
      const l = r.line;
      out.push(`| ${cell(partOf(r.context))} | ${cell(r.context.supplier)} | ${cell(r.value)} | ${cell(l?.description)} | ${cell(l?.importRate ? `${l.importRate}%` : "")} | ${cell(l?.importTaxSchedule)} | ${cell(l?.vatRate ? `${l.vatRate}%` : "")}${l?.vatExemptCode ? ` (${cell(l.vatExemptCode)})` : ""} | ${r.hits} | ${trust(r)} |`);
    }
  } else out.push("_Chưa có._");
  return `${out.join("\n")}\n`;
}
