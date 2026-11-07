// GỠ LỖI TẠM (FPT_DEBUG_TRACE): nhật ký API FPT – client báo đúng từng lần gọi, bản lưu che bí mật + cắt chuỗi dài.
import { describe, expect, it } from "vitest";
import { FptRestClient } from "./fpt-rest-client.js";
import type { Redis } from "ioredis";
import { RedisFptTrace, toTraceEntry, TRACE_MAX, type FptExchange } from "./fpt-trace.js";
import { FptVnaccsGateway } from "./fpt-vnaccs-gateway.js";

const CREDS = { useR_ID: "BI820001", password: "secret-pw", terminaL_ID: "Z0000M", terminaL_ACCESS_KEY: "TERMKEY" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const NOW = new Date("2026-11-03T08:00:00Z");

function setup(reply: (path: string) => Response | Promise<Response>) {
  const seen: FptExchange[] = [];
  const fetchFn = (async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname;
    return path === "/api/auth/login" ? json({ token: "tok", expiration: "2026-11-03T12:00:00Z" }) : reply(path);
  }) as typeof fetch;
  const client = new FptRestClient({ baseUrl: "http://fpt.test", username: "u", password: "p", fetch: fetchFn, now: () => NOW, trace: (e) => seen.push(e) });
  return { client, seen };
}

describe("FptRestClient – trace", () => {
  it("báo body gửi (kèm objVNACCS_ACCOUNT), status, phản hồi thô và hồ sơ; không báo lần đăng nhập", async () => {
    const { client, seen } = setup(() => json({ errorList: [], objIDA: [] }));
    await client.post("IDA", { objVN_IDA: { tK_ICB: "A11" } }, CREDS, { orgId: "org_1", dossierId: "dos_1" });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ orgId: "org_1", dossierId: "dos_1", operation: "IDA", path: "/api/IDA", status: 200, error: null, at: NOW });
    expect(seen[0]!.request).toEqual({ objVNACCS_ACCOUNT: CREDS, objVN_IDA: { tK_ICB: "A11" } });
    expect(JSON.parse(seen[0]!.responseText!)).toEqual({ errorList: [], objIDA: [] });
  });
  it("lỗi HTTP 5xx vẫn ghi phản hồi + lỗi", async () => {
    const { client, seen } = setup(() => new Response("Server down", { status: 503 }));
    await expect(client.post("IDC", { tK_ICN: 1 }, CREDS, { orgId: "org_1" })).rejects.toThrow();
    expect(seen[0]).toMatchObject({ status: 503, responseText: "Server down", error: expect.stringContaining("503") });
  });
  it("không có meta → không ghi (lời gọi ngoài luồng, vd Kiểm tra kết nối)", async () => {
    const { client, seen } = setup(() => json({}));
    await client.post("IDA", {}, CREDS);
    expect(seen).toHaveLength(0);
  });
  it("gateway gắn hồ sơ cho nghiệp vụ tờ khai, VNACCSREP là lời gọi chung", async () => {
    const { client, seen } = setup(() => json({ errorList: [] }));
    const gw = new FptVnaccsGateway(client, { get: async () => CREDS });
    await gw.queryStatus("org_1", "103000000001", "dos_9", "NK").catch(() => undefined);
    await gw.pullMessages("org_1");
    expect(seen.map((e) => [e.operation, e.dossierId])).toEqual([["IID", "dos_9"], ["VNACCSREP", undefined]]);
  });
});

