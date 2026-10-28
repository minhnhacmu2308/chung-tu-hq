// Bước 2–3: chứng từ của hồ sơ (upload, phân loại, đọc) + kết quả trích xuất và đối chiếu chéo (mock).
// Mô phỏng tiến trình bằng thời gian: mỗi chứng từ đi UPLOADING → QUEUED → READING → DONE tính từ lúc bắt đầu;
// màn hình gọi lại (refetchInterval) để thấy tiến độ. Có backend → SSE/polling trạng thái job thật.
import { incotermOf, type DocumentSheet } from "@kb/contracts";
import { ApiError, mutate, newId, nowIso, query } from "@/lib/mock-request";
import type { MockDb } from "@/mocks/db";
import { documentSetMockError, editScopeMockError } from "./customs";
import { refreshDeclaration } from "./declaration";
import { generateChecks, generateFieldsForDocument, SUSPECT_STATUSES } from "@/mocks/seed/ocr";
import { syncFreightTermCheck } from "@/mocks/freight-term";
import type { CrossCheck, DocKind, DossierDocument, ExtractedField, FieldStatus } from "@/mocks/types";

export const ocrKeys = {
  documents: (dossierId: string) => ["ocr", "documents", dossierId] as const,
  fields: (dossierId: string) => ["ocr", "fields", dossierId] as const,
  checks: (dossierId: string) => ["ocr", "checks", dossierId] as const,
  sheets: (dossierId: string) => ["ocr", "document-sheets", dossierId] as const,
  file: (documentId: string) => ["ocr", "file", documentId] as const,
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
export const uploadDocuments = (dossierId: string, uploaded: File[]) =>
  mutate((db) => addDocumentFiles(db, dossierId, uploaded.map((f) => ({ name: f.name, size: f.size }))));

/** Thêm file vào hồ sơ như upload tay (dùng chung cho upload và "Thêm vào hồ sơ" từ Hộp thư chứng từ). */
export function addDocumentFiles(db: MockDb, dossierId: string, files: { name: string; size: number }[]): DossierDocument[] {
  const dossier = db.dossiers.find((d) => d.id === dossierId);
  if (!dossier) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
  // Thêm chứng từ đổi dòng hàng + chỉ tiêu chung → lô nhiều tờ còn tờ chưa gọi về: chặn (cùng quy tắc backend).
  const scoped = documentSetMockError(db, dossierId);
  if (scoped) throw scoped;
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
}

export const changeDocumentKind = (documentId: string, kind: DocKind) =>
  mutate((db) => {
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc) throw new ApiError("NOT_FOUND", "Không tìm thấy chứng từ");
    const scoped = documentSetMockError(db, doc.dossierId);
    if (scoped) throw scoped;
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
    const scoped = documentSetMockError(db, doc.dossierId);
    if (scoped) throw scoped;
    db.documents = db.documents.filter((d) => d.id !== documentId);
    db.fields = db.fields.filter((f) => f.documentId !== documentId);
    startedAt.delete(documentId);
    rerunChecks(db, doc.dossierId);
  });

/** File gốc của chứng từ. Bản mock chỉ giữ tên + dung lượng (không có file thật) → null, màn hình dựng lại trang từ dữ liệu. */
export const getDocumentFile = (_documentId: string) => query((): { url: string; expiresAt: string } | null => null);

/** Đọc lại chứng từ lỗi. */
export const retryDocument = (documentId: string) =>
  mutate((db) => {
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc) return;
    const scoped = documentSetMockError(db, doc.dossierId, false);
    if (scoped) throw scoped;
    doc.status = "QUEUED";
    delete doc.error;
    startedAt.delete(documentId);
  });

/* ---------------- Trường trích xuất & đối chiếu ---------------- */

/** Bản mock: dựng bảng đọc từ các trường mẫu của từng chứng từ (bản thật theo danh mục trường chuẩn). */
export const listDocumentSheets = (dossierId: string) =>
  query((db): DocumentSheet[] =>
    db.documents
      .filter((d) => d.dossierId === dossierId && d.status === "DONE")
      .map((d) => ({
        documentId: d.id, fileName: d.fileName, kind: d.kind,
        rows: db.fields.filter((f) => f.documentId === d.id).map((f, i) => ({ stt: i + 1, key: f.key, label: f.label, value: f.value })),
      })),
  );
