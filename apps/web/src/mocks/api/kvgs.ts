// Qua khu vực giám sát (mock): danh sách container (khai trước) + bảng kê KVGS (lấy sau thông quan). Cùng luật @kb/contracts với backend:
// điều kiện luồng (customs-flow), checkContainerList trước khi gửi, khóa khi đang gửi / đã chấp nhận. Hải quan (giả lập) trả lời sau KVGS_REPLY_MS.
import {
  checkContainerList, containerListRequired, normalizeContainerNo, operationsFor, type ContainerListIssue, type ContainerListRow, type CustomsErrorItem, type KvgsSheet, type KvgsView, type SaveContainerListInput,
} from "@kb/contracts";
import { ApiError, mutate, newId, nowIso } from "@/lib/mock-request";
import type { MockDb } from "@/mocks/db";
import { CHANNEL_VI, containersFor } from "@/mocks/customs-sim";
import { emptyKvgs, isRejectSeal, KVGS_REPLY_MS, latestFetch, latestList, prefillRowsOf, settleKvgs, type MockContainerList, type MockKvgsFetch } from "@/mocks/kvgs-sim";
import { reasonApiError } from "@/mocks/reason-error";
import type { Dossier } from "@/mocks/types";
import { kvgsHeaderOf, kvgsOperationBlock } from "./customs";

export const kvgsKeys = {
  all: ["kvgs"] as const,
  detail: (dossierId: string, branch: number) => ["kvgs", dossierId, branch] as const,
};

const dossierOf = (db: MockDb, id: string): Dossier => {
  const d = db.dossiers.find((x) => x.id === id);
  if (!d) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
  return d;
};

/** Không có tờ khai nhánh `branch` → NOT_FOUND (như loadScope của backend). */
const assertBranch = (db: MockDb, dossierId: string, branch: number) => {
  const sheets = new Set(db.lineItems.filter((i) => i.dossierId === dossierId).map((i) => Math.ceil(i.lineNo / 50)));
  if (branch > Math.max(1, sheets.size)) throw new ApiError("NOT_FOUND", `Không có tờ khai ${branch}`);
};

const describeIssues = (issues: ContainerListIssue[]) => issues.map((i) => `${i.row === 0 ? "bảng" : `dòng ${i.row}`} ${i.field} ${i.code}`).join(", ");
const clean = (rows: ContainerListRow[]): ContainerListRow[] => rows.map((r) => ({ ...r, containerNo: normalizeContainerNo(r.containerNo) }));
const receiptNoOf = (id: string): string => String(100_000_000_000 + (Array.from(id).reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 900_000_000_000, 7) % 900_000_000_000));

/** Lỗi Hải quan (giả lập) theo dòng: seal bắt đầu REJECT → từ chối dòng đó, `line` = số thứ tự dòng. */
const rejectErrors = (rows: ContainerListRow[]): CustomsErrorItem[] =>
  rows.flatMap((r, i): CustomsErrorItem[] => (isRejectSeal(r.sealNo) ? [{ code: "V5-SEAL", message: `Số seal ${r.sealNo} không hợp lệ`, solution: "Kiểm tra lại số seal trên vận đơn và khai lại", field: "SEL_SO", line: i + 1 }] : []));

const newList = (dossierId: string, branch: number, attempt: number, rows: ContainerListRow[]): MockContainerList => ({
  id: newId("cls"), dossierId, branch, attempt, status: "DRAFT", rows, refId: null, receiptNo: null, receiptDate: null, errors: [], sentAt: null, doneAt: null, outcome: null,
});

function settleAll(db: MockDb) {
  db.kvgs ??= emptyKvgs();
  settleKvgs(db, Date.now());
  for (const l of db.kvgs.lists) {
    if (l.status === "ACCEPTED" && !l.receiptNo) Object.assign(l, { receiptNo: receiptNoOf(l.id), receiptDate: (l.doneAt ?? nowIso()).slice(0, 10) });
    if (l.status === "REJECTED" && l.errors.length === 0) l.errors = rejectErrors(l.rows);
  }
  for (const f of db.kvgs.fetches) if (f.status === "ACCEPTED" && !f.receiptNo) Object.assign(f, { receiptNo: receiptNoOf(f.id), receiptDate: (f.doneAt ?? nowIso()).slice(0, 10) });
}

const listView = (l: MockContainerList): NonNullable<KvgsView["containerList"]> => ({
  attempt: l.attempt, status: l.status, rows: l.rows, refId: l.refId, receiptNo: l.receiptNo, receiptDate: l.receiptDate, errors: l.errors, sentAt: l.sentAt,
});
const fetchView = (f: MockKvgsFetch): NonNullable<KvgsView["kvgs"]> => ({
  status: f.status, refId: f.refId, receiptNo: f.receiptNo, receiptDate: f.receiptDate, errors: f.errors, fetchedAt: f.fetchedAt, sheet: f.status === "ACCEPTED" ? f.sheet : null,
});