describe("toTraceEntry", () => {
  const base: FptExchange = { orgId: "org_1", operation: "IDA", path: "/api/IDA", at: NOW, status: 200, durationMs: 12.6, request: {}, responseText: null, error: null };
  it("che mật khẩu / terminal key ở mọi độ sâu, giữ phần còn lại nguyên văn", () => {
    const e = toTraceEntry({ ...base, request: { objVNACCS_ACCOUNT: CREDS, objVN_IDA: { tK_IMC: "0101234567" } }, responseText: JSON.stringify({ objVNACCS_ACCOUNT: CREDS, token: "abc" }) }, "id1");
    expect(e).toMatchObject({ id: "id1", at: NOW.toISOString(), dossierId: null, durationMs: 13 });
    expect(e.request).toEqual({ objVNACCS_ACCOUNT: { useR_ID: "BI820001", password: "***", terminaL_ID: "Z0000M", terminaL_ACCESS_KEY: "***" }, objVN_IDA: { tK_IMC: "0101234567" } });
    expect(e.response).toEqual({ objVNACCS_ACCOUNT: { useR_ID: "BI820001", password: "***", terminaL_ID: "Z0000M", terminaL_ACCESS_KEY: "***" }, token: "***" });
  });
  it("cắt chuỗi rất dài (base64 tệp); phản hồi không phải JSON giữ dạng chữ", () => {
    const e = toTraceEntry({ ...base, request: { lisT_FILE: [{ filE_BASE64: "A".repeat(5000) }] }, responseText: "<html>lỗi</html>" });
    expect((e.request as { lisT_FILE: { filE_BASE64: string }[] }).lisT_FILE[0]!.filE_BASE64).toMatch(/^A{200}… \(cắt bớt, dài 5000 ký tự\)$/);
    expect(e.response).toBe("<html>lỗi</html>");
  });
});

describe("RedisFptTrace", () => {
  /** Redis giả tối thiểu: list theo khóa, đủ cho multi/lpush/ltrim/expire/exec + lrange. */
  function fakeRedis() {
    const lists = new Map<string, string[]>();
    const redis = {
      lists,
      multi() {
        const ops: (() => void)[] = [];
        const chain = {
          lpush: (k: string, v: string) => (ops.push(() => lists.set(k, [v, ...(lists.get(k) ?? [])])), chain),
          ltrim: (k: string, a: number, b: number) => (ops.push(() => lists.set(k, (lists.get(k) ?? []).slice(a, b + 1))), chain),
          expire: () => chain,
          exec: async () => ops.forEach((f) => f()),
        };
        return chain;
      },
      lrange: async (k: string, a: number, b: number) => (lists.get(k) ?? []).slice(a, b + 1),
    };
    return redis;
  }
  const ex = (orgId: string, dossierId?: string, op = "IDA"): FptExchange => ({ orgId, ...(dossierId ? { dossierId } : {}), operation: op, path: `/api/${op}`, at: NOW, status: 200, durationMs: 1, request: { objVNACCS_ACCOUNT: CREDS }, responseText: "{}", error: null });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("theo doanh nghiệp + hồ sơ (kèm VNACCSREP chung), mới nhất trước; org khác không đọc được; bỏ dòng hỏng; đã che bí mật", async () => {
    const redis = fakeRedis();
    const trace = new RedisFptTrace(redis as unknown as Redis);
    trace.record(ex("org_1", "dos_1", "IDA"));
    trace.record(ex("org_1", "dos_2", "IDC"));
    trace.record(ex("org_1", undefined, "VNACCSREP"));
    trace.record(ex("org_2", "dos_1", "EDA"));
    await flush();
    redis.lists.get("fpt-trace:org_1")!.push("không phải JSON", JSON.stringify({ id: 1 }));
    const got = await trace.list("org_1", "dos_1");
    expect(got.map((e) => e.operation)).toEqual(["VNACCSREP", "IDA"]);
    expect(JSON.stringify(got)).not.toContain("secret-pw");
    expect((await trace.list("org_2", "dos_1")).map((e) => e.operation)).toEqual(["EDA"]);
  });
  it(`giữ tối đa ${TRACE_MAX} lần gọi`, async () => {
    const redis = fakeRedis();
    const trace = new RedisFptTrace(redis as unknown as Redis);
    for (let i = 0; i < TRACE_MAX + 5; i++) trace.record(ex("org_1", "dos_1"));
    await flush();
    expect(redis.lists.get("fpt-trace:org_1")).toHaveLength(TRACE_MAX);
  });
});
