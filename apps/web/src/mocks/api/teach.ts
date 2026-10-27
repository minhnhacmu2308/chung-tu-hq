// Dạy khai báo (mock, demo): dữ liệu trong bộ nhớ trình duyệt theo lô mẫu 770471184612; upload giả lập AI đọc xong sau vài giây.
import { LESSON_AUTO_FILL_AFTER, type Lesson, type TeachComparison, type TeachOverview, type TeachSample, type UpdateLessonInput } from "@kb/contracts";
import { ApiError, newId, nowIso } from "@/lib/mock-request";

export const teachKeys = { all: ["teach"] as const, overview: ["teach", "overview"] as const, comparison: (id: string) => ["teach", "comparison", id] as const };

const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const clone = <T,>(x: T): T => structuredClone(x);

const seedSample: TeachSample = { id: "tks_demo1", fileName: "TK 106794645160.pdf", status: "READ", declarationNo: "106794645160", dossierId: "dos_demo", dossierCode: "HS-NK-2610-001", matched: 128, total: 157, lessons: 4, error: null, createdAt: "2026-10-27T03:00:00.000Z" };
const lesson = (id: string, x: Partial<Lesson>): Lesson => ({ id, kind: "FIELD", fieldCode: "KHO", label: "", context: {}, value: "", line: null, hits: 1, conflicts: [], status: "PENDING", autoFill: false, lastDeclarationNo: "106794645160", updatedAt: "2026-10-27T03:00:00.000Z", ...x });
const state: { enabled: boolean; samples: TeachSample[]; lessons: Lesson[] } = {
  enabled: false,
  samples: [seedSample],
  lessons: [
    lesson("les_demo1", { fieldCode: "KHO", label: "Mã địa điểm lưu kho hàng chờ thông quan dự kiến", context: { office: "02DS", mode: "AIR", carrier: "FEDEX" }, value: "02DSEA0 – KHO FEDEX", hits: 3 }),
    lesson("les_demo2", { fieldCode: "PT_TT", label: "Phương thức thanh toán", context: { supplier: "LIGHTING RISE ZHUHAI" }, value: "TTR" }),
    lesson("les_demo3", { kind: "CLAUSE", fieldCode: "CT_TG", label: "Chi tiết khai trị giá", context: { supplier: "LIGHTING RISE ZHUHAI" }, value: "Hàng nhập nằm ngoài phạm vi áp dụng QCVN 19:2019/BKHCN" }),
    lesson("les_demo4", {
      kind: "LINE", fieldCode: "HS", label: "Mặt hàng", context: { supplier: "LIGHTING RISE ZHUHAI", partNo: "P:2118564ACOT96" }, value: "9405.11.99", hits: 2,
      line: { hsCode: "9405.11.99", description: "Đèn down light âm trần, màu trắng 1 LED, 7W, 350mA, DC 18V input, mới 100%, hiệu: Rise", importRate: "0", importTaxSchedule: "B30", vatRate: "10", vatExemptCode: null },
    }),
  ],
};
const comparison: Omit<TeachComparison, "sample"> = {
  fields: [
    { code: "SO_VD", label: "Số vận đơn", draft: "770471184612", real: "770471184612", kind: "MATCH", foundIn: [] },
    { code: "KHO", label: "Mã địa điểm lưu kho hàng chờ thông quan dự kiến", draft: "", real: "02DSEA0 – KHO FEDEX", kind: "KNOWLEDGE", foundIn: [] },
    { code: "CANG_DO", label: "Mã địa điểm dỡ hàng", draft: "VNSGN – Cảng Sài Gòn (TP.HCM)", real: "VNSGN", kind: "MATCH", foundIn: [] },
    { code: "PTVC_TEN", label: "Tên phương tiện vận chuyển", draft: "", real: "PH8090/04DEC", kind: "KNOWLEDGE", foundIn: [] },
    { code: "NGAY_DEN", label: "Ngày hàng đến", draft: "2024-12-04", real: "2024-12-06", kind: "DOCUMENT", foundIn: ["FREIGHT_INVOICE"] },
    { code: "PT_TT", label: "Phương thức thanh toán", draft: "", real: "TTR", kind: "KNOWLEDGE", foundIn: [] },
  ],
  lines: [{ lineNo: 7, draftHs: "94051199", realHs: "94051199", draftDescription: "Recessed fix down light LED 7W", realDescription: "Đèn down light âm trần, màu đen", draftImportRate: "30", realImportRate: "0", draftVatRate: "", realVatRate: "10" }],
};
const withAuto = (l: Lesson): Lesson => ({ ...l, autoFill: l.status === "ACTIVE" && l.hits >= LESSON_AUTO_FILL_AFTER && !l.conflicts.length });

