import { sql } from "drizzle-orm";
import { lockedSheetCount } from "@kb/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db/client.js";
import { runSeed } from "../../../db/seed/index.js";
import { startTestDb, type TestDb } from "../../../db/test-db.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import type { ContainerListRecord, HysFileRow, HysSubmissionRow, IdentifierRow, KvgsSheetRecord, MessageRow, OutboxRow, PostAmendmentRow, ResultRow } from "../application/customs-ports.js";
import { isDuplicate } from "../application/kvgs.js";
import { sentOf } from "../application/sent-sheets.js";
import { DrizzleCustomsUow } from "./drizzle-customs-uow.js";

let t: TestDb;
let db: Db;
let uow: DrizzleCustomsUow;
const A = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_chau") };
const B = { orgId: asOrgId("org_khac"), userId: asUserId("usr_khac") };
const now = new Date("2026-10-23T00:00:00Z");
const row = (id: string, orgId: string): OutboxRow => ({ id, orgId, dossierId: "dos_x", branch: 1, declarationId: "dec_x", operation: "IDA", idempotencyKey: `${id}:key`, payload: {}, status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null, createdAt: now, updatedAt: now });

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl);
  const admin = createDb(t.adminUrl, { max: 1 });
  // Doanh nghiệp thứ hai bằng SQL thô (module integration không import schema identity – depcruise).
  await admin.execute(sql`INSERT INTO organizations (id, tax_code, name, plan_code) VALUES ('org_khac', '0100000098', 'KHÁC', 'PAYG')`);
  await admin.execute(sql`INSERT INTO users (id, email, password_hash, name) VALUES ('usr_khac', 'khac2@x.vn', 'x', 'Khác')`);
  await admin.execute(sql`INSERT INTO memberships (id, org_id, user_id, role) VALUES ('mem_khac2', 'org_khac', 'usr_khac', 'OWNER')`);
  await admin.close();
  db = createDb(t.appUrl, { max: 3 });
  uow = new DrizzleCustomsUow(db);
});
afterAll(async () => {
  await db?.close();
  await t?.stop();
});

describe("DrizzleCustomsUow – outbox cô lập theo doanh nghiệp", () => {
  it("org khác không đọc, không sửa được dòng outbox của A (RLS + lọc orgId); sửa với orgId đúng thì được", async () => {
    await uow.asOrg(A, (r) => r.outbox.insert(row("msg_a1", "org_anphat")));
    expect((await uow.asOrg(A, (r) => r.outbox.listForDossier("org_anphat", "dos_x"))).map((o) => o.id)).toEqual(["msg_a1"]);
    expect(await uow.asOrg(B, (r) => r.outbox.listForDossier("org_anphat", "dos_x"))).toEqual([]);
    expect(await uow.asOrg(B, (r) => r.outbox.get("org_anphat", "msg_a1"))).toBeNull();
    // Org B cố sửa dòng của A: RLS không thấy dòng → không có gì đổi.
    await uow.asOrg(B, (r) => r.outbox.update("org_anphat", "msg_a1", { status: "FAILED", updatedAt: now }));
    expect((await uow.asOrg(A, (r) => r.outbox.get("org_anphat", "msg_a1")))?.status).toBe("PENDING");
    // Cùng org nhưng truyền nhầm orgId → lọc orgId chặn (không đổi).
    await uow.asOrg(A, (r) => r.outbox.update("org_khac", "msg_a1", { status: "FAILED", updatedAt: now }));
    expect((await uow.asOrg(A, (r) => r.outbox.get("org_anphat", "msg_a1")))?.status).toBe("PENDING");
    await uow.asOrg(A, (r) => r.outbox.update("org_anphat", "msg_a1", { status: "SENT", updatedAt: now }));
    expect((await uow.asOrg(A, (r) => r.outbox.get("org_anphat", "msg_a1")))?.status).toBe("SENT");
    expect((await uow.asOrg(A, (r) => r.outbox.listUnsentBefore("org_anphat", new Date(now.getTime() + 1)))).length).toBe(0);
    await expect(uow.asOrg(B, (r) => r.outbox.insert(row("msg_b1", "org_anphat")))).rejects.toThrow();
  });
});

