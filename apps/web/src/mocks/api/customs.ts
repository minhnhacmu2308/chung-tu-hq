// Bước 6: truyền tờ khai qua Customs Hub (mock). Thông điệp sinh sẵn theo dòng thời gian,
// màn hình chỉ thấy thông điệp đã "đến" (at <= bây giờ) → poll để thấy tiến trình.
import { ApiError, mutate, newId, nowIso, query } from "@/lib/mock-request";
import { buildSubmission, CHANNEL_NOTES } from "@/mocks/customs-sim";
import type { MockDb } from "@/mocks/db";
import type {
  CustomsChannel, CustomsMessage, CustomsOperation, CustomsResult, DeclarationStatus, DigitalCertificate, Direction,
} from "@/mocks/types";

export const customsKeys = {
  all: ["customs"] as const,
  submission: (id: string) => ["customs", "submission", id] as const,
  list: ["customs", "list"] as const,
  certificates: ["customs", "certificates"] as const,
};

/** Bước demo trực tiếp: mỗi thông điệp cách nhau 2,5 giây. */
const LIVE_UNIT_MS = 2_500;

export const OPERATION_LABELS: Record<CustomsOperation, string> = {
  IDA: "Khai trước thông tin tờ khai nhập",
  IDC: "Khai chính thức – nhận phân luồng",
  EDA: "Khai trước thông tin tờ khai xuất",
  EDC: "Khai chính thức – nhận phân luồng",
  HYS: "Gửi hồ sơ chứng từ điện tử",
  IEX: "Tham chiếu trạng thái tờ khai",
};

export const opsFor = (direction: Direction): CustomsOperation[] =>
  direction === "NK" ? ["IDA", "IDC", "HYS", "IEX"] : ["EDA", "EDC", "HYS", "IEX"];

const FALLBACK_CERTS = (db: MockDb): DigitalCertificate[] => [
  { id: "cert_vnpt", subject: db.org.name, issuer: "VNPT-CA", serial: "5404FFFEB7033FB316D672201B7B8F3F", validTo: "2027-12-31", isDefault: true },
  { id: "cert_viettel", subject: db.org.name, issuer: "Viettel-CA", serial: "540101093A7C21D1E8B3", validTo: "2026-11-30", isDefault: false },
];

export const listCertificates = () => query((db) => (db.certificates.length ? db.certificates : FALLBACK_CERTS(db)));

/** Cập nhật hồ sơ theo thông điệp đã đến (số tờ khai, phân luồng, thông quan). */
function sync(db: MockDb, now: number) {
  for (const r of db.customsResults) {
    const dossier = db.dossiers.find((d) => d.id === r.dossierId);
    if (!dossier) continue;
    const seen = db.customsMessages.filter((m) => m.dossierId === r.dossierId && new Date(m.at).getTime() <= now);
    if (seen.some((m) => (m.operation === "IDA" || m.operation === "EDA") && m.direction === "IN")) dossier.declarationNo = r.declarationNo;
    if (seen.some((m) => (m.operation === "IDC" || m.operation === "EDC") && m.direction === "IN")) dossier.channel = r.channel;
    const finished = new Date(r.updatedAt).getTime() <= now;
    const target = finished && r.clearanceStatus === "CLEARED" ? "CLEARED" : "SUBMITTED";
    if (dossier.status !== target && (dossier.status === "APPROVED" || dossier.status === "SUBMITTED")) {
      dossier.status = target;
      dossier.updatedAt = nowIso();
    }
  }
}

export type PipelineStatus = "NOT_SENT" | "WAITING" | "SENDING" | "OK" | "ERROR";
export type PipelineRow = { op: CustomsOperation; label: string; status: PipelineStatus; at?: string; summary?: string };

export type SubmissionView = {
  declarationStatus: DeclarationStatus;
  hsUnconfirmed: number;
  started: boolean;
  inProgress: boolean;
  pipeline: PipelineRow[];
  /** Thông điệp đã đến, mới nhất trước. */
  messages: CustomsMessage[];
  result: Partial<CustomsResult> | null;
};

