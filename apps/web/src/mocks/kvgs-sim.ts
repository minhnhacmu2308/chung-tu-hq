// Qua khu vực giám sát (mock): trạng thái danh sách container / bảng kê KVGS theo thời gian giả lập. Chỉ phụ thuộc dữ liệu db (không import api/customs → không vòng).
// Gửi → SENDING, Hải quan (giả lập) trả lời sau KVGS_REPLY_MS; settleKvgs chốt các phản hồi đã đến (gọi lúc đọc, như settle của customs).
import { containerListRequired, normalizeContainerNo, type ContainerListRow, type ContainerListStatus, type CustomsErrorItem, type KvgsFlowState, type KvgsSheet } from "@kb/contracts";
import type { MockDb } from "@/mocks/db";
import type { Dossier } from "@/mocks/types";

/** Hải quan (mô phỏng) trả lời danh sách container / bảng kê KVGS sau ~3 giây. */
export const KVGS_REPLY_MS = 3_000;

type Reply = { doneAt: string | null; outcome: "ACCEPTED" | "REJECTED" | null };
type Receipt = { refId: string | null; receiptNo: string | null; receiptDate: string | null; errors: CustomsErrorItem[] };

export type MockContainerList = Reply & Receipt & { id: string; dossierId: string; branch: number; attempt: number; status: ContainerListStatus; rows: ContainerListRow[]; sentAt: string | null };
export type MockKvgsFetch = Reply & Receipt & { id: string; dossierId: string; branch: number; status: ContainerListStatus; requestedAt: string; fetchedAt: string | null; sheet: KvgsSheet | null };
export type MockKvgs = { lists: MockContainerList[]; fetches: MockKvgsFetch[] };

export const emptyKvgs = (): MockKvgs => ({ lists: [], fetches: [] });

export const latestList = (db: MockDb, dossierId: string, branch: number): MockContainerList | undefined =>
  (db.kvgs?.lists ?? []).filter((l) => l.dossierId === dossierId && l.branch === branch).sort((a, b) => a.attempt - b.attempt).at(-1);

export const latestFetch = (db: MockDb, dossierId: string, branch: number): MockKvgsFetch | undefined =>
  (db.kvgs?.fetches ?? []).filter((f) => f.dossierId === dossierId && f.branch === branch).at(-1);

/** Seal bắt đầu `REJECT` → Hải quan từ chối dòng đó (kịch bản thử lỗi như fpt-mock). */
export const isRejectSeal = (sealNo: string) => /^REJECT/i.test(sealNo.trim());

/** Phản hồi đã đến → áp trạng thái cuối (ACCEPTED hoặc REJECTED kèm lỗi theo dòng). */
export function settleKvgs(db: MockDb, now: number): void {
  const k = (db.kvgs ??= emptyKvgs());
  for (const l of k.lists) {
    if (l.status !== "SENDING" || !l.doneAt || Date.parse(l.doneAt) > now) continue;
    l.status = l.outcome ?? "ACCEPTED";
    if (l.outcome === "REJECTED") l.receiptNo = null;
  }
  for (const f of k.fetches) {
    if (f.status !== "SENDING" || !f.doneAt || Date.parse(f.doneAt) > now) continue;
    f.status = f.outcome ?? "ACCEPTED";
    f.fetchedAt = f.doneAt;
  }
}

/** Trạng thái KVGS đưa vào operationAvailability (customs-flow): có phải khai danh sách container, đã được chấp nhận chưa, đã lấy bảng kê chưa. */
export function kvgsFlowOf(db: MockDb, dossier: Dossier, branch: number): KvgsFlowState {
  settleKvgs(db, Date.now());
  const required = containerListRequired(dossier.direction, dossier.transportMode);
  return {
    containerListRequired: required,
    containerListAccepted: latestList(db, dossier.id, branch)?.status === "ACCEPTED",
    kvgsDone: (db.kvgs?.fetches ?? []).some((f) => f.dossierId === dossier.id && f.branch === branch && f.status === "ACCEPTED"),
  };
}

const CONTAINER_NO = /[A-Z]{4}\d{7}/;

/** Điền sẵn bảng container từ vận đơn đã đọc: trường `container*` dạng "SỐ / loại / SEAL"; một container một dòng, seal lấy giá trị khác rỗng đầu tiên. */
export function prefillRowsOf(db: MockDb, dossierId: string): ContainerListRow[] {
  const rows = new Map<string, ContainerListRow>();
  for (const doc of db.documents.filter((x) => x.dossierId === dossierId && x.kind === "BILL_OF_LADING")) {
    const fields = db.fields.filter((f) => f.documentId === doc.id);
    const billNo = fields.find((f) => f.key === "bl_no")?.value.trim() ?? "";
    for (const f of fields.filter((x) => /^container(\.\d+)?$/.test(x.key))) {
      const [rawNo = "", , seal = ""] = f.value.split("/").map((s) => s.trim());
      const containerNo = normalizeContainerNo(rawNo);
      if (!CONTAINER_NO.test(containerNo)) continue;
      const cur = rows.get(containerNo);
      if (cur) {
        if (!cur.sealNo && seal) cur.sealNo = seal;
      } else {
        rows.set(containerNo, { billNo, containerNo, sealNo: seal, note: "", source: "OCR", sourceDocumentId: doc.id, ...(f.region?.page ? { sourcePage: f.region.page } : {}) });
      }
    }
  }
  return [...rows.values()];
}