describe("DrizzleCustomsUow – trạng thái theo nhánh tờ khai", () => {
  const res = (id: string, branch: number, patch: Partial<ResultRow> = {}): ResultRow => ({ id, orgId: "org_anphat", dossierId: "dos_br", branch, externalId: null, declarationNo: null, channel: null, channelNote: null, clearanceStatus: "WAITING", customsTaxVnd: null, state: "APPROVED", pollCount: 0, raw: null, updatedAt: now, ...patch });
  const ama = (id: string, branch: number, seq: number): PostAmendmentRow => ({ id, orgId: "org_anphat", dossierId: "dos_br", branch, seq, status: "DRAFT", header: {} as PostAmendmentRow["header"], lines: [] as PostAmendmentRow["lines"], approvedAt: null, createdAt: now, updatedAt: now });

  it("hai result cùng dossier nhánh 1 và 2 cùng tồn tại; upsert trùng (dossier, branch) thì cập nhật, không đụng nhánh khác", async () => {
    await uow.asOrg(A, async (r) => {
      await r.results.upsert(res("res_b1", 1));
      await r.results.upsert(res("res_b2", 2));
      await r.results.upsert(res("res_b2x", 2, { declarationNo: "30000000002", pollCount: 3 }));
    });
    const list = await uow.asOrg(A, (r) => r.results.listForDossier("org_anphat", "dos_br"));
    expect(list.map((x) => [x.branch, x.declarationNo, x.pollCount])).toEqual([[1, null, 0], [2, "30000000002", 3]]);
    expect((await uow.asOrg(A, (r) => r.results.get("org_anphat", "dos_br")))?.branch).toBe(1);
    expect((await uow.asOrg(A, (r) => r.results.get("org_anphat", "dos_br", 2)))?.declarationNo).toBe("30000000002");
    expect(await uow.asOrg(A, (r) => r.results.get("org_anphat", "dos_br", 3))).toBeNull();
    // listForDossiers: một truy vấn cho nhiều hồ sơ, sắp theo nhánh; danh sách rỗng → []; org khác không thấy.
    expect((await uow.asOrg(A, (r) => r.results.listForDossiers("org_anphat", ["dos_br", "dos_khong_co"]))).map((x) => [x.dossierId, x.branch])).toEqual([["dos_br", 1], ["dos_br", 2]]);
    expect(await uow.asOrg(A, (r) => r.results.listForDossiers("org_anphat", []))).toEqual([]);
    expect(await uow.asOrg(B, (r) => r.results.listForDossiers("org_anphat", ["dos_br"]))).toEqual([]);
  });

  it("deleteUnsentAbove: chỉ xóa nhánh > N chưa khai (NOT_SENT, chưa có số) của đúng hồ sơ; org khác không xóa được", async () => {
    const d = (id: string, branch: number, patch: Partial<ResultRow> = {}) => ({ ...res(id, branch, patch), dossierId: "dos_del" });
    await uow.asOrg(A, async (r) => {
      for (const x of [d("del_1", 1, { raw: { stage: "NOT_SENT" } }), d("del_2", 2, { raw: { stage: "NOT_SENT" } }), d("del_3", 3, { raw: { stage: "NOT_SENT" } }), d("del_4", 4, { raw: { stage: "NOT_SENT" }, declarationNo: "30000000004" }), d("del_5", 5, { raw: { stage: "PRE_DECLARED" } })]) await r.results.upsert(x);
    });
    expect(await uow.asOrg(B, (r) => r.results.deleteUnsentAbove("org_anphat", "dos_del", 1))).toBe(0);
    expect(await uow.asOrg(A, (r) => r.results.deleteUnsentAbove("org_anphat", "dos_del", 2))).toBe(1);
    expect((await uow.asOrg(A, (r) => r.results.listForDossier("org_anphat", "dos_del"))).map((x) => x.branch)).toEqual([1, 2, 4, 5]);
    expect((await uow.asOrg(A, (r) => r.results.listForDossier("org_anphat", "dos_br"))).length).toBeGreaterThan(0);
  });

  it("số tờ đã khai (reader luật R-BRANCH-COUNT-LOCKED = lockedSheetCount(listForDossier)) theo org; org khác không thấy", async () => {
    const locked = async (ctx: typeof A) => lockedSheetCount(await uow.asOrg(ctx, (r) => r.results.listForDossier("org_anphat", "dos_br")));
    const before = await uow.asOrg(A, (r) => r.results.listForDossier("org_anphat", "dos_br"));
    expect(before.some((x) => x.declarationNo)).toBe(true);
    expect(await locked(A)).toBe(Math.max(...before.map((x) => x.branch)));
    expect(await locked(B)).toBe(0);
    expect(await uow.asOrg(B, (r) => r.results.listForDossier("org_anphat", "dos_br"))).toEqual([]);
  });

  it("raw.sent (ảnh chụp nội dung đã gửi – jsonb, không cần migration) lưu/đọc lại đúng theo nhánh; nhánh khác không bị ghi; org khác không thấy", async () => {
    const sent = { common: { CQHQ: "03CE", TK_TP: "1830", "@ADJ": "[]", "@CONT": '["C1"]', "@CUR": "USD" }, lines: '[{"fields":{},"item":{"amount":"15.25","lineNo":51}}]' };
    await uow.asOrg(A, (r) => r.results.upsert(res("res_sent2", 2, { dossierId: "dos_sent", declarationNo: "104000000002", state: "PRE_DECLARED", raw: { stage: "PRE_DECLARED", sent } })));
    await uow.asOrg(A, (r) => r.results.upsert(res("res_sent1", 1, { dossierId: "dos_sent", declarationNo: "104000000001", state: "PRE_DECLARED", raw: { stage: "PRE_DECLARED" } })));
    const rows = await uow.asOrg(A, (r) => r.results.listForDossier("org_anphat", "dos_sent"));
    expect(rows.find((x) => x.branch === 2)?.raw?.sent).toEqual(sent);
    expect(sentOf(rows.find((x) => x.branch === 2)!)).toEqual(sent);
    expect(rows.find((x) => x.branch === 1)?.raw?.sent).toBeUndefined();
    expect(await uow.asOrg(B, (r) => r.results.listForDossier("org_anphat", "dos_sent"))).toEqual([]);
  });

  it("markCatalogNo (C6): chỉ đặt raw.catalogNo khi tờ còn đúng số; giữ các khóa raw khác, không đụng nhánh khác; org khác không đặt được", async () => {
    await uow.asOrg(A, (r) => r.results.upsert(res("res_cat1", 1, { dossierId: "dos_cat", declarationNo: "104000000011", state: "PRE_DECLARED", raw: { stage: "PRE_DECLARED", sentLineIds: ["ln_1", "ln_2"] } })));
    await uow.asOrg(A, (r) => r.results.upsert(res("res_cat2", 2, { dossierId: "dos_cat", declarationNo: "104000000012", state: "PRE_DECLARED", raw: null })));
    const get = async (branch: number) => (await uow.asOrg(A, (r) => r.results.get("org_anphat", "dos_cat", branch)))!;
    const before = (await get(1)).updatedAt;
    // Org khác (RLS + lọc orgId) và số không khớp → không đặt.
    expect(await uow.asOrg(B, (r) => r.results.markCatalogNo("org_anphat", "dos_cat", 1, "104000000011", "2:abc"))).toBe(false);
    expect(await uow.asOrg(B, (r) => r.results.markCatalogNo("org_khac", "dos_cat", 1, "104000000011", "2:abc"))).toBe(false);
    expect(await uow.asOrg(A, (r) => r.results.markCatalogNo("org_anphat", "dos_cat", 1, "104000000099", "2:abc"))).toBe(false);
    expect((await get(1)).raw?.catalogNo).toBeUndefined();
    expect(await uow.asOrg(A, (r) => r.results.markCatalogNo("org_anphat", "dos_cat", 1, "104000000011", "2:abc"))).toBe(true);
    expect((await get(1)).raw).toEqual({ stage: "PRE_DECLARED", sentLineIds: ["ln_1", "ln_2"], catalogNo: { no: "104000000011", lines: "2:abc" } });
    expect((await get(1)).updatedAt).toEqual(before);
    expect((await get(2)).raw).toBeNull();
    // raw NULL → tạo object chỉ có catalogNo; khóa dòng null → JSON null.
    expect(await uow.asOrg(A, (r) => r.results.markCatalogNo("org_anphat", "dos_cat", 2, "104000000012", null))).toBe(true);
    expect((await get(2)).raw).toEqual({ catalogNo: { no: "104000000012", lines: null } });
  });

  it("post_amendments: seq 1 của nhánh 1 và nhánh 2 cùng tồn tại; trùng (dossier, branch, seq) bị chặn; lọc theo nhánh", async () => {
    await uow.asOrg(A, async (r) => {
      await r.amendments.insert(ama("ama_1", 1, 1));
      await r.amendments.insert(ama("ama_2", 2, 1));
    });
    await expect(uow.asOrg(A, (r) => r.amendments.insert(ama("ama_3", 2, 1)))).rejects.toThrow();
    expect((await uow.asOrg(A, (r) => r.amendments.listForDossier("org_anphat", "dos_br"))).map((a) => [a.branch, a.seq])).toEqual([[1, 1], [2, 1]]);
    expect((await uow.asOrg(A, (r) => r.amendments.listForDossier("org_anphat", "dos_br", 2))).map((a) => a.id)).toEqual(["ama_2"]);
  });

  it("messages.list lọc theo nhánh, vắng nhánh = mọi nhánh", async () => {
    const m = (id: string, branch: number): MessageRow => ({ id, orgId: "org_anphat", dossierId: "dos_br", branch, operation: "IDA", direction: "OUT", result: "OK", summary: "s", payloadMasked: {}, externalRef: null, at: new Date(now.getTime() + branch) });
    await uow.asOrg(A, async (r) => {
      await r.messages.insert(m("m1", 1));
      await r.messages.insert(m("m2", 2));
    });
    expect((await uow.asOrg(A, (r) => r.messages.list("org_anphat", "dos_br"))).map((x) => x.id)).toEqual(["m1", "m2"]);
    expect((await uow.asOrg(A, (r) => r.messages.list("org_anphat", "dos_br", 2))).map((x) => x.id)).toEqual(["m2"]);
  });

  it("dòng chèn không có cột branch (dữ liệu cũ) đọc ra branch = 1", async () => {
    const admin = createDb(t.adminUrl, { max: 1 });
    await admin.execute(sql`INSERT INTO customs_results (id, org_id, dossier_id) VALUES ('res_old', 'org_anphat', 'dos_old')`);
    await admin.execute(sql`INSERT INTO customs_outbox (id, org_id, dossier_id, declaration_id, operation, idempotency_key, payload) VALUES ('ob_old', 'org_anphat', 'dos_old', 'dec_old', 'IDA', 'ob_old:key', '{}')`);
    await admin.close();
    expect((await uow.asOrg(A, (r) => r.results.get("org_anphat", "dos_old")))?.branch).toBe(1);
    expect((await uow.asOrg(A, (r) => r.outbox.get("org_anphat", "ob_old")))?.branch).toBe(1);
  });
});

