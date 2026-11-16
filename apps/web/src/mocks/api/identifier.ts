// Khai báo định danh hàng hóa (mock): cùng luồng backend – Gửi → SENDING, Hải quan (giả lập) trả kết quả sau IDENTIFIER_REPLY_MS (cổng FPT thật
// trả ngay trong lời gọi, worker mất vài chục giây). Như cổng thật lúc Hải quan chưa xử lý xong: vừa gửi đã có REF_ID + số tiếp nhận (tranG_THAI 11),
// chưa có số định danh → panel cho "Hỏi kết quả". MST bắt đầu bằng 9 → Hải quan từ chối (thử nhánh lỗi). "Hỏi kết quả" chốt ngay bản đang chờ.
import { IdentifierRequestSchema, type IdentifierRequest, type IdentifierView } from "@kb/contracts";
import { ApiError, mutate, newId, nowIso } from "@/lib/mock-request";
import type { MockDb } from "@/mocks/db";
import { MOCK_BARCODE_PNG } from "@/mocks/kvgs-sim";
import { reasonApiError } from "@/mocks/reason-error";

export const IDENTIFIER_REPLY_MS = 2_500;

export const identifierKeys = {
  all: ["identifier"] as const,
  detail: (dossierId: string) => ["identifier", dossierId] as const,
};

type MockIdentifier = MockDb["identifiers"][number];

const assertDossier = (db: MockDb, id: string) => {
  if (!db.dossiers.some((x) => x.id === id)) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
};
const latestOf = (db: MockDb, dossierId: string): MockIdentifier | undefined =>
  (db.identifiers ?? []).filter((x) => x.dossierId === dossierId).sort((a, b) => b.attempt - a.attempt)[0];

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const digits = (seed: string, n: number) => String(Array.from(seed).reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 10 ** n, 7)).padStart(n, "0");

/** Chốt kết quả của bản đang chờ (giống phản hồi V5IdentifierReq thật: số định danh, QR, câu kết quả). */
function settle(x: MockIdentifier, now: number, force = false) {
  if (x.status !== "SENDING" || (!force && Date.parse(x.doneAt) > now)) return;
  const day = new Date(now + 7 * 3_600_000).toISOString().slice(0, 10);
  const receipt = { receiptNo: x.receiptNo ?? `1192${digits(x.id, 8)}`, receiptDate: x.receiptDate ?? day };
  if (x.request.taxCode.startsWith("9")) {
    // kb-allow-raw: câu Hải quan trả về (dữ liệu nghiệp vụ tiếng Việt như phản hồi VNACCS)
    const message = "Doanh nghiệp không đủ điều kiện cấp số định danh";
    Object.assign(x, { ...receipt, status: "REJECTED", customsState: "10", resultText: message, errors: [{ code: "E-IDENT-REJ", field: "MA_DV", message, solution: "Kiểm tra mã số thuế" }] });
    return;
  }
  const no = `1226${digits(x.request.taxCode + x.id, 11)}`;
  // kb-allow-raw: câu Hải quan trả về (dữ liệu nghiệp vụ tiếng Việt như phản hồi VNACCS)
  const resultText = `Số định danh là [${no}], ngày định danh [${ddmmyyyy(day)}]!`;
  Object.assign(x, { ...receipt, status: "ACCEPTED", customsState: "15", identifierNo: no, identifiedOn: day, qrPng: MOCK_BARCODE_PNG, resultText, errors: [] });
}

const viewOf = (db: MockDb, dossierId: string): IdentifierView => {
  const x = latestOf(db, dossierId);
  if (!x) return { dossierId, latest: null };
  const { id: _id, dossierId: _d, doneAt: _t, ...latest } = x;
  return { dossierId, latest };
};

export const getIdentifier = (dossierId: string) =>
  mutate((db) => {
    assertDossier(db, dossierId);
    const x = latestOf(db, dossierId);
    if (x) settle(x, Date.now());
    return viewOf(db, dossierId);
  });

export const sendIdentifier = (dossierId: string, input: IdentifierRequest) =>
  mutate((db) => {
    assertDossier(db, dossierId);
    const request = IdentifierRequestSchema.parse(input);
    db.identifiers ??= [];
    const cur = latestOf(db, dossierId);
    if (cur) settle(cur, Date.now());
    if (cur?.status === "SENDING") throw reasonApiError("INVALID_STATE", "KVGS_ALREADY_SENDING");
    const now = Date.now();
    const id = newId("idn");
    const today = new Date(now + 7 * 3_600_000).toISOString().slice(0, 10);
    db.identifiers.push({
      id, dossierId, attempt: (cur?.attempt ?? 0) + 1, status: "SENDING", request, refId: newId("ref"), receiptNo: `1192${digits(id, 8)}`, receiptDate: today, customsState: "11",
      identifierNo: null, identifiedOn: null, qrPng: null, resultText: null, errors: [], sentAt: nowIso(), doneAt: new Date(now + IDENTIFIER_REPLY_MS).toISOString(),
    });
    return viewOf(db, dossierId);
  });

export const pollIdentifier = (dossierId: string) =>
  mutate((db) => {
    assertDossier(db, dossierId);
    const x = latestOf(db, dossierId);
    if (!x || (x.status !== "SENDING" && x.status !== "NO_RESPONSE")) throw new ApiError("INVALID_STATE", "Không có khai báo định danh đang chờ phản hồi");
    if (x.status === "NO_RESPONSE") x.status = "SENDING";
    settle(x, Date.now(), true);
    return viewOf(db, dossierId);
  });
