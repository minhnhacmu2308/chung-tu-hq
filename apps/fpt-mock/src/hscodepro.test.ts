// Máy giả lập HSCodePro: hành vi theo docs/integrations/hscodepro-api-v1.md (§2, §3, §8, §10).
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { HsJobSchema, type HsJob } from "@kb/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFptMock } from "./app.js";

const KEY = "dev-hs-key";
const P = "/internal/v1/hs-classifications";
let server: Server;
let base: string;
beforeEach(async () => {
  server = createServer(createFptMock({ hscodeproKey: KEY }).handler);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

const call = (method: string, path: string, body?: unknown, key: string | null = KEY) =>
  fetch(`${base}${P}${path}`, { method, headers: { "content-type": "application/json", ...(key ? { "x-internal-api-key": key } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const job = async (r: Response) => HsJobSchema.parse(await r.json());
const ITEMS = [
  { line_no: 1, description: "Thanh trượt dẫn hướng MGN12H, dài 500 mm", quantity: 100, unit: "PCE", origin_country: "TW", value_usd: 2840, invoice_hs: "8466.93", co_form: null },
  { line_no: 2, description: "Vít me bi SFU1605, dài 600 mm", quantity: 40, unit: "PCE", origin_country: "TW", value_usd: 2180, invoice_hs: "8483.40", co_form: null },
  { line_no: 3, description: "Deep groove ball bearing 6204", origin_country: "CN", co_form: "E" },
];
async function settle(id: string): Promise<HsJob> {
  for (let i = 0; i < 10; i++) {
    const j = await job(await call("GET", `/${id}`));
    if (j.status !== "processing") return j;
  }
  throw new Error("không dừng processing");
}

describe("HSCodePro giả lập", () => {
  it("khóa sai/thiếu → 401; id lạ → 404 (bước 1 checklist)", async () => {
    expect((await call("GET", "/khong-ton-tai", undefined, null)).status).toBe(401);
    expect((await call("GET", "/khong-ton-tai", undefined, "sai")).status).toBe(401);
    const r = await call("GET", "/khong-ton-tai");
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ code: "NOT_FOUND" });
  });
  it("tạo lượt → 202 mọi dòng queued; poll → dòng thanh trượt need_info, dòng khác completed mã 8 số; C/O E + CN → FTA", async () => {
    const r = await call("POST", "", { external_ref: "INV-1", import_date: "2026-10-15", items: ITEMS });
    expect(r.status).toBe(202);
    const created = await job(r);
    expect(created.items.map((i) => i.status)).toEqual(["queued", "queued", "queued"]);
    expect(new Set(created.items.map((i) => i.id)).size).toBe(3);
    const j = await settle(created.id);
    expect(j.status).toBe("need_info");
    expect(j.items[0]!.question!.questions[0]!.id).toBe("use");
    expect(j.items[1]!.result!.hs_code).toBe("84834090");
    expect(j.items[2]!.result!.tax!.import).toMatchObject({ basis: "FTA", agreement: "ACFTA" });
  });
  it("trả lời → 202 → dòng hoàn tất; trả lời lần 2 → 409 INVALID_STATE (bước 3)", async () => {
    const created = await job(await call("POST", "", { items: [ITEMS[0]] }));
    const j = await settle(created.id);
    const it0 = j.items[0]!;
    const body = { question_id: it0.question!.id, answers: [{ id: "use", selected: ["Máy công cụ (CNC, máy phay, máy tiện)"], custom: null }] };
    const a = await call("POST", `/${j.id}/items/${it0.id}/answers`, body);
    expect(a.status).toBe(202);
    expect(await a.json()).toEqual({ accepted: true });
    const done = await settle(j.id);
    expect(done.status).toBe("completed");
    expect(done.items[0]!.result!.hs_code).toMatch(/^\d{8}$/);
    const again = await call("POST", `/${j.id}/items/${it0.id}/answers`, body);
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: "INVALID_STATE" });
  });
  it("dữ liệu sai → 400 INVALID_INPUT có details theo field (bước 5)", async () => {
    const r = await call("POST", "", { items: [{ line_no: 1, description: "Vít me bi", origin_country: "TWN" }] });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: "INVALID_INPUT", details: [{ field: "items[0].origin_country" }] });
  });
  it("mô tả có FAIL-TEST → dòng failed AGENT_FAILED; lượt vẫn completed", async () => {
    const created = await job(await call("POST", "", { items: [{ line_no: 1, description: "Hàng FAIL-TEST", origin_country: "CN" }] }));
    const j = await settle(created.id);
    expect(j.status).toBe("completed");
    expect(j.items[0]).toMatchObject({ status: "failed", error: { code: "AGENT_FAILED" } });
  });
  it("hủy ngay sau khi tạo → các dòng chưa xong thành cancelled (bước 6)", async () => {
    const created = await job(await call("POST", "", { items: ITEMS }));
    const c = await call("POST", `/${created.id}/cancel`);
    expect(c.status).toBe(202);
    expect(await c.json()).toEqual({ accepted: true, cancelled: 3 });
    expect((await job(await call("GET", `/${created.id}`))).items.every((i) => i.status === "cancelled")).toBe(true);
  });
  it("quá 20 lượt tạo/phút → 429 kèm Retry-After", async () => {
    for (let i = 0; i < 20; i++) expect((await call("POST", "", { items: [ITEMS[1]] })).status).toBe(202);
    const r = await call("POST", "", { items: [ITEMS[1]] });
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBeTruthy();
  });
});