describe("DrizzleCustomsUow – bộ HYS", () => {
  const sub = (id: string, seq: number, patch: Partial<HysSubmissionRow> = {}): HysSubmissionRow => ({
    id, orgId: "org_anphat", dossierId: "dos_hys", seq, procedureCode: "A02", attachKind: null, customsOffice: "03CE", processingUnit: "00", phone: null, internalRef: "HS-1", note: null, purpose: null, status: "DRAFT", attempt: 0,
    receiptNo: null, registeredOn: null, reject: null, fill: null, sentBy: null, sentAt: null, createdAt: now, updatedAt: now, ...patch,
  });
  const file = (id: string, submissionId: string, position: number, patch: Partial<HysFileRow> = {}): HysFileRow => ({ id, orgId: "org_anphat", submissionId, documentId: null, storageKey: `orgs/org_anphat/${id}`, fileName: `${id}.pdf`, mime: "application/pdf", sizeBytes: 100, position, createdAt: now, ...patch });

  beforeAll(async () => {
    const admin = createDb(t.adminUrl, { max: 1 });
    await admin.execute(sql`INSERT INTO dossiers (id, org_id, code, direction, type_code, partner, customs_office_code, due_date, owner_id) VALUES ('dos_hys', 'org_anphat', 'HYS-001', 'NK', 'A11', 'P', '03CE', '2026-11-01', 'usr_chau')`);
    await admin.close();
  });

  it("thêm/đọc/sửa/xóa bộ và file; ngày YYYY-MM-DD, jsonb, thời điểm UTC khứ hồi đúng", async () => {
    await uow.asOrg(A, async (r) => {
      await r.hys.insert(sub("hys_1", 1));
      await r.hys.insert(sub("hys_2", 2));
      await r.hys.insertFile(file("hf_b", "hys_1", 2, { documentId: "doc_1" }));
      await r.hys.insertFile(file("hf_a", "hys_1", 1));
      await r.hys.insertFile(file("hf_c", "hys_2", 1));
    });
    expect((await uow.asOrg(A, (r) => r.hys.list("org_anphat", "dos_hys"))).map((h) => h.id)).toEqual(["hys_1", "hys_2"]);
    expect((await uow.asOrg(A, (r) => r.hys.files("org_anphat", "hys_1"))).map((f) => [f.id, f.documentId])).toEqual([["hf_a", null], ["hf_b", "doc_1"]]);
    expect((await uow.asOrg(A, (r) => r.hys.filesForDossier("org_anphat", "dos_hys"))).map((f) => f.id)).toEqual(["hf_a", "hf_b", "hf_c"]);
    const sentAt = new Date("2026-10-26T03:04:05Z");
    const reject = [{ code: "E1", message: "Lỗi", solution: "Sửa" }];
    const fill = { outcome: "FILLED", slot: 1 } as const;
    await uow.asOrg(A, (r) => r.hys.update("org_anphat", "hys_1", { status: "ACCEPTED", attachKind: "INV", attempt: 1, receiptNo: "0001234567", registeredOn: "2026-10-26", reject, fill, sentBy: "usr_chau", sentAt, purpose: "PRE_DECLARATION", updatedAt: sentAt }));
    const got = await uow.asOrg(A, (r) => r.hys.get("org_anphat", "hys_1"));
    expect(got).toMatchObject({ status: "ACCEPTED", attachKind: "INV", attempt: 1, receiptNo: "0001234567", registeredOn: "2026-10-26", reject, fill, sentBy: "usr_chau", purpose: "PRE_DECLARATION" });
    expect(got?.sentAt?.toISOString()).toBe(sentAt.toISOString());
    await uow.asOrg(A, (r) => r.hys.deleteFile("org_anphat", "hf_a"));
    expect((await uow.asOrg(A, (r) => r.hys.files("org_anphat", "hys_1"))).map((f) => f.id)).toEqual(["hf_b"]);
    await uow.asOrg(A, (r) => r.hys.deleteFiles("org_anphat", "hys_1"));
    expect(await uow.asOrg(A, (r) => r.hys.files("org_anphat", "hys_1"))).toEqual([]);
    await uow.asOrg(A, (r) => r.hys.delete("org_anphat", "hys_2"));
    expect(await uow.asOrg(A, (r) => r.hys.get("org_anphat", "hys_2"))).toBeNull();
  });

  it("trùng (dossier, seq) bị chặn; trạng thái / phân loại đính kèm lạ bị CHECK chặn", async () => {
    await expect(uow.asOrg(A, (r) => r.hys.insert(sub("hys_dup", 1)))).rejects.toThrow();
    await expect(uow.asOrg(A, (r) => r.hys.insert(sub("hys_bad", 9, { status: "LA" as HysSubmissionRow["status"] })))).rejects.toThrow();
    // Phân loại đính kèm chỉ nhận 8 mã ATTACH_KIND – mã thủ tục A546 (A02…) bị CHECK chặn.
    await expect(uow.asOrg(A, (r) => r.hys.insert(sub("hys_bad_kind", 10, { attachKind: "A02" as HysSubmissionRow["attachKind"] })))).rejects.toThrow();
  });

  it("xóa bộ cascade file; xóa hồ sơ cascade bộ", async () => {
    await uow.asOrg(A, async (r) => {
      await r.hys.insert(sub("hys_c", 3));
      await r.hys.insertFile(file("hf_c1", "hys_c", 1));
    });
    await uow.asOrg(A, (r) => r.hys.delete("org_anphat", "hys_c"));
    expect(await uow.asOrg(A, (r) => r.hys.files("org_anphat", "hys_c"))).toEqual([]);
    const admin = createDb(t.adminUrl, { max: 1 });
    await admin.execute(sql`INSERT INTO dossiers (id, org_id, code, direction, type_code, partner, customs_office_code, due_date, owner_id) VALUES ('dos_hys2', 'org_anphat', 'HYS-002', 'NK', 'A11', 'P', '03CE', '2026-11-01', 'usr_chau')`);
    await uow.asOrg(A, (r) => r.hys.insert(sub("hys_d", 1, { dossierId: "dos_hys2" })));
    await admin.execute(sql`DELETE FROM dossiers WHERE id = 'dos_hys2'`);
    await admin.close();
    expect(await uow.asOrg(A, (r) => r.hys.get("org_anphat", "hys_d"))).toBeNull();
  });

  it("org khác không đọc, không sửa, không xóa, không ghi được bộ/file của A (RLS + lọc orgId)", async () => {
    await uow.asOrg(A, async (r) => {
      await r.hys.insert(sub("hys_x", 5));
      await r.hys.insertFile(file("hf_x", "hys_x", 1));
    });
    expect(await uow.asOrg(B, (r) => r.hys.list("org_anphat", "dos_hys"))).toEqual([]);
    expect(await uow.asOrg(B, (r) => r.hys.get("org_anphat", "hys_x"))).toBeNull();
    expect(await uow.asOrg(B, (r) => r.hys.files("org_anphat", "hys_x"))).toEqual([]);
    expect(await uow.asOrg(B, (r) => r.hys.filesForDossier("org_anphat", "dos_hys"))).toEqual([]);
    await uow.asOrg(B, (r) => r.hys.update("org_anphat", "hys_x", { status: "REJECTED" }));
    await uow.asOrg(B, (r) => r.hys.delete("org_anphat", "hys_x"));
    await uow.asOrg(B, (r) => r.hys.deleteFile("org_anphat", "hf_x"));
    await uow.asOrg(B, (r) => r.hys.deleteFiles("org_anphat", "hys_x"));
    expect((await uow.asOrg(A, (r) => r.hys.get("org_anphat", "hys_x")))?.status).toBe("DRAFT");
    expect((await uow.asOrg(A, (r) => r.hys.files("org_anphat", "hys_x"))).length).toBe(1);
    // Cùng org nhưng truyền nhầm orgId → lọc orgId chặn.
    await uow.asOrg(A, (r) => r.hys.update("org_khac", "hys_x", { status: "REJECTED" }));
    expect((await uow.asOrg(A, (r) => r.hys.get("org_anphat", "hys_x")))?.status).toBe("DRAFT");
    await expect(uow.asOrg(B, (r) => r.hys.insert(sub("hys_b", 6)))).rejects.toThrow();
    await expect(uow.asOrg(B, (r) => r.hys.insertFile(file("hf_b2", "hys_x", 1)))).rejects.toThrow();
  });

  it("findByReceipt: bộ mang số tiếp nhận (khớp VAL0020 VNACCSREP); org khác / truyền nhầm orgId không thấy", async () => {
    await uow.asOrg(A, (r) => r.hys.insert(sub("hys_rcpt", 7, { status: "ACCEPTED", receiptNo: "900000000777" })));
    expect((await uow.asOrg(A, (r) => r.hys.findByReceipt("org_anphat", "900000000777")))?.id).toBe("hys_rcpt");
    expect(await uow.asOrg(A, (r) => r.hys.findByReceipt("org_anphat", "900000000000"))).toBeNull();
    expect(await uow.asOrg(A, (r) => r.hys.findByReceipt("org_khac", "900000000777"))).toBeNull();
    expect(await uow.asOrg(B, (r) => r.hys.findByReceipt("org_anphat", "900000000777"))).toBeNull();
  });
});