function view(db: MockDb, dossierId: string, now: number): SubmissionView {
  const dossier = db.dossiers.find((d) => d.id === dossierId);
  if (!dossier) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
  const decl = db.declarations.find((d) => d.dossierId === dossierId);
  const all = db.customsMessages.filter((m) => m.dossierId === dossierId).sort((a, b) => a.at.localeCompare(b.at));
  const seen = all.filter((m) => new Date(m.at).getTime() <= now);
  const result = db.customsResults.find((r) => r.dossierId === dossierId);
  const next = all.find((m) => new Date(m.at).getTime() > now);

  const pipeline: PipelineRow[] = opsFor(dossier.direction).map((op) => {
    const mine = seen.filter((m) => m.operation === op);
    const last = mine[mine.length - 1];
    const label = OPERATION_LABELS[op];
    if (!last) {
      const sending = next?.operation === op;
      return { op, label, status: all.some((m) => m.operation === op) ? (sending ? "SENDING" : "WAITING") : "NOT_SENT" };
    }
    const awaitingReply = (op === "IDA" || op === "IDC" || op === "EDA" || op === "EDC") && !mine.some((m) => m.direction === "IN");
    const retrying = last.result === "ERROR" && next?.operation === op;
    const status: PipelineStatus = awaitingReply || retrying ? "SENDING" : last.result === "ERROR" ? "ERROR" : last.result === "PENDING" ? "SENDING" : "OK";
    return { op, label, status, at: last.at, summary: last.summary };
  });

  let partial: Partial<CustomsResult> | null = null;
  if (result && seen.length) {
    const has = (ops: CustomsOperation[]) => seen.some((m) => ops.includes(m.operation) && m.direction === "IN");
    const finished = new Date(result.updatedAt).getTime() <= now;
    const lastIex = [...seen].reverse().find((m) => m.operation === "IEX" && m.direction === "IN");
    partial = {
      dossierId,
      ...(has(["IDA", "EDA"]) ? { declarationNo: result.declarationNo } : {}),
      ...(has(["IDC", "EDC"]) ? { channel: result.channel, channelNote: result.channelNote, customsTaxVnd: result.customsTaxVnd } : {}),
      ...(lastIex ? { clearanceStatus: lastIex.summary.includes("Đã thông quan") ? "CLEARED" : "INSPECTING" } : finished ? { clearanceStatus: result.clearanceStatus } : { clearanceStatus: "WAITING" }),
      updatedAt: seen[seen.length - 1]!.at,
    };
  }

  return {
    declarationStatus: decl?.status ?? "NOT_CREATED",
    hsUnconfirmed: db.lineItems.filter((i) => i.dossierId === dossierId && !i.hsConfirmed).length,
    started: all.length > 0,
    inProgress: Boolean(next),
    pipeline,
    messages: [...seen].reverse(),
    result: partial,
  };
}

export const getSubmission = (dossierId: string) =>
  mutate((db) => {
    const now = Date.now();
    sync(db, now);
    return view(db, dossierId, now);
  });

/** Truyền tờ khai: chặn khi chưa phê duyệt / còn HS chưa xác nhận / đã truyền. */
export const submitDeclaration = (dossierId: string, certificateId: string) =>
  mutate((db) => {
    const dossier = db.dossiers.find((d) => d.id === dossierId);
    const decl = db.declarations.find((d) => d.dossierId === dossierId);
    if (!dossier || !decl) throw new ApiError("NOT_FOUND", "Chưa có tờ khai");
    if (decl.status !== "APPROVED") throw new ApiError("NOT_APPROVED", "Tờ khai chưa được phê duyệt");
    if (db.lineItems.some((i) => i.dossierId === dossierId && !i.hsConfirmed)) throw new ApiError("HS_UNCONFIRMED", "Còn mã HS chưa xác nhận");
    if (db.customsMessages.some((m) => m.dossierId === dossierId)) throw new ApiError("ALREADY_SUBMITTED", "Tờ khai đã được truyền – không gửi trùng");
    if (!certificateId) throw new ApiError("NO_CERT", "Chọn chứng thư số để ký");
    const docs = db.documents.filter((d) => d.dossierId === dossierId).length;
    const { messages, result } = buildSubmission(dossier, decl, db.org.taxCode, Date.now() + 600, LIVE_UNIT_MS, { documentCount: docs || 3 });
    db.customsMessages.push(...messages);
    db.customsResults = db.customsResults.filter((r) => r.dossierId !== dossierId).concat(result);
    decl.status = "SUBMITTED";
    Object.assign(dossier, { status: "SUBMITTED", step: "submit", updatedAt: nowIso() });
  });

