// Bảng Dạy khai báo trên Postgres thật (RLS, kb_app): upsert bài học theo identity, org khác không thấy.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db/client.js";
import { startTestDb, type TestDb } from "../../../db/test-db.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import type { StoredLesson, TeachSampleRow } from "../application/ports.js";
import { DrizzleTeachUow } from "./drizzle-uow.js";

let t: TestDb;
let app: Db;
let uow: DrizzleTeachUow;
const A = { orgId: asOrgId("org_a"), userId: asUserId("usr_a") };
const B = { orgId: asOrgId("org_b"), userId: asUserId("usr_b") };
const NOW = new Date("2026-10-27T03:00:00Z");

beforeAll(async () => {
  t = await startTestDb();
  app = createDb(t.appUrl, { max: 2 });
  uow = new DrizzleTeachUow(app);
});
afterAll(async () => {
  await app?.close();
  await t?.stop();
});

const sample = (id: string, orgId: string): TeachSampleRow => ({
  id, orgId, storageKey: `orgs/${orgId}/teach/${id}.pdf`, fileName: "TK.pdf", pages: 3, sizeBytes: 10, status: "UPLOADED", declarationNo: null, read: null, dossierId: null, dossierCode: null,
  comparison: null, matched: null, total: null, lessons: 0, error: null, uploadedBy: "usr_a", createdAt: NOW, updatedAt: NOW,
});
const lesson = (id: string, orgId: string, hits: number): StoredLesson => ({
  id, orgId, kind: "FIELD", fieldCode: "KHO", contextKey: "office=02DS", identity: "FIELD|KHO|office=02DS", context: { office: "02DS" }, value: "02DSEA0 – KHO FEDEX", line: null,
  hits, conflicts: [], status: "PENDING", sampleIds: ["tks_1"], lastDeclarationNo: "106794645160", reviewedBy: null, reviewedAt: null, createdAt: NOW, updatedAt: NOW,
});

describe("teach_* (kb_app, RLS)", () => {
  it("cài đặt, tờ khai mẫu, bài học: ghi/đọc theo org; upsert cùng identity cập nhật, giữ id", async () => {
    await uow.asOrg(A, async (r) => {
      expect(await r.settings.enabled("org_a")).toBe(false);
      await r.settings.set("org_a", true, NOW);
      await r.samples.insert(sample("tks_1", "org_a"));
      await r.samples.update("org_a", "tks_1", { status: "READ", matched: 10, total: 12, comparison: { fields: [], lines: [] } });
      await r.lessons.upsert(lesson("les_1", "org_a", 1));
      await r.lessons.upsert({ ...lesson("les_other", "org_a", 2), sampleIds: ["tks_1", "tks_2"] });
    });
    const got = await uow.asOrg(A, async (r) => ({ on: await r.settings.enabled("org_a"), s: await r.samples.get("org_a", "tks_1"), l: await r.lessons.byIdentities("org_a", ["FIELD|KHO|office=02DS"]) }));
    expect(got.on).toBe(true);
    expect(got.s).toMatchObject({ status: "READ", matched: 10, total: 12 });
    expect(got.l).toHaveLength(1);
    expect(got.l[0]).toMatchObject({ id: "les_1", hits: 2, sampleIds: ["tks_1", "tks_2"], context: { office: "02DS" } });
  });
  it("org khác không thấy, không sửa được dữ liệu của org A", async () => {
    const seen = await uow.asOrg(B, async (r) => ({
      on: await r.settings.enabled("org_a"), samples: await r.samples.list("org_a", 10), lessons: await r.lessons.list("org_a"), one: await r.lessons.get("org_a", "les_1"),
    }));
    expect(seen).toEqual({ on: false, samples: [], lessons: [], one: null });
    await uow.asOrg(B, (r) => r.lessons.update("org_a", "les_1", { status: "ACTIVE" }));
    await uow.asOrg(B, (r) => r.samples.delete("org_a", "tks_1"));
    const still = await uow.asOrg(A, async (r) => ({ l: await r.lessons.get("org_a", "les_1"), s: await r.samples.get("org_a", "tks_1") }));
    expect(still.l?.status).toBe("PENDING");
    expect(still.s).not.toBeNull();
  });
});
