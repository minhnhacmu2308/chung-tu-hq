// Nghiệp vụ khác – số định danh xin theo lô (mock): cùng luồng backend (Task 4). Dòng SENDING tự có kết quả sau IDENTIFIER_REPLY_MS (lệch nhau
// theo STT để thấy từng dòng về), MST bắt đầu 9 → bị từ chối (như identifier.ts). `clientKey` là batchId: gửi lại cùng khóa trả lô đã có.
import {
  IdentifierBatchRequestSchema, IdentifierListQuerySchema, type IdentifierBatchRequest, type IdentifierDisplayStatus, type IdentifierList,
  type IdentifierListItem, type IdentifierListQuery,
} from "@kb/contracts";
import { ApiError, mutate, newId, nowIso } from "@/lib/mock-request";
import type { MockDb } from "@/mocks/db";
import { reasonApiError } from "@/mocks/reason-error";
import { digits, IDENTIFIER_REPLY_MS, settle } from "./identifier";

export const customsOpsKeys = {
  all: ["customs-ops"] as const,
  identifiers: (q: Partial<IdentifierListQuery>) => ["customs-ops", "identifiers", q] as const,
};

type Row = MockDb["identifiers"][number];

/** Ngày hôm nay theo giờ Việt Nam (UTC+7, không đổi giờ mùa hè). */
const vnToday = (now: number) => new Date(now + 7 * 3_600_000).toISOString().slice(0, 10);
const expiresOf = (r: Row) => (r.identifiedOn ? `${r.identifiedOn.slice(0, 4)}-12-31` : null);

function displayStatus(r: Row, today: string): IdentifierDisplayStatus {
  if (r.status !== "ACCEPTED") return r.status;
  if (r.usedAt) return "USED";
  const exp = expiresOf(r);
  return exp && today > exp ? "EXPIRED" : "AVAILABLE";
}

/** Còn dùng được và hôm nay đã từ 01/12 của năm cấp (≤ 30 ngày tới 31/12). */
const expiringSoon = (r: Row, today: string) => displayStatus(r, today) === "AVAILABLE" && !!r.identifiedOn && today >= `${r.identifiedOn.slice(0, 4)}-12-01`;

const live = (db: MockDb) => (db.identifiers ?? []).filter((r) => r.dossierId === null && !r.deletedAt);
const find = (db: MockDb, id: string) => {
  const r = live(db).find((x) => x.id === id);
  if (!r) throw new ApiError("NOT_FOUND", "Không tìm thấy số định danh");
  return r;
};

function toItem(r: Row, today: string): IdentifierListItem {
  const { doneAt: _t, deletedAt: _d, ...rest } = r;
  const status = displayStatus(r, today);
  return {
    ...rest, batchId: r.batchId ?? null, batchIndex: r.batchIndex ?? null, dossierId: null, usedByDossierId: r.usedByDossierId ?? null, usedAt: r.usedAt ?? null,
    expiresOn: expiresOf(r), expiringSoon: expiringSoon(r, today), displayStatus: status,
  };
}

export const listIdentifiers = (input: Partial<IdentifierListQuery>) =>
  mutate((db): IdentifierList => {
    const q = IdentifierListQuerySchema.parse(input);
    const now = Date.now();
    const today = vnToday(now);
    const rows = live(db);
    for (const r of rows) settle(r, now);
    const needle = q.q?.toLowerCase();
    const hit = rows
      .filter((r) => !q.status || displayStatus(r, today) === q.status)
      .filter((r) => (!q.from || vnToday(Date.parse(r.sentAt)) >= q.from) && (!q.to || vnToday(Date.parse(r.sentAt)) <= q.to))
      .filter((r) => !q.customsOffice || r.request.customsOffice === q.customsOffice)
      .filter((r) => !q.taxCode || r.request.taxCode === q.taxCode)
      .filter((r) => !q.batchId || r.batchId === q.batchId)
      .filter((r) => !needle || [r.identifierNo, r.receiptNo, r.usedByDossierId].some((v) => v?.toLowerCase().includes(needle)))
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt) || (a.batchIndex ?? 0) - (b.batchIndex ?? 0));
    return {
      items: hit.slice(q.offset, q.offset + q.limit).map((r) => toItem(r, today)), total: hit.length, limit: q.limit, offset: q.offset,
      expiringCount: hit.filter((r) => expiringSoon(r, today)).length,
    };
  });