export async function getTeachOverview(): Promise<TeachOverview> {
  await wait();
  const accuracy = state.samples.some((s) => s.total) ? [{ month: "2026-10", matched: 128, total: 157, samples: 1 }] : [];
  return clone({ settings: { enabled: state.enabled }, samples: state.samples, lessons: state.lessons.map(withAuto), accuracy });
}
export async function uploadTeachSamples(files: File[]): Promise<TeachSample[]> {
  await wait();
  const rows = files.map((f): TeachSample => ({ id: newId("tks"), fileName: f.name, status: "READING", declarationNo: null, dossierId: null, dossierCode: null, matched: null, total: null, lessons: 0, error: null, createdAt: nowIso() }));
  state.samples.unshift(...rows);
  setTimeout(() => {
    for (const r of rows) Object.assign(r, { status: "READ", declarationNo: String(106794645000 + Math.floor(Math.random() * 999)), lessons: 0 });
  }, 2500);
  return clone(rows);
}
export async function getTeachComparison(id: string): Promise<TeachComparison> {
  await wait();
  const s = state.samples.find((x) => x.id === id);
  if (!s) throw new ApiError("NOT_FOUND", "Không tìm thấy tờ khai mẫu");
  return clone({ sample: s, ...(s.id === seedSample.id ? comparison : { fields: [], lines: [] }) });
}
export async function retryTeachSample(id: string): Promise<TeachSample> {
  await wait();
  const s = state.samples.find((x) => x.id === id);
  if (!s) throw new ApiError("NOT_FOUND", "Không tìm thấy tờ khai mẫu");
  return clone(s);
}
export async function deleteTeachSample(id: string): Promise<void> {
  await wait();
  state.samples = state.samples.filter((x) => x.id !== id);
}
export async function updateLesson(id: string, input: UpdateLessonInput): Promise<Lesson> {
  await wait();
  const l = state.lessons.find((x) => x.id === id);
  if (!l) throw new ApiError("NOT_FOUND", "Không tìm thấy bài học");
  if (input.status) l.status = input.status;
  if (input.value !== undefined) Object.assign(l, { value: input.value, conflicts: [] });
  return clone(withAuto(l));
}
export async function approveLessons(ids: string[]): Promise<number> {
  await wait();
  const todo = state.lessons.filter((l) => ids.includes(l.id) && l.status !== "ACTIVE");
  for (const l of todo) l.status = "ACTIVE";
  return todo.length;
}
export async function setTeachEnabled(enabled: boolean) {
  await wait();
  state.enabled = enabled;
  return { enabled };
}
export async function downloadTeachRules(): Promise<{ blob: Blob; fileName: string }> {
  await wait();
  const active = state.lessons.filter((l) => l.status === "ACTIVE");
  const md = [`# Quy tắc khai báo`, "", ...active.map((l) => `- ${l.label} (${l.fieldCode}): ${l.value} – ${l.hits} lần`)].join("\n");
  return { blob: new Blob([md], { type: "text/markdown" }), fileName: "quy-tac-khai-bao.md" };
}
