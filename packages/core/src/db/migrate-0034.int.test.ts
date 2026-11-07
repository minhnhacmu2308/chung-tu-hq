// Migration 0034 (ADR 0011 – D6) trên Postgres thật: dữ liệu gói cũ → PAYG/CONTRACT, tặng 3 lượt, xóa gói cũ, bỏ cột hạn mức hồ sơ/dùng thử.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetSchema, runMigrations } from "./migrate.js";
import { startTestDb, type TestDb } from "./test-db.js";

const ALL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

let t: TestDb;
let sql: postgres.Sql;
let before: string;
beforeAll(async () => {
  t = await startTestDb();
  await resetSchema(t.adminUrl);
  // Bản sao thư mục migration dừng ở 0033 → dựng đúng trạng thái trước 0034.
  before = mkdtempSync(path.join(tmpdir(), "kb-mig-"));
  cpSync(ALL, before, { recursive: true });
  const journal = JSON.parse(readFileSync(path.join(before, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  journal.entries = journal.entries.filter((e) => e.tag < "0034");
  writeFileSync(path.join(before, "meta/_journal.json"), JSON.stringify(journal));
  sql = postgres(t.adminUrl, { max: 1 });
  await migrate(drizzle(sql), { migrationsFolder: before });
}, 180_000);
afterAll(async () => {
  await sql?.end();
  await t?.stop();
  if (before) rmSync(before, { recursive: true, force: true });
});

describe("migration 0034_billing_payg_contract", () => {
  it("D6: ENTERPRISE → CONTRACT (không hết hạn); TRIAL/BASIC/PRO → PAYG + 3 lượt (grant:migrate); xóa 4 gói cũ; bỏ cột cũ; thông báo cũ đổi mã gói", async () => {
    await sql`insert into plans (code, name, dossiers_per_month, pages_per_dossier, price_vnd) values
      ('TRIAL', 'Dùng thử', 10, 20, 0), ('BASIC', 'Cơ bản', 50, 30, 990000), ('PRO', 'Chuyên nghiệp', 150, 40, 2990000), ('ENTERPRISE', 'Doanh nghiệp', 1000, 100, 0)`;
    await sql`insert into organizations (id, tax_code, name, plan_code, quota_bonus, quota_bonus_month, trial_ends_at) values
      ('org_t', '0100000001', 'T', 'TRIAL', 0, null, now()), ('org_b', '0100000002', 'B', 'BASIC', 20, '2026-11', null),
      ('org_p', '0100000003', 'P', 'PRO', 0, null, null), ('org_e', '0100000004', 'E', 'ENTERPRISE', 0, null, null)`;
    await sql`insert into org_contracts (org_id, contract_no, ends_on, created_by) values ('org_e', 'HĐ-1', null, 'stf')`;
    await sql`insert into announcements (id, title, body, kind, audience, status, sent_at, sent_by, sent_by_name, recipients) values
      ('ann_1', 'A', 'B', 'INFO', 'PRO', 'SENT', now(), 'stf', 'S', 1), ('ann_2', 'A', 'B', 'INFO', 'ENTERPRISE', 'SENT', now(), 'stf', 'S', 1), ('ann_3', 'A', 'B', 'INFO', 'ALL', 'SENT', now(), 'stf', 'S', 2)`;

    await runMigrations(t.adminUrl);

    expect(await sql`select code, kind, pages_per_dossier, price_per_declaration_vnd::text as p from plans order by code`).toEqual([
      { code: "CONTRACT", kind: "CONTRACT", pages_per_dossier: 100, p: "0.000000" },
      { code: "PAYG", kind: "PAYG", pages_per_dossier: 40, p: "25000.000000" },
    ]);
    expect(await sql`select id, plan_code from organizations order by id`).toEqual([
      { id: "org_b", plan_code: "PAYG" }, { id: "org_e", plan_code: "CONTRACT" }, { id: "org_p", plan_code: "PAYG" }, { id: "org_t", plan_code: "PAYG" },
    ]);
    expect(await sql`select id, org_id, delta, reason from credit_ledger order by id`).toEqual([
      { id: "grant:migrate:org_b", org_id: "org_b", delta: 3, reason: "GRANT" },
      { id: "grant:migrate:org_e", org_id: "org_e", delta: 0, reason: "GRANT" },
      { id: "grant:migrate:org_p", org_id: "org_p", delta: 3, reason: "GRANT" },
      { id: "grant:migrate:org_t", org_id: "org_t", delta: 3, reason: "GRANT" },
    ]);
    // Hợp đồng cũ giữ nguyên, chưa có ngày kết thúc (quản trị nhập sau); có cột mới.
    expect(await sql`select org_id, contract_no, starts_on, ends_on, value_vnd::text as v from org_contracts`).toEqual([{ org_id: "org_e", contract_no: "HĐ-1", starts_on: null, ends_on: null, v: "0.000000" }]);
    expect((await sql`select audience from announcements order by id`).map((r) => r["audience"])).toEqual(["PAYG", "CONTRACT", "ALL"]);
    const cols = (await sql`select table_name || '.' || column_name as c from information_schema.columns where table_schema = 'public' and table_name in ('plans', 'organizations')`).map((r) => r["c"]);
    for (const c of ["plans.dossiers_per_month", "organizations.quota_bonus", "organizations.quota_bonus_month", "organizations.trial_ends_at"]) expect(cols).not.toContain(c);
    // RLS bật trên bảng mới.
    expect(await sql`select relname, relrowsecurity from pg_class where relname in ('credit_ledger', 'payments') order by relname`).toEqual([
      { relname: "credit_ledger", relrowsecurity: true }, { relname: "payments", relrowsecurity: true },
    ]);
  });
});