describe("DrizzleCustomsUow – hộp thư VNACCSREP", () => {
  const msg = { kind: "IDA" as const, code: "VAD1LF0", name: "Thông quan", declarationNo: "107000000777", at: "2026-10-23 08:00" };
  const inboxRow = (id: string, orgId: string, dedupKey = "IDA|VAD1LF0|107000000777|2026-10-23 08:00") => ({ id, orgId, dedupKey, message: msg, status: "PENDING" as const, attempts: 0, receivedAt: now, appliedAt: null });
  it("ghi cả lô, trùng khóa bỏ qua; org khác không thấy, không sửa được; khớp số tờ khai và TK_SYN", async () => {
    await uow.asOrg(A, (r) => r.inbox.insertMany([inboxRow("cin_a1", "org_anphat"), inboxRow("cin_a2", "org_anphat")]));
    const pending = await uow.asOrg(A, (r) => r.inbox.listPending("org_anphat", 10));
    expect(pending.map((x) => [x.id, x.message.code])).toEqual([["cin_a1", "VAD1LF0"]]);
    expect(await uow.asOrg(B, (r) => r.inbox.listPending("org_anphat", 10))).toEqual([]);
    await uow.asOrg(B, (r) => r.inbox.update("org_anphat", "cin_a1", { status: "APPLIED" }));
    expect((await uow.asOrg(A, (r) => r.inbox.listPending("org_anphat", 10))).length).toBe(1);
    await expect(uow.asOrg(B, (r) => r.inbox.insertMany([inboxRow("cin_b1", "org_anphat", "x")]))).rejects.toThrow();
    expect(await uow.asOrg(B, (r) => r.inbox.claim("org_anphat", "cin_a1", now))).toBe(false);
    // Giữ song song: chỉ một transaction thắng (khóa dòng + điều kiện PENDING).
    const claims = await Promise.all([uow.asOrg(A, (r) => r.inbox.claim("org_anphat", "cin_a1", now)), uow.asOrg(A, (r) => r.inbox.claim("org_anphat", "cin_a1", now))]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await uow.asOrg(A, (r) => r.inbox.listPending("org_anphat", 10))).toEqual([]);

    await uow.asOrg(A, (r) => r.results.upsert({ id: "res_in", orgId: "org_anphat", dossierId: "dos_in", branch: 1, externalId: "107000000777", declarationNo: "107000000777", channel: null, channelNote: null, clearanceStatus: "WAITING", customsTaxVnd: null, state: "DECLARED", pollCount: 0, raw: null, updatedAt: now }));
    expect((await uow.asOrg(A, (r) => r.results.findByNumber("org_anphat", "107000000777")))?.dossierId).toBe("dos_in");
    expect(await uow.asOrg(B, (r) => r.results.findByNumber("org_anphat", "107000000777"))).toBeNull();
    await uow.asOrg(A, (r) => r.amendments.insert({ id: "pam_in", orgId: "org_anphat", dossierId: "dos_in", branch: 1, seq: 1, status: "PRE_DECLARED", header: { TK_SYN: "500000000123" }, lines: [], approvedAt: null, createdAt: now, updatedAt: now } as PostAmendmentRow));
    expect((await uow.asOrg(A, (r) => r.amendments.findBySyn("org_anphat", "500000000123")))?.id).toBe("pam_in");
    expect(await uow.asOrg(B, (r) => r.amendments.findBySyn("org_anphat", "500000000123"))).toBeNull();
  });
});