export async function downloadDocumentSheets(dossierId: string): Promise<Blob> {
  const sheets = await listDocumentSheets(dossierId);
  const { buildDocumentSheetsWorkbook } = await import("@/lib/document-sheets-xlsx");
  return new Blob([await buildDocumentSheetsWorkbook(sheets)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

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

/**
 * Ô Điều kiện giao hàng của hóa đơn đổi → điều kiện giao hàng của hồ sơ đổi theo (backend: shipment.invoice.incoterm), rồi tính lại luật
 * R-FREIGHT-TERM; ô Điều kiện cước của vận đơn đổi → chỉ tính lại luật.
 */
function syncTerms(db: MockDb, f: ExtractedField) {
  const doc = db.documents.find((d) => d.id === f.documentId);
  const dossier = doc && db.dossiers.find((d) => d.id === doc.dossierId);
  if (!dossier) return;
  if (f.key === "incoterm" && doc.kind === "INVOICE") {
    const code = incotermOf(f.value);
    if (code) dossier.incoterm = code;
  }
  if (f.key === "incoterm" || f.key === "freight_terms" || f.key === "freight_term") syncFreightTermCheck(db, dossier.id);
}

/** Người dùng sửa giá trị → USER_CONFIRMED, giữ originalValue (bản thật ghi field_audit). */
const ITEM_FIELD = /^item\.(\d+)\.(description|quantity|unit|unit_price|amount|origin)$/;
/**
 * Ô dòng hàng trên chứng từ đổi giá trị → cập nhật dòng hàng cùng số dòng (giữ HS đã xác nhận, ô người khai nhập theo id dòng) và dựng lại tờ khai nháp
 * – giống backend (extraction → declaration.refreshFromShipment).
 */
function syncLineItem(db: MockDb, f: ExtractedField) {
  const m = ITEM_FIELD.exec(f.key);
  const doc = db.documents.find((d) => d.id === f.documentId);
  if (!m || !doc) return;
  const line = db.lineItems.find((i) => i.dossierId === doc.dossierId && i.lineNo === Number(m[1]));
  if (!line) return;
  const v = f.value.trim();
  if (m[2] === "description") line.description = v;
  else if (m[2] === "quantity") line.quantity = v.split(/\s+/)[0] ?? line.quantity;
  else if (m[2] === "unit") line.unit = v.toUpperCase();
  else if (m[2] === "unit_price") line.unitPrice = v;
  else if (m[2] === "amount") line.amount = v;
  else if (/^[A-Za-z]{2}$/.test(v)) line.origin = v.toUpperCase();
  refreshDeclaration(db, doc.dossierId);
}

/** Ô dòng hàng (`item.<lineNo>.<ô>`) theo tờ của dòng; trường header / không xác định được dòng → chỉ tiêu chung (cùng quy tắc backend). */
function fieldScopeError(db: MockDb, f: ExtractedField): ApiError | null {
  const doc = db.documents.find((d) => d.id === f.documentId);
  if (!doc) return null;
  const m = /^item\.(\d+)\./.exec(f.key);
  const lineNo = m ? Number(m[1]) : NaN;
  const known = db.lineItems.some((i) => i.dossierId === doc.dossierId && i.lineNo === lineNo);
  return editScopeMockError(db, doc.dossierId, known ? { kind: "LINE_NO", lineNo } : { kind: "COMMON" });
}

export const updateFieldValue = (fieldId: string, value: string) =>
  mutate((db): ExtractedField => {
    const f = db.fields.find((x) => x.id === fieldId);
    if (!f) throw new ApiError("NOT_FOUND", "Không tìm thấy trường");
    const scoped = fieldScopeError(db, f);
    if (scoped) throw scoped;
    f.value = value.trim();
    f.status = "USER_CONFIRMED";
    f.confirmedBy = db.currentUserId;
    f.confirmedAt = nowIso();
    syncSuspectCount(db, f.documentId);
    syncLineItem(db, f);
    syncTerms(db, f);
    return f;
  });

/** Bấm "Đúng": xác nhận giá trị AI đọc. */
export const confirmField = (fieldId: string) =>
  mutate((db): ExtractedField => {
    const f = db.fields.find((x) => x.id === fieldId);
    if (!f) throw new ApiError("NOT_FOUND", "Không tìm thấy trường");
    const scoped = fieldScopeError(db, f);
    if (scoped) throw scoped;
    f.status = "USER_CONFIRMED";
    f.confirmedBy = db.currentUserId;
    f.confirmedAt = nowIso();
    syncSuspectCount(db, f.documentId);
    return f;
  });

/** Hoàn tác về giá trị AI đọc ban đầu. */
export const revertField = (fieldId: string) =>
  mutate((db): ExtractedField => {
    const f = db.fields.find((x) => x.id === fieldId);
    if (!f) throw new ApiError("NOT_FOUND", "Không tìm thấy trường");
    const scoped = fieldScopeError(db, f);
    if (scoped) throw scoped;
    f.value = f.originalValue;
    f.status = "MODEL_UNSURE";
    delete f.confirmedBy;
    delete f.confirmedAt;
    syncSuspectCount(db, f.documentId);
    syncLineItem(db, f);
    syncTerms(db, f);
    return f;
  });

/** Đọc xong bộ chứng từ → hồ sơ sang bước OCR & kiểm tra, trạng thái "Cần kiểm tra" (hoặc thẳng tới agent nếu không còn gì nghi ngờ vẫn để người dùng xem). */
export const finishReading = (dossierId: string) =>
  mutate((db) => {
    const d = db.dossiers.find((x) => x.id === dossierId);
    if (!d) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
    const scoped = editScopeMockError(db, dossierId, { kind: "COMMON" });
    if (scoped) throw scoped;
    const docs = db.documents.filter((x) => x.dossierId === dossierId);
    if (docs.some((x) => x.status !== "DONE" && x.status !== "ERROR")) throw new ApiError("NOT_READY", "Còn chứng từ đang đọc");
    const ids = new Set(docs.map((x) => x.id));
    d.suspectFields = db.fields.filter((f) => ids.has(f.documentId) && isSuspect(f.status)).length;
    d.step = "ocr";
    d.status = "NEEDS_REVIEW";
    d.updatedAt = nowIso();
    return d;
  });
