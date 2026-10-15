// Client HSCodePro: header khóa, đường dẫn, 429 + Retry-After, lỗi có mã, phản hồi sai cấu trúc.
import { describe, expect, it } from "vitest";
import { HsApiError } from "../application/ports.js";
import { FakeHsClassificationService, HscodeproHttpService } from "./hs-classifier.js";

const JOB = { id: "job1", external_ref: null, import_date: "2026-10-15", status: "processing", created_at: "2026-10-15T01:00:00.000Z", items: [{ id: "it1", line_no: 1, status: "queued", question: null, result: null, error: null }] };
type Reply = { status: number; body?: unknown; headers?: Record<string, string> };
function fakeFetch(replies: Reply[]) {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init: init ?? {} });
    const r = replies.shift() ?? replies.at(-1) ?? { status: 500 };
    if (!replies.length) replies.push(r);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json", ...r.headers } });
  }) as typeof fetch;
  return { fetchFn, sent };
}
const svc = (f: typeof fetch, sleeps: number[] = []) => new HscodeproHttpService("https://hs.example/", "k-123", { fetch: f, sleep: async (ms) => void sleeps.push(ms) });
const ITEM = { line_no: 1, description: "Vít me bi SFU1605", origin_country: "TW" };

describe("HscodeproHttpService", () => {
  it("tạo lượt: POST đúng đường dẫn + header khóa; trả HsJob đã parse", async () => {
    const f = fakeFetch([{ status: 202, body: JOB }]);
    const job = await svc(f.fetchFn).create({ items: [ITEM] });
    expect(job.items[0]!.id).toBe("it1");
    expect(f.sent[0]!.url).toBe("https://hs.example/internal/v1/hs-classifications");
    expect(f.sent[0]!.init.method).toBe("POST");
    expect(new Headers(f.sent[0]!.init.headers).get("x-internal-api-key")).toBe("k-123");
    expect(JSON.parse(String(f.sent[0]!.init.body))).toEqual({ items: [ITEM] });
  });
  it("get / answer / cancel gọi đúng đường dẫn", async () => {
    const f = fakeFetch([{ status: 200, body: JOB }, { status: 202, body: { accepted: true } }, { status: 202, body: { accepted: true, cancelled: 1 } }]);
    const s = svc(f.fetchFn);
    await s.get("job1");
    await s.answer("job1", "it1", { question_id: "q1", answers: [{ id: "use", selected: [], custom: "CNC" }] });
    await s.cancel("job1");
    expect(f.sent.map((x) => `${x.init.method} ${x.url.replace("https://hs.example", "")}`)).toEqual([
      "GET /internal/v1/hs-classifications/job1",
      "POST /internal/v1/hs-classifications/job1/items/it1/answers",
      "POST /internal/v1/hs-classifications/job1/cancel",
    ]);
  });
  it("429: chờ theo Retry-After rồi thử lại; quá 3 lần → RATE_LIMITED", async () => {
    const sleeps: number[] = [];
    const f = fakeFetch([{ status: 429, body: { error: "x", code: "RATE_LIMITED" }, headers: { "retry-after": "1" } }, { status: 429, body: { error: "x", code: "RATE_LIMITED" }, headers: { "retry-after": "2" } }, { status: 202, body: JOB }]);
    await svc(f.fetchFn, sleeps).create({ items: [ITEM] });
    expect(sleeps).toEqual([1000, 2000]);
    const always = fakeFetch([{ status: 429, body: { error: "x", code: "RATE_LIMITED" }, headers: { "retry-after": "1" } }]);
    await expect(svc(always.fetchFn).create({ items: [ITEM] })).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
  });
  it("lỗi có mã: 400 kèm details, 409, 503", async () => {
    const e400 = await svc(fakeFetch([{ status: 400, body: { error: "Sai dữ liệu", code: "INVALID_INPUT", details: [{ field: "items[0].origin_country", message: "ISO-2" }] } }]).fetchFn).create({ items: [ITEM] }).catch((e: unknown) => e);
    expect(e400).toBeInstanceOf(HsApiError);
    expect(e400).toMatchObject({ status: 400, code: "INVALID_INPUT", details: [{ field: "items[0].origin_country" }] });
    await expect(svc(fakeFetch([{ status: 409, body: { error: "x", code: "INVALID_STATE" } }]).fetchFn).answer("j", "i", { question_id: "q", answers: [{ id: "a", selected: ["x"], custom: null }] })).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(svc(fakeFetch([{ status: 503, body: { error: "x", code: "NOT_CONFIGURED" } }]).fetchFn).get("j")).rejects.toMatchObject({ status: 503, code: "NOT_CONFIGURED" });
  });
  it("phản hồi 2xx sai cấu trúc → lỗi rõ ràng", async () => {
    await expect(svc(fakeFetch([{ status: 200, body: { id: "j" } }]).fetchFn).get("j")).rejects.toThrow(/không đúng cấu trúc/);
  });
});

describe("FakeHsClassificationService", () => {
  it("tạo lượt → hoàn tất ngay theo từ khóa biểu thuế; mã 8 số; get trả lại lượt", async () => {
    const s = new FakeHsClassificationService(async () => [{ code: "8482.10.00", description: "Ổ bi cầu", mfn: "3", pref: { E: "0" }, vat: "8", policy: null, keywords: ["bearing", "ổ bi"] }]);
    const job = await s.create({ items: [{ line_no: 1, description: "Deep groove ball bearing", origin_country: "CN", co_form: "E" }, { line_no: 2, description: "Hàng lạ không khớp", origin_country: "CN" }] });
    expect(job.status).toBe("completed"); // dòng failed không giữ lượt ở processing
    expect(job.items[0]!.result).toMatchObject({ hs_code: "84821000", tax: { import: { rate: 0, basis: "FTA" }, vat: { rate: 8 } } });
    expect(job.items[1]).toMatchObject({ status: "failed", result: null, error: { code: "NO_SUGGESTION" } });
    expect((await s.get(job.id)).id).toBe(job.id);
  });
});