describe("DrizzleCustomsUow – danh sách container và bảng kê KVGS", () => {
  const list = (id: string, attempt: number, patch: Partial<ContainerListRecord> = {}): ContainerListRecord => ({
    id, orgId: "org_anphat", dossierId: "dos_kvgs", branch: 1, attempt, rows: [{ billNo: "HBL1", containerNo: "FBIU5802429", sealNo: "S1", note: "", source: "OCR" }], status: "DRAFT", refId: null, receiptNo: null, receiptDate: null,
    errors: null, sentRows: null, sentBy: null, sentAt: null, createdAt: now, updatedAt: now, ...patch,
  });
  const sheet = (id: string, minute: number, patch: Partial<KvgsSheetRecord> = {}): KvgsSheetRecord => ({
    id, orgId: "org_anphat", dossierId: "dos_kvgs", branch: 1, status: "SENDING", refId: null, receiptNo: null, receiptDate: null, errors: null, sheet: null, raw: null, requestedBy: "usr_chau",
    requestedAt: new Date(Date.UTC(2026, 10, 13, 0, minute)), fetchedAt: null, createdAt: now, updatedAt: now, ...patch,
  });

  beforeAll(async () => {
    const admin = createDb(t.adminUrl, { max: 1 });
    await admin.execute(sql`INSERT INTO dossiers (id, org_id, code, direction, type_code, partner, customs_office_code, due_date, owner_id) VALUES ('dos_kvgs', 'org_anphat', 'KVGS-001', 'NK', 'A11', 'P', '03CE', '2026-11-01', 'usr_chau')`);
    await admin.close();
  });

  it("container_lists: thêm/đọc/sửa khứ hồi đúng (jsonb, ngày YYYY-MM-DD, UTC); latest = attempt lớn nhất; org khác thấy null (RLS); trùng (hồ sơ, nhánh, attempt) và trạng thái lạ bị chặn", async () => {
    await uow.asOrg(A, async (r) => {
      await r.containerLists.insert(list("cl_1", 1));
      await r.containerLists.insert(list("cl_2", 2));
    });
    const sentAt = new Date("2026-11-13T03:04:05Z");
    await uow.asOrg(A, (r) => r.containerLists.update("org_anphat", "cl_2", { status: "REJECTED", refId: "ref-1", receiptNo: "9001", receiptDate: "2026-11-13", errors: [{ code: "E1", message: "Sai seal" }], sentRows: list("x", 1).rows, sentBy: "usr_chau", sentAt, updatedAt: sentAt }));
    const latest = await uow.asOrg(A, (r) => r.containerLists.latest("org_anphat", "dos_kvgs", 1));
    expect(latest).toMatchObject({ id: "cl_2", attempt: 2, status: "REJECTED", receiptDate: "2026-11-13", errors: [{ code: "E1", message: "Sai seal" }] });
    expect(latest?.sentAt?.toISOString()).toBe(sentAt.toISOString());
    expect((await uow.asOrg(A, (r) => r.containerLists.get("org_anphat", "cl_1")))?.rows[0]?.containerNo).toBe("FBIU5802429");
    expect(await uow.asOrg(B, (r) => r.containerLists.latest("org_anphat", "dos_kvgs", 1))).toBeNull();
    expect(await uow.asOrg(B, (r) => r.containerLists.get("org_anphat", "cl_1"))).toBeNull();
    await uow.asOrg(B, (r) => r.containerLists.update("org_anphat", "cl_1", { status: "ACCEPTED" }));
    expect((await uow.asOrg(A, (r) => r.containerLists.get("org_anphat", "cl_1")))?.status).toBe("DRAFT");
    await expect(uow.asOrg(A, (r) => r.containerLists.insert(list("cl_dup", 1)))).rejects.toThrow();
    await expect(uow.asOrg(A, (r) => r.containerLists.insert(list("cl_bad", 7, { status: "LA" as ContainerListRecord["status"] })))).rejects.toThrow();
  });

  it("kvgs_sheets: latest theo lần yêu cầu mới nhất, latestOk = ACCEPTED mới nhất; org khác thấy null (RLS)", async () => {
    await uow.asOrg(A, async (r) => {
      await r.kvgs.insert(sheet("kv_1", 1, { status: "ACCEPTED", raw: { a: 1 } }));
      await r.kvgs.insert(sheet("kv_2", 2, { status: "REJECTED" }));
    });
    expect((await uow.asOrg(A, (r) => r.kvgs.latest("org_anphat", "dos_kvgs", 1)))?.id).toBe("kv_2");
    expect((await uow.asOrg(A, (r) => r.kvgs.latestOk("org_anphat", "dos_kvgs", 1)))?.raw).toEqual({ a: 1 });
    expect(await uow.asOrg(B, (r) => r.kvgs.latest("org_anphat", "dos_kvgs", 1))).toBeNull();
    expect(await uow.asOrg(B, (r) => r.kvgs.latestOk("org_anphat", "dos_kvgs", 1))).toBeNull();
    expect(await uow.asOrg(B, (r) => r.kvgs.get("org_anphat", "kv_1"))).toBeNull();
    await expect(uow.asOrg(A, (r) => r.kvgs.insert(sheet("kv_bad", 3, { status: "LA" as KvgsSheetRecord["status"] })))).rejects.toThrow();
  });
  it("kvgs_sheets: bảng kê jsonb khứ hồi đúng (ảnh mã vạch Base64); bảng kê dạng cũ (container `barcode` chuỗi, trước API KVGS thật) → đọc ra null, không làm hỏng màn hình", async () => {
    const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAIAAAUAAYRcDQAAAAAASUVORK5CYII=";
    const good: NonNullable<KvgsSheetRecord["sheet"]> = {
      kind: "CONTAINER", regionOffice: "Cục", customsOffice: "Chi cục", supervisionOffice: "GS", sealRequired: true, companyName: "A", taxCode: "0312345678", declarationNo: "106123456780",
      declarationStatus: "Thông quan", declarationDate: "2026-11-10", declarationDateTo: null, typeName: "Nhập kinh doanh tiêu dùng", channel: "Xanh", cargoControlNo: "101126000001", barcode: null,
      containers: [{ containerNo: "MSCU1234566", sealNo: "SL1", customsSealNo: "HQ1", barcodeImage: PNG }], cargo: { quantity: "120", quantityUnit: "PK", grossWeight: "12450.5", weightUnit: "KGM" }, exportedAt: "2026-11-13T02:30:00.000Z",
    };
    const legacy = { ...good, containers: [{ containerNo: "MSCU1234566", sealNo: "SL1", customsSealNo: null, barcode: "KVGS-MOCK|1|MSCU1234566" }] } as unknown as KvgsSheetRecord["sheet"];
    await uow.asOrg(A, async (r) => {
      await r.kvgs.insert(sheet("kv_g", 20, { branch: 4, status: "ACCEPTED", sheet: good }));
      await r.kvgs.insert(sheet("kv_l", 21, { branch: 5, status: "ACCEPTED", sheet: legacy }));
    });
    expect((await uow.asOrg(A, (r) => r.kvgs.get("org_anphat", "kv_g")))?.sheet).toEqual(good);
    expect((await uow.asOrg(A, (r) => r.kvgs.get("org_anphat", "kv_l")))?.sheet).toBeNull();
  });
  it("kvgs_sheets: chỉ một bản SENDING mỗi (hồ sơ, nhánh) – chỉ mục duy nhất từng phần; xong bản cũ thì tạo được bản mới", async () => {
    await uow.asOrg(A, (r) => r.kvgs.insert(sheet("kv_s1", 10, { branch: 2 })));
    const dup = await uow.asOrg(A, (r) => r.kvgs.insert(sheet("kv_s2", 11, { branch: 2 }))).then(() => null, (e: unknown) => e);
    expect(isDuplicate(dup)).toBe(true); // drizzle bọc lỗi PG: 23505 nằm ở .cause
    await uow.asOrg(A, (r) => r.kvgs.insert(sheet("kv_s3", 12, { branch: 3 })));
    await uow.asOrg(A, (r) => r.kvgs.update("org_anphat", "kv_s1", { status: "REJECTED" }));
    await uow.asOrg(A, (r) => r.kvgs.insert(sheet("kv_s4", 13, { branch: 2 })));
  });
});

