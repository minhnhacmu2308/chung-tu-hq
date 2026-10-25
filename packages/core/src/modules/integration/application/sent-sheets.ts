// Guard tờ chưa gọi về không được đổi (spec tách tờ khai IDC/gọi về §2.5): nội dung hiện tại của tờ khai so với ảnh chụp đã gửi (raw.sent) của
// từng tờ còn hiệu lực ở Hải quan. Dùng chung duyệt (port declaration.sentSheetsGuard), truyền (submit / perform / chuỗi nối tiếp) và màn Truyền.
import { SentSnapshotSchema, type EditSheet, type SentSnapshot } from "@kb/contracts";
import type { DomainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { sentSheetsError, type SentSheet } from "../domain/branches.js";
import type { DeclarationPayload } from "../domain/declaration-to-fpt.js";
import { stageOf } from "../domain/state-machine.js";
import type { CustomsDeps, ResultRow } from "./customs-ports.js";

/** Ảnh chụp đã gửi của tờ (jsonb → parse Zod, bất biến 9); không có / hỏng → null (tờ còn hiệu lực khi đó coi là không kiểm được). */
export const sentOf = (r: Pick<ResultRow, "raw">): SentSnapshot | null => parseSent(r.raw?.sent);
/** Ảnh chụp trong outbox / jsonb (dữ liệu từ ngoài) → parse Zod; sai dạng → null. */
export function parseSent(v: unknown): SentSnapshot | null {
  const p = SentSnapshotSchema.safeParse(v);
  return p.success ? p.data : null;
}

export const sentSheetsOf = (results: Pick<ResultRow, "branch" | "declarationNo" | "state" | "raw">[]): SentSheet[] =>
  results.map((r) => ({ no: r.branch, stage: stageOf(r), declarationNo: r.declarationNo, sent: sentOf(r) }));

/** Lô nhiều tờ (theo kết quả đã lập): tờ còn hiệu lực có nội dung khác nội dung đã gửi → SENT_SHEETS_CHANGED; lô một tờ → null. */
export const resultsSentError = (p: DeclarationPayload, results: Pick<ResultRow, "branch" | "declarationNo" | "state" | "raw">[]): DomainError | null =>
  sentSheetsError(p, sentSheetsOf(results));

/** Port `declaration.sentSheetsGuard` (container nối): tờ khai hiện tại so với nội dung các tờ Hải quan đang giữ. Chưa có tờ khai / chưa truyền → null. */
export async function checkSentSheets(deps: Pick<CustomsDeps, "declarations" | "uow">, orgId: string, dossierId: string): Promise<DomainError | null> {
  const results = await deps.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.results.listForDossier(orgId, dossierId));
  if (results.length <= 1) return null;
  const snap = await deps.declarations.get(orgId, dossierId);
  return snap ? resultsSentError(snap.payload, results) : null;
}

/** Port `customsSheets` của declaration / extraction / dossier (container nối): các tờ đã lập ở Hải quan (số, giai đoạn, số tờ khai) – phạm vi sửa theo tờ đã gọi về. */
export async function customsEditSheets(deps: Pick<CustomsDeps, "uow">, orgId: string, dossierId: string): Promise<EditSheet[]> {
  const results = await deps.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.results.listForDossier(orgId, dossierId));
  return results.map((r) => ({ no: r.branch, stage: stageOf(r), declarationNo: r.declarationNo })).sort((a, b) => a.no - b.no);
}