const sending = (r: Row, now: number, i: number) =>
  Object.assign(r, {
    status: "SENDING", refId: newId("ref"), receiptNo: `1192${digits(r.id + r.attempt, 8)}`, receiptDate: vnToday(now), customsState: "11", resultText: null, errors: [],
    sentAt: nowIso(), doneAt: new Date(now + IDENTIFIER_REPLY_MS + i * 400).toISOString(),
  } satisfies Partial<Row>);

export const requestIdentifierBatch = (input: IdentifierBatchRequest) =>
  mutate((db) => {
    const { clientKey, count, request } = IdentifierBatchRequestSchema.parse(input);
    db.identifiers ??= [];
    const had = db.identifiers.filter((r) => r.batchId === clientKey);
    if (had.length) return { batchId: clientKey, ids: had.map((r) => r.id) };
    const now = Date.now();
    const rows = Array.from({ length: count }, (_, i) => {
      const r: Row = {
        id: newId("idn"), dossierId: null, attempt: 1, status: "SENDING", request, refId: null, receiptNo: null, receiptDate: null, customsState: null, identifierNo: null,
        identifiedOn: null, qrPng: null, resultText: null, errors: [], sentAt: nowIso(), doneAt: nowIso(), batchId: clientKey, batchIndex: i + 1, usedByDossierId: null, usedAt: null, deletedAt: null,
      };
      return sending(r, now, i);
    });
    db.identifiers.push(...rows);
    return { batchId: clientKey, ids: rows.map((r) => r.id) };
  });

/** Như backend: chỉ xóa dòng bị từ chối / không phản hồi chưa có số; dòng khác bỏ qua. */
export const deleteIdentifiers = (ids: string[]) =>
  mutate((db) => {
    const deleted: string[] = [];
    for (const r of live(db)) {
      if (!ids.includes(r.id)) continue;
      settle(r, Date.now());
      if ((r.status === "REJECTED" || r.status === "NO_RESPONSE") && !r.identifierNo) {
        r.deletedAt = nowIso();
        deleted.push(r.id);
      }
    }
    return { deleted };
  });

export const retryIdentifier = (id: string) =>
  mutate((db): void => {
    const r = find(db, id);
    if (!r.batchId || (r.status !== "REJECTED" && r.status !== "NO_RESPONSE") || r.identifierNo) throw new ApiError("INVALID_STATE", "Chỉ gửi lại dòng lô bị từ chối hoặc không phản hồi");
    r.attempt += 1;
    sending(r, Date.now(), 0);
  });

/** "Hỏi kết quả" một dòng: chốt ngay bản đang chờ. */
export const pollIdentifierRow = (id: string) =>
  mutate((db): void => {
    const r = find(db, id);
    if ((r.status !== "SENDING" && r.status !== "NO_RESPONSE") || !r.refId) throw new ApiError("INVALID_STATE", "Không có khai báo định danh đang chờ phản hồi");
    if (r.status === "NO_RESPONSE") r.status = "SENDING";
    settle(r, Date.now(), true);
  });

export const takeIdentifier = (id: string, dossierId: string) =>
  mutate((db) => {
    if (!db.dossiers.some((d) => d.id === dossierId)) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
    const r = find(db, id);
    if (!r.identifierNo) throw new ApiError("NOT_FOUND", "Không tìm thấy số định danh");
    if (r.usedByDossierId === dossierId) return { identifierNo: r.identifierNo };
    const status = displayStatus(r, vnToday(Date.now()));
    if (status !== "AVAILABLE") throw reasonApiError("INVALID_STATE", status === "EXPIRED" ? "IDENTIFIER_EXPIRED" : "IDENTIFIER_TAKEN");
    Object.assign(r, { usedAt: nowIso(), usedByDossierId: dossierId });
    return { identifierNo: r.identifierNo };
  });

export const releaseIdentifier = (id: string, dossierId: string) =>
  mutate((db): void => {
    const r = find(db, id);
    if (r.usedByDossierId !== dossierId) throw new ApiError("INVALID_STATE", "Hồ sơ không giữ số định danh này");
    Object.assign(r, { usedAt: null, usedByDossierId: null });
  });