function viewOf(db: MockDb, dossierId: string, branch: number): KvgsView {
  settleAll(db);
  const dossier = dossierOf(db, dossierId);
  const required = containerListRequired(dossier.direction, dossier.transportMode);
  const list = required ? latestList(db, dossierId, branch) : undefined;
  const fetched = latestFetch(db, dossierId, branch);
  const head = kvgsHeaderOf(db, dossierId, branch);
  const decl = db.declarations.find((d) => d.dossierId === dossierId);
  return {
    dossierId, branch,
    applies: { containerList: required, kvgs: operationsFor(dossier.direction).includes("KVGS") },
    containerList: list ? listView(list) : null,
    kvgs: fetched ? fetchView(fetched) : null,
    header: {
      declarationNo: head.declarationNo, typeCode: dossier.typeCode || null, customsOffice: dossier.customsOffice.split(" ")[0] || null, registeredOn: head.registeredOn,
      companyName: decl?.fields.find((f) => f.code === (dossier.direction === "NK" ? "NNK_TEN" : "NXK_TEN"))?.value ?? db.org.name,
    },
  };
}

/** Lần đầu xem NK container: tạo bản DRAFT điền sẵn từ vận đơn (như backend – GET có ghi). */
export const getKvgs = (dossierId: string, branch: number) =>
  mutate((db) => {
    const dossier = dossierOf(db, dossierId);
    assertBranch(db, dossierId, branch);
    settleAll(db);
    if (containerListRequired(dossier.direction, dossier.transportMode) && !latestList(db, dossierId, branch)) db.kvgs.lists.push(newList(dossierId, branch, 1, prefillRowsOf(db, dossierId)));
    return viewOf(db, dossierId, branch);
  });

/** Ghi `rows` vào bản đang sửa: SENDING → khóa; ACCEPTED hoặc chưa có → lần khai mới; còn lại sửa tại chỗ (lỗi cũ bỏ). */
function writeRows(dossierId: string, branch: number, rowsOf: (db: MockDb) => ContainerListRow[]) {
  return mutate((db) => {
    const dossier = dossierOf(db, dossierId);
    assertBranch(db, dossierId, branch);
    settleAll(db);
    if (!containerListRequired(dossier.direction, dossier.transportMode)) throw reasonApiError("INVALID_STATE", "CONT_LIST_NOT_APPLICABLE");
    const cur = latestList(db, dossierId, branch);
    if (cur?.status === "SENDING") throw reasonApiError("INVALID_STATE", "CONT_LIST_LOCKED");
    const rows = clean(rowsOf(db));
    if (!cur || cur.status === "ACCEPTED") db.kvgs.lists.push(newList(dossierId, branch, (cur?.attempt ?? 0) + 1, rows));
    else Object.assign(cur, { rows, ...(cur.status === "DRAFT" ? {} : { status: "DRAFT", errors: [] }) });
    return viewOf(db, dossierId, branch);
  });
}

export const saveContainerList = (dossierId: string, branch: number, input: SaveContainerListInput) => writeRows(dossierId, branch, () => input.rows);
export const refillContainerList = (dossierId: string, branch: number) => writeRows(dossierId, branch, (db) => prefillRowsOf(db, dossierId));

/** Gửi danh sách: đang SENDING → KVGS_ALREADY_SENDING; điều kiện luồng; đã chấp nhận → CONT_LIST_LOCKED; bảng sai → CONT_LIST_INVALID. Trả lời sau KVGS_REPLY_MS. */
export const sendContainerList = (dossierId: string, branch: number) =>
  mutate((db) => {
    dossierOf(db, dossierId);
    assertBranch(db, dossierId, branch);
    settleAll(db);
    const cur = latestList(db, dossierId, branch);
    if (cur?.status === "SENDING") throw reasonApiError("INVALID_STATE", "KVGS_ALREADY_SENDING");
    const blocked = kvgsOperationBlock(db, dossierId, branch, "CONT_LIST");
    if (blocked) throw blocked;
    if (cur?.status === "ACCEPTED") throw reasonApiError("INVALID_STATE", "CONT_LIST_LOCKED");
    const rows = cur?.rows ?? [];
    const issues = checkContainerList(rows);
    if (issues.length) throw reasonApiError("VALIDATION", "CONT_LIST_INVALID", { issues: describeIssues(issues) });
    const now = Date.now();
    // Bản đã từng gửi (REJECTED / NO_RESPONSE) → lần khai mới, như backend (khóa idempotency không trùng).
    const list = cur && cur.sentAt === null ? cur : newList(dossierId, branch, (cur?.attempt ?? 0) + 1, rows);
    if (list !== cur) db.kvgs.lists.push(list);
    Object.assign(list, {
      status: "SENDING", sentAt: new Date(now).toISOString(), errors: [], refId: newId("ref"), receiptNo: null, receiptDate: null,
      doneAt: new Date(now + KVGS_REPLY_MS).toISOString(), outcome: rows.some((r) => isRejectSeal(r.sealNo)) ? "REJECTED" : "ACCEPTED",
    });
    return viewOf(db, dossierId, branch);
  });

