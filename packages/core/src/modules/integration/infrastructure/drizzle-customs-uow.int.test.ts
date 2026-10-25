import { sql } from "drizzle-orm";
import { lockedSheetCount } from "@kb/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db/client.js";
import { runSeed } from "../../../db/seed/index.js";
import { startTestDb, type TestDb } from "../../../db/test-db.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import type { MessageRow, OutboxRow, PostAmendmentRow, ResultRow } from "../application/customs-ports.js";
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
  await admin.execute(sql`INSERT INTO organizations (id, tax_code, name, plan_code) VALUES ('org_khac', '0100000098', 'KHÁC', 'TRIAL')`);
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
