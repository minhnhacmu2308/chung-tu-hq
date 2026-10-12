// Bước 2–3: chứng từ của hồ sơ (upload, phân loại, đọc) + kết quả trích xuất và đối chiếu chéo (mock).
// Mô phỏng tiến trình bằng thời gian: mỗi chứng từ đi UPLOADING → QUEUED → READING → DONE tính từ lúc bắt đầu;
// màn hình gọi lại (refetchInterval) để thấy tiến độ. Có backend → SSE/polling trạng thái job thật.
import { ApiError, mutate, newId, nowIso, query } from "@/lib/mock-request";
import type { MockDb } from "@/mocks/db";
import { generateChecks, generateFieldsForDocument, SUSPECT_STATUSES } from "@/mocks/seed/ocr";
import type { CrossCheck, DocKind, DossierDocument, ExtractedField, FieldStatus } from "@/mocks/types";

export const ocrKeys = {
  documents: (dossierId: string) => ["ocr", "documents", dossierId] as const,
  fields: (dossierId: string) => ["ocr", "fields", dossierId] as const,
  checks: (dossierId: string) => ["ocr", "checks", dossierId] as const,
};

export const isSuspect = (s: FieldStatus) => SUSPECT_STATUSES.includes(s);

/* ---------------- Mô phỏng tiến trình ---------------- */

/** Thời điểm bắt đầu xử lý của từng chứng từ (chỉ trong phiên; F5 → tính lại từ lúc mở). */
const startedAt = new Map<string, number>();
const PHASES: [DossierDocument["status"], number][] = [
  ["UPLOADING", 1200],
  ["QUEUED", 1800],
  ["READING", 3500],
];

function advance(db: MockDb, dossierId: string) {
  const now = Date.now();
  let changed = false;
  db.documents
    .filter((d) => d.dossierId === dossierId && d.status !== "DONE" && d.status !== "ERROR")
    .forEach((doc, i) => {
      if (!startedAt.has(doc.id)) {
        // Tiếp tục từ pha hiện tại của chứng từ (vd seed đang READING), so le để thấy từng file chạy.
        const elapsed = PHASES.slice(0, Math.max(0, PHASES.findIndex(([p]) => p === doc.status))).reduce((n, [, ms]) => n + ms, 0);
        startedAt.set(doc.id, now - elapsed + i * 900);
      }
      let t = now - startedAt.get(doc.id)!;
      let status: DossierDocument["status"] = "DONE";
      for (const [phase, ms] of PHASES) {
        if (t < ms) {
          status = phase;
          break;
        }
        t -= ms;
      }
      if (t < 0) status = "UPLOADING";
      if (status !== doc.status) {
        doc.status = status;
        changed = true;
        if (status === "DONE") onDocumentRead(db, doc);
      }
    });
  return changed;
}

/** Đọc xong: sinh trường trích xuất cho chứng từ (nếu chưa có) và chạy lại đối chiếu chéo. */
function onDocumentRead(db: MockDb, doc: DossierDocument) {
  const dossier = db.dossiers.find((d) => d.id === doc.dossierId);
  if (!dossier) return;
  if (!db.fields.some((f) => f.documentId === doc.id)) {
    const n = db.documents.filter((d) => d.dossierId === dossier.id).indexOf(doc);
    db.fields.push(...generateFieldsForDocument(doc, dossier, n % 3 === 0 ? 2 : 1));
  }
  rerunChecks(db, dossier.id);
}

function rerunChecks(db: MockDb, dossierId: string) {
  const dossier = db.dossiers.find((d) => d.id === dossierId);
  if (!dossier) return;
  const kinds = db.documents.filter((d) => d.dossierId === dossierId && d.status === "DONE").map((d) => d.kind);
  // Hồ sơ đã có bộ luật chi tiết (seed) thì giữ nguyên; hồ sơ mới thì sinh lại theo chứng từ hiện có.
  if (db.checks.some((c) => c.dossierId === dossierId && c.ruleCode === "R-AMOUNT-SUM")) return;
  db.checks = db.checks.filter((c) => c.dossierId !== dossierId).concat(generateChecks(dossier, kinds));
}

/* ---------------- Chứng từ ---------------- */

/** Danh sách chứng từ của hồ sơ, đã cập nhật tiến trình mô phỏng. */
export const listDossierDocuments = (dossierId: string) =>
  mutate((db) => {
    advance(db, dossierId);
    return db.documents.filter((d) => d.dossierId === dossierId);
  });

/** Nhận diện loại chứng từ theo tên file (bản thật: AI phân loại từng trang). */
export function classifyByFileName(name: string): DocKind {
  const n = name.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, " ");
  const tokens = n.split(" ");
  // Từ ngắn (bl, co, pl…) phải là một token riêng; từ dài được phép nằm trong chuỗi.
  const has = (...words: string[]) => words.some((w) => tokens.includes(w) || (w.length > 3 && n.includes(w)));
  if (has("packing", "pl")) return "PACKING_LIST";
  if (has("awb", "hawb", "mawb", "airway")) return "AIR_WAYBILL";
  if (has("bl", "bol", "lading", "hbl", "mbl")) return "BILL_OF_LADING";
  if (has("co", "origin", "form")) return "CERT_OF_ORIGIN";
  if (has("arrival", "an", "notice")) return "ARRIVAL_NOTICE";
  if (has("cuoc", "freight", "gtgt", "vat")) return "FREIGHT_INVOICE";
  if (has("contract", "hdmb", "sc")) return "SALES_CONTRACT";
  if (has("inv", "invoice", "ci")) return "INVOICE";
  return "OTHER";
}

const estimatePages = (size: number) => Math.max(1, Math.min(12, Math.round(size / 250_000)));