describe("DrizzleCustomsUow – khai báo định danh", () => {
  const ident = (id: string, attempt: number, p: Partial<IdentifierRow> = {}): IdentifierRow => ({
    id, orgId: "org_anphat", dossierId: "dos_idn", attempt, status: "SENDING", request: { objectType: "1", goodsType: "1", customsOffice: "03CE", taxCode: "0316789012", companyName: "AN PHÁT" },
    refId: null, receiptNo: null, receiptDate: null, customsState: null, identifierNo: null, identifiedOn: null, qrPng: null, resultText: null, errors: null, sendAttempts: 0, sentBy: "usr_chau",
    batchId: null, batchIndex: null, usedAt: null, usedByDossierId: null, deletedAt: null, deletedBy: null,
    sentAt: new Date(now.getTime() + attempt * 1000), createdAt: now, updatedAt: now, ...p,
  });
  beforeAll(async () => {
    const admin = createDb(t.adminUrl, { max: 1 });
    await admin.execute(sql`INSERT INTO dossiers (id, org_id, code, direction, type_code, partner, customs_office_code, due_date, owner_id) VALUES ('dos_idn', 'org_anphat', 'IDN-001', 'NK', 'A11', 'P', '03CE', '2026-11-01', 'usr_chau')`);
    await admin.close();
  });
  it("latest theo attempt; request jsonb khứ hồi qua Zod; kết quả (số, ngày, QR) ghi/đọc đúng; org khác thấy null (RLS)", async () => {
    await uow.asOrg(A, (r) => r.identifiers.insert(ident("idn_1", 1)));
    await uow.asOrg(A, (r) => r.identifiers.update("org_anphat", "idn_1", { status: "ACCEPTED", identifierNo: "122600050501472", identifiedOn: "2026-11-15", qrPng: "iVBOR", customsState: "15", sendAttempts: 1 }));
    await uow.asOrg(A, (r) => r.identifiers.insert(ident("idn_2", 2, { status: "REJECTED", errors: [{ code: "E1", message: "Sai" }] })));
    const latest = await uow.asOrg(A, (r) => r.identifiers.latest("org_anphat", "dos_idn"));
    expect(latest).toMatchObject({ id: "idn_2", attempt: 2, status: "REJECTED", errors: [{ code: "E1", message: "Sai" }], request: { taxCode: "0316789012" } });
    expect(await uow.asOrg(A, (r) => r.identifiers.get("org_anphat", "idn_1"))).toMatchObject({ status: "ACCEPTED", identifierNo: "122600050501472", identifiedOn: "2026-11-15", qrPng: "iVBOR", sendAttempts: 1 });
    expect(await uow.asOrg(B, (r) => r.identifiers.latest("org_anphat", "dos_idn"))).toBeNull();
    expect(await uow.asOrg(B, (r) => r.identifiers.get("org_anphat", "idn_1"))).toBeNull();
    await expect(uow.asOrg(B, (r) => r.identifiers.insert({ ...ident("idn_b", 9), orgId: "org_anphat" }))).rejects.toThrow();
  });
  it("chỉ một lần gửi SENDING mỗi hồ sơ (chỉ mục duy nhất từng phần); trạng thái lạ bị chặn", async () => {
    await uow.asOrg(A, (r) => r.identifiers.insert(ident("idn_s1", 10)));
    const dup = await uow.asOrg(A, (r) => r.identifiers.insert(ident("idn_s2", 11))).then(() => null, (e: unknown) => e);
    expect(isDuplicate(dup)).toBe(true);
    await expect(uow.asOrg(A, (r) => r.identifiers.insert(ident("idn_bad", 12, { status: "LA" as IdentifierRow["status"] })))).rejects.toThrow();
  });
  it("listStuckSending: chỉ SENDING có updatedAt trước mốc; org khác không thấy", async () => {
    // idn_s1 (test trên) đang SENDING với updatedAt = now.
    expect((await uow.asOrg(A, (r) => r.identifiers.listStuckSending("org_anphat", new Date(now.getTime() + 1000)))).map((x) => x.id)).toEqual(["idn_s1"]);
    expect(await uow.asOrg(A, (r) => r.identifiers.listStuckSending("org_anphat", now))).toEqual([]);
    expect(await uow.asOrg(B, (r) => r.identifiers.listStuckSending("org_anphat", new Date(now.getTime() + 1000)))).toEqual([]);
  });
});