/**
 * Gửi lại một nghiệp vụ. Nguyên tắc chống gửi trùng (ADR 0005): luôn tra IEX trước,
 * chỉ gửi lại khi Hải quan chưa ghi nhận.
 */
export const resendOperation = (dossierId: string, op: CustomsOperation) =>
  mutate((db) => {
    const dossier = db.dossiers.find((d) => d.id === dossierId);
    const result = db.customsResults.find((r) => r.dossierId === dossierId);
    if (!dossier || !result) throw new ApiError("NOT_FOUND", "Hồ sơ chưa truyền");
    const t = Date.now();
    const msg = (o: CustomsOperation, dir: "OUT" | "IN", summary: string, offset: number, payload: Record<string, unknown>): CustomsMessage => ({
      id: newId("msg"),
      dossierId,
      operation: o,
      direction: dir,
      result: "OK",
      summary,
      at: new Date(t + offset).toISOString(),
      payloadPreview: JSON.stringify({ nghiepVu: o, soToKhai: result.declarationNo, ...payload }, null, 2),
    });
    const status = result.clearanceStatus === "CLEARED" ? "Đã thông quan" : "Đang kiểm tra";
    const added: CustomsMessage[] = [msg("IEX", "OUT", "Tra cứu trạng thái trước khi gửi lại", 0, { yeuCau: "Tra cứu" })];
    if (op === "IEX") {
      added.push(msg("IEX", "IN", `Trạng thái tờ khai: ${status}`, 1_500, { trangThai: status }));
    } else {
      added.push(msg("IEX", "IN", `Chưa ghi nhận ${op} mới nhất – được phép gửi lại (trạng thái: ${status})`, 1_200, { trangThai: status }));
      added.push(msg(op, "OUT", `Gửi lại ${OPERATION_LABELS[op].toLowerCase()}`, 2_400, { lanGui: 2 }));
    }
    db.customsMessages.push(...added);
    return { resent: op !== "IEX", message: op === "IEX" ? `Trạng thái: ${status}` : `Đang gửi lại ${OPERATION_LABELS[op].toLowerCase()}` };
  });

export type CustomsRow = {
  dossierId: string;
  dossierCode: string;
  direction: Direction;
  partner: string;
  typeCode: string;
  lastOperation?: CustomsOperation;
  declarationNo?: string;
  channel?: CustomsChannel;
  channelNote?: string;
  state: "READY" | "SENDING" | "INSPECTING" | "CLEARED";
  customsTaxVnd?: string;
  updatedAt: string;
};

/** Danh sách tờ khai đã duyệt / đang / đã truyền cho màn "Khai báo Hải quan". */
export const listCustomsDeclarations = () =>
  mutate((db): CustomsRow[] => {
    const now = Date.now();
    sync(db, now);
    return db.declarations
      .filter((d) => d.status === "APPROVED" || d.status === "SUBMITTED")
      .map((decl) => {
        const d = db.dossiers.find((x) => x.id === decl.dossierId)!;
        const v = view(db, d.id, now);
        const last = v.messages[0];
        const state: CustomsRow["state"] = !v.started ? "READY" : v.inProgress ? "SENDING" : v.result?.clearanceStatus === "CLEARED" ? "CLEARED" : "INSPECTING";
        return {
          dossierId: d.id,
          dossierCode: d.code,
          direction: d.direction,
          partner: d.partner,
          typeCode: d.typeCode,
          state,
          updatedAt: last?.at ?? decl.approvedAt ?? d.updatedAt,
          ...(last ? { lastOperation: last.operation } : {}),
          ...(v.result?.declarationNo ? { declarationNo: v.result.declarationNo } : {}),
          ...(v.result?.channel ? { channel: v.result.channel, channelNote: CHANNEL_NOTES[v.result.channel] } : {}),
          ...(v.result?.customsTaxVnd ? { customsTaxVnd: v.result.customsTaxVnd } : {}),
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