/** Upload file (mock: chỉ lấy tên + dung lượng). File .zip được bung thành các chứng từ bên trong. */
export const uploadDocuments = (dossierId: string, files: { name: string; size: number }[]) =>
  mutate((db) => {
    const dossier = db.dossiers.find((d) => d.id === dossierId);
    if (!dossier) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
    const entries = files.flatMap((f) => {
      if (!f.name.toLowerCase().endsWith(".zip")) return [f];
      const base = f.name.replace(/\.zip$/i, "");
      return [
        { name: `${base}/INVOICE.pdf`, size: Math.round(f.size * 0.35) },
        { name: `${base}/PACKING_LIST.pdf`, size: Math.round(f.size * 0.2) },
        { name: `${base}/${dossier.transportMode === "AIR" ? "AWB" : "BL"}.pdf`, size: Math.round(f.size * 0.45) },
      ];
    });
    const created: DossierDocument[] = entries.map((e) => ({
      id: newId("doc"),
      dossierId,
      kind: classifyByFileName(e.name.split("/").pop() ?? e.name),
      fileName: e.name.split("/").pop() ?? e.name,
      sizeBytes: e.size,
      pages: estimatePages(e.size),
      status: "UPLOADING",
      uploadedAt: nowIso(),
    }));
    db.documents.push(...created);
    if (dossier.status === "DRAFT") dossier.status = "PROCESSING";
    dossier.updatedAt = nowIso();
    return created;
  });

export const changeDocumentKind = (documentId: string, kind: DocKind) =>
  mutate((db) => {
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc) throw new ApiError("NOT_FOUND", "Không tìm thấy chứng từ");
    doc.kind = kind;
    // Đổi loại → đọc lại theo skill của loại mới
    db.fields = db.fields.filter((f) => f.documentId !== documentId);
    if (doc.status === "DONE") onDocumentRead(db, doc);
    return doc;
  });

export const deleteDocument = (documentId: string) =>
  mutate((db) => {
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc) return;
    db.documents = db.documents.filter((d) => d.id !== documentId);
    db.fields = db.fields.filter((f) => f.documentId !== documentId);
    startedAt.delete(documentId);
    rerunChecks(db, doc.dossierId);
  });

/** Đọc lại chứng từ lỗi. */
export const retryDocument = (documentId: string) =>
  mutate((db) => {
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc) return;
    doc.status = "QUEUED";
    delete doc.error;
    startedAt.delete(documentId);
  });

/* ---------------- Trường trích xuất & đối chiếu ---------------- */

export const listFields = (dossierId: string) =>
  query((db) => {
    const docIds = new Set(db.documents.filter((d) => d.dossierId === dossierId).map((d) => d.id));
    return db.fields.filter((f) => docIds.has(f.documentId));
  });

export const listChecks = (dossierId: string): Promise<CrossCheck[]> => query((db) => db.checks.filter((c) => c.dossierId === dossierId));

function syncSuspectCount(db: MockDb, documentId: string) {
  const doc = db.documents.find((d) => d.id === documentId);
  const dossier = doc && db.dossiers.find((d) => d.id === doc.dossierId);
  if (!dossier) return;
  const docIds = new Set(db.documents.filter((d) => d.dossierId === dossier.id).map((d) => d.id));
  dossier.suspectFields = db.fields.filter((f) => docIds.has(f.documentId) && isSuspect(f.status)).length;
  dossier.updatedAt = nowIso();
}

/** Người dùng sửa giá trị → USER_CONFIRMED, giữ originalValue (bản thật ghi field_audit). */
export const updateFieldValue = (fieldId: string, value: string) =>
  mutate((db): ExtractedField => {
    const f = db.fields.find((x) => x.id === fieldId);
    if (!f) throw new ApiError("NOT_FOUND", "Không tìm thấy trường");
    f.value = value.trim();
    f.status = "USER_CONFIRMED";
    syncSuspectCount(db, f.documentId);
    return f;
  });

/** Bấm "Đúng": xác nhận giá trị AI đọc. */
export const confirmField = (fieldId: string) =>
  mutate((db): ExtractedField => {
    const f = db.fields.find((x) => x.id === fieldId);
    if (!f) throw new ApiError("NOT_FOUND", "Không tìm thấy trường");
    f.status = "USER_CONFIRMED";
    syncSuspectCount(db, f.documentId);
    return f;
  });

/** Hoàn tác về giá trị AI đọc ban đầu. */
export const revertField = (fieldId: string) =>
  mutate((db): ExtractedField => {
    const f = db.fields.find((x) => x.id === fieldId);
    if (!f) throw new ApiError("NOT_FOUND", "Không tìm thấy trường");
    f.value = f.originalValue;
    f.status = "MODEL_UNSURE";
    syncSuspectCount(db, f.documentId);
    return f;
  });

/** Đọc xong bộ chứng từ → hồ sơ sang bước OCR & kiểm tra, trạng thái "Cần kiểm tra" (hoặc thẳng tới agent nếu không còn gì nghi ngờ vẫn để người dùng xem). */
export const finishReading = (dossierId: string) =>
  mutate((db) => {
    const d = db.dossiers.find((x) => x.id === dossierId);
    if (!d) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
    const docs = db.documents.filter((x) => x.dossierId === dossierId);
    if (docs.some((x) => x.status !== "DONE" && x.status !== "ERROR")) throw new ApiError("NOT_READY", "Còn chứng từ đang đọc");
    const ids = new Set(docs.map((x) => x.id));
    d.suspectFields = db.fields.filter((f) => ids.has(f.documentId) && isSuspect(f.status)).length;
    d.step = "ocr";
    d.status = "NEEDS_REVIEW";
    d.updatedAt = nowIso();
    return d;
  });