describe("DrizzleCustomsUow – định danh theo lô (không gắn hồ sơ)", () => {
  const TODAY = "2026-12-05";
  const bi = (id: string, batchId: string, idx: number, p: Partial<IdentifierRow> = {}): IdentifierRow => ({
    id, orgId: "org_anphat", dossierId: null, attempt: 1, status: "ACCEPTED", request: { objectType: "1", goodsType: "1", customsOffice: "03CE", taxCode: "0316789012", companyName: "AN PHÁT" },
    refId: null, receiptNo: null, receiptDate: null, customsState: "15", identifierNo: `NO-${id}`, identifiedOn: "2026-11-15", qrPng: null, resultText: null, errors: null, sendAttempts: 1, sentBy: "usr_chau",
    batchId, batchIndex: idx, usedAt: null, usedByDossierId: null, deletedAt: null, deletedBy: null, sentAt: new Date(now.getTime() + idx * 1000), createdAt: now, updatedAt: now, ...p,
  });
  const q = (batchId: string, extra: Record<string, unknown> = {}) => ({ limit: 50, offset: 0, batchId, ...extra }) as Parameters<CustomsReposList>[1];
  type CustomsReposList = import("../application/customs-ports.js").CustomsRepos["identifiers"]["list"];
  const idsOf = async (batchId: string, extra: Record<string, unknown> = {}) => (await uow.asOrg(A, (r) => r.identifiers.list("org_anphat", q(batchId, extra), TODAY))).items.map((x) => x.id);

  it("insertMany_and_list_filters_by_display_status", async () => {
    await uow.asOrg(A, (r) => r.identifiers.insertMany([
      bi("b1_avail", "bat1", 1),
      bi("b1_old", "bat1", 2, { identifiedOn: "2025-06-01" }),
      bi("b1_used", "bat1", 3, { usedAt: now, usedByDossierId: "dos_idn" }),
      bi("b1_rej", "bat1", 4, { status: "REJECTED", identifierNo: null, identifiedOn: null }),
    ]));
    expect((await uow.asOrg(A, (r) => r.identifiers.listByBatch("org_anphat", "bat1"))).map((x) => x.id)).toEqual(["b1_avail", "b1_old", "b1_used", "b1_rej"]);
    expect(await idsOf("bat1", { status: "AVAILABLE" })).toEqual(["b1_avail"]);
    expect(await idsOf("bat1", { status: "EXPIRED" })).toEqual(["b1_old"]);
    expect(await idsOf("bat1", { status: "USED" })).toEqual(["b1_used"]);
    expect(await idsOf("bat1", { status: "REJECTED" })).toEqual(["b1_rej"]);
    const all = await uow.asOrg(A, (r) => r.identifiers.list("org_anphat", q("bat1"), TODAY));
    expect([all.total, all.expiringCount]).toEqual([4, 1]);
    expect((await uow.asOrg(A, (r) => r.identifiers.list("org_anphat", q("bat1"), "2026-11-20"))).expiringCount).toBe(0);
    expect(await idsOf("bat1", { q: "NO-b1_used" })).toEqual(["b1_used"]);
    expect(await idsOf("bat1", { q: "dos_idn" })).toEqual(["b1_used"]);
    expect(await idsOf("bat1", { customsOffice: "99XX" })).toEqual([]);
  });
  it("batch_uq_rejects_duplicate_batch_index", async () => {
    await expect(uow.asOrg(A, (r) => r.identifiers.insertMany([bi("b2_a", "bat2", 1), bi("b2_b", "bat2", 1)]))).rejects.toThrow();
  });
  it("markUsed_second_caller_gets_false", async () => {
    await uow.asOrg(A, (r) => r.identifiers.insertMany([bi("b3_a", "bat3", 1)]));
    expect(await uow.asOrg(A, (r) => r.identifiers.markUsed("org_anphat", "b3_a", "dos_idn", now))).toBe(true);
    expect(await uow.asOrg(A, (r) => r.identifiers.markUsed("org_anphat", "b3_a", "dos_idn", now))).toBe(false);
    expect(await uow.asOrg(A, (r) => r.identifiers.release("org_anphat", "b3_a", "dos_idn", now))).toBe(true);
    expect(await uow.asOrg(A, (r) => r.identifiers.markUsed("org_anphat", "b3_a", "dos_idn", now))).toBe(true);
  });
  it("softDelete_skips_row_that_became_accepted", async () => {
    await uow.asOrg(A, (r) => r.identifiers.insertMany([bi("b4_rej", "bat4", 1, { status: "REJECTED", identifierNo: null, identifiedOn: null }), bi("b4_ok", "bat4", 2)]));
    expect(await uow.asOrg(A, (r) => r.identifiers.softDelete("org_anphat", ["b4_rej", "b4_ok"], "usr_chau", now))).toEqual(["b4_rej"]);
    expect(await idsOf("bat4")).toEqual(["b4_ok"]);
    expect(await uow.asOrg(A, (r) => r.identifiers.softDelete("org_anphat", ["b4_rej"], "usr_chau", now))).toEqual([]);
  });
  it("list_excludes_other_org", async () => {
    await uow.asOrg(A, (r) => r.identifiers.insertMany([bi("b5_a", "bat5", 1)]));
    const other = await uow.asOrg(B, (r) => r.identifiers.list("org_anphat", q("bat5"), TODAY));
    expect([other.items.length, other.total]).toEqual([0, 0]);
    expect(await uow.asOrg(B, (r) => r.identifiers.listByBatch("org_anphat", "bat5"))).toEqual([]);
    expect(await uow.asOrg(B, (r) => r.identifiers.markUsed("org_anphat", "b5_a", "dos_idn", now))).toBe(false);
    expect(await uow.asOrg(B, (r) => r.identifiers.softDelete("org_anphat", ["b5_a"], "usr_khac", now))).toEqual([]);
  });
  it("dossier_bound_rows_not_in_pool", async () => {
    // Dòng gửi từ panel Khai báo định danh của hồ sơ: số đã nằm trong hồ sơ đó – không vào kho, không hồ sơ khác lấy, không xóa từ kho.
    await uow.asOrg(A, (r) => r.identifiers.insertMany([
      bi("b7_dos_ok", "bat7", 1, { dossierId: "dos_idn", batchId: null, batchIndex: null, attempt: 30, identifiedOn: "2026-12-02" }),
      bi("b7_dos_rej", "bat7", 2, { dossierId: "dos_idn", batchId: null, batchIndex: null, attempt: 31, status: "REJECTED", identifierNo: null, identifiedOn: null, errors: [{ code: "E", message: "x" }] }),
    ]));
    const page = await uow.asOrg(A, (r) => r.identifiers.list("org_anphat", { limit: 200, offset: 0, q: "NO-b7" } as Parameters<CustomsReposList>[1], TODAY));
    expect([page.items.length, page.total, page.expiringCount]).toEqual([0, 0, 0]);
    const all = await uow.asOrg(A, (r) => r.identifiers.list("org_anphat", { limit: 200, offset: 0 } as Parameters<CustomsReposList>[1], TODAY));
    expect(all.items.map((x) => x.id)).not.toContain("b7_dos_rej");
    expect(await uow.asOrg(A, (r) => r.identifiers.markUsed("org_anphat", "b7_dos_ok", "dos_idn", now))).toBe(false);
    expect(await uow.asOrg(A, (r) => r.identifiers.softDelete("org_anphat", ["b7_dos_rej"], "usr_chau", now))).toEqual([]);
    expect((await uow.asOrg(A, (r) => r.identifiers.get("org_anphat", "b7_dos_rej")))?.deletedAt).toBeNull();
  });
  it("retry_only_failed_live_row_without_number", async () => {
    await uow.asOrg(A, (r) => r.identifiers.insertMany([
      bi("b8_rej", "bat8", 1, { status: "REJECTED", identifierNo: null, identifiedOn: null }),
      bi("b8_del", "bat8", 2, { status: "NO_RESPONSE", identifierNo: null, identifiedOn: null, deletedAt: now, deletedBy: "usr_chau" }),
      bi("b8_ok", "bat8", 3),
    ]));
    const patch = { status: "SENDING", attempt: 2, updatedAt: now } as const;
    expect(await uow.asOrg(A, (r) => r.identifiers.retry("org_anphat", "b8_rej", patch))).toBe(true);
    expect(await uow.asOrg(A, (r) => r.identifiers.retry("org_anphat", "b8_rej", patch))).toBe(false);
    expect(await uow.asOrg(A, (r) => r.identifiers.retry("org_anphat", "b8_del", patch))).toBe(false);
    expect(await uow.asOrg(A, (r) => r.identifiers.retry("org_anphat", "b8_ok", patch))).toBe(false);
    expect((await uow.asOrg(A, (r) => r.identifiers.get("org_anphat", "b8_del")))?.status).toBe("NO_RESPONSE");
  });
  it("deleted_dossier_sets_used_by_null", async () => {
    const admin = createDb(t.adminUrl, { max: 1 });
    await admin.execute(sql`INSERT INTO dossiers (id, org_id, code, direction, type_code, partner, customs_office_code, due_date, owner_id) VALUES ('dos_idn_del', 'org_anphat', 'IDN-DEL', 'NK', 'A11', 'P', '03CE', '2026-11-01', 'usr_chau')`);
    await uow.asOrg(A, (r) => r.identifiers.insertMany([bi("b6_a", "bat6", 1, { usedAt: now, usedByDossierId: "dos_idn_del" })]));
    await admin.execute(sql`DELETE FROM dossiers WHERE id = 'dos_idn_del'`);
    await admin.close();
    const got = await uow.asOrg(A, (r) => r.identifiers.get("org_anphat", "b6_a"));
    expect(got?.usedByDossierId).toBeNull();
  });
});