const pad = (n: number) => String(n).padStart(2, "0");
const numberOf = (v: string | undefined) => v?.match(/\d+(?:\.\d+)?/)?.[0] ?? "0";

/** Bảng kê dựng từ dữ liệu hồ sơ; mã vạch giả `KVGS-MOCK|<số tờ khai>|<container>`. */
function sheetOf(db: MockDb, dossier: Dossier, branch: number, declarationNo: string, registeredOn: string | null): KvgsSheet {
  const kind = dossier.transportMode === "SEA_CONTAINER" ? "CONTAINER" : "CARGO";
  const fields = Object.fromEntries((db.declarations.find((d) => d.dossierId === dossier.id)?.fields ?? []).map((f) => [f.code, f.value]));
  const office = dossier.customsOffice.split(/\s+[–-]\s+/);
  const kv = /KV\s+([IVX]+)/.exec(dossier.customsOffice)?.[1];
  const list = latestList(db, dossier.id, branch);
  const listRows = list?.status === "ACCEPTED" ? list.rows : [];
  const nos: { containerNo: string; sealNo: string }[] = listRows.length ? listRows : containersFor(dossier, db.documents, db.fields).map((containerNo) => ({ containerNo, sealNo: "" }));
  return {
    kind,
    regionOffice: kv ? `Chi cục Hải quan khu vực ${kv}` : "Chi cục Hải quan khu vực",
    customsOffice: office[1] ?? dossier.customsOffice,
    supervisionOffice: `Đội Kiểm soát Hải quan – ${office[1] ?? dossier.customsOffice}`,
    sealRequired: kind === "CONTAINER",
    companyName: fields[dossier.direction === "NK" ? "NNK_TEN" : "NXK_TEN"] ?? db.org.name,
    taxCode: db.org.taxCode,
    declarationNo,
    declarationStatus: "Thông quan",
    declarationDate: registeredOn ?? nowIso().slice(0, 10),
    declarationDateTo: null,
    typeName: `${dossier.typeCode} – ${dossier.direction === "NK" ? "Nhập khẩu" : "Xuất khẩu"}`,
    channel: `Luồng ${CHANNEL_VI[db.customsResults.find((r) => r.dossierId === dossier.id)?.channel ?? "GREEN"]}`,
    cargoControlNo: `QLHH${declarationNo.slice(-8)}${pad(branch)}`,
    barcode: kind === "CARGO" ? `KVGS-MOCK|${declarationNo}|CARGO` : null,
    containers: kind === "CONTAINER" ? nos.map((c) => ({ containerNo: c.containerNo, sealNo: c.sealNo || null, customsSealNo: null, barcode: `KVGS-MOCK|${declarationNo}|${c.containerNo}` })) : [],
    cargo: kind === "CARGO" ? { quantity: numberOf(fields["SO_KIEN"]), quantityUnit: "PK", grossWeight: numberOf(fields["TRONG_LUONG"]), weightUnit: "KGM" } : null,
    exportedAt: nowIso(),
  };
}

/** Lấy bảng kê qua KVGS: đang SENDING → KVGS_ALREADY_SENDING; chưa thông quan / NK container chưa được chấp nhận danh sách → lý do (customs-flow). */
export const fetchKvgs = (dossierId: string, branch: number) =>
  mutate((db) => {
    const dossier = dossierOf(db, dossierId);
    assertBranch(db, dossierId, branch);
    settleAll(db);
    if (latestFetch(db, dossierId, branch)?.status === "SENDING") throw reasonApiError("INVALID_STATE", "KVGS_ALREADY_SENDING");
    const blocked = kvgsOperationBlock(db, dossierId, branch, "KVGS");
    if (blocked) throw blocked;
    const head = kvgsHeaderOf(db, dossierId, branch);
    const now = Date.now();
    db.kvgs.fetches.push({
      id: newId("kvg"), dossierId, branch, status: "SENDING", refId: newId("ref"), receiptNo: null, receiptDate: null, errors: [], requestedAt: new Date(now).toISOString(), fetchedAt: null,
      doneAt: new Date(now + KVGS_REPLY_MS).toISOString(), outcome: "ACCEPTED", sheet: sheetOf(db, dossier, branch, head.declarationNo ?? "", head.registeredOn),
    });
    return viewOf(db, dossierId, branch);
  });

/** "Lấy phản hồi" ngay: bản đang SENDING / NO_RESPONSE được chốt luôn (mock không chờ lịch). */
export const pollNow = (dossierId: string, branch: number, kind: "CONT_LIST" | "KVGS") =>
  mutate((db): { again: boolean } => {
    dossierOf(db, dossierId);
    assertBranch(db, dossierId, branch);
    settleAll(db);
    const latest = kind === "CONT_LIST" ? latestList(db, dossierId, branch) : latestFetch(db, dossierId, branch);
    if (!latest || (latest.status !== "SENDING" && latest.status !== "NO_RESPONSE")) throw new ApiError("INVALID_STATE", "Không có yêu cầu đang chờ phản hồi");
    if (latest.status === "SENDING") latest.doneAt = nowIso();
    settleAll(db);
    return { again: false };
  });