describe("DrizzleCustomsUow – results.getForUpdate (khóa dòng)", () => {
  const res = (id: string, branch: number): ResultRow => ({ id, orgId: "org_anphat", dossierId: "dos_lock", branch, externalId: null, declarationNo: `L${branch}`, channel: null, channelNote: null, clearanceStatus: "WAITING", customsTaxVnd: null, state: "DECLARED", pollCount: 0, raw: null, updatedAt: now });

  it("trả đúng dòng của nhánh trong org mình; org khác nhận null", async () => {
    await uow.asOrg(A, async (r) => {
      await r.results.upsert(res("res_l1", 1));
      await r.results.upsert(res("res_l2", 2));
    });
    expect((await uow.asOrg(A, (r) => r.results.getForUpdate("org_anphat", "dos_lock", 2)))?.declarationNo).toBe("L2");
    expect((await uow.asOrg(A, (r) => r.results.getForUpdate("org_anphat", "dos_lock")))?.declarationNo).toBe("L1");
    expect(await uow.asOrg(A, (r) => r.results.getForUpdate("org_anphat", "dos_lock", 3))).toBeNull();
    expect(await uow.asOrg(B, (r) => r.results.getForUpdate("org_anphat", "dos_lock", 1))).toBeNull();
  });

  it("hai giao dịch đồng thời: giao dịch sau chờ giao dịch trước commit mới đọc được", async () => {
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let held!: () => void;
    const holding = new Promise<void>((resolve) => (held = resolve));
    const first = uow.asOrg(A, async (r) => {
      await r.results.getForUpdate("org_anphat", "dos_lock", 1);
      events.push("first-locked");
      held();
      await gate;
      events.push("first-commit");
    });
    await holding;
    const second = uow.asOrg(A, async (r) => {
      await r.results.getForUpdate("org_anphat", "dos_lock", 1);
      events.push("second-locked");
    });
    // Cho giao dịch sau đủ thời gian chạm khóa; nó phải CHƯA đọc xong khi giao dịch đầu còn giữ.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(events).toEqual(["first-locked"]);
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(["first-locked", "first-commit", "second-locked"]);
  });
});
