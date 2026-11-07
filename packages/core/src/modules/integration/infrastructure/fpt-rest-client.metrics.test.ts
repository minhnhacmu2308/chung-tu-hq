// Chỉ số FPT (ADR 0012): mỗi lời gọi nghiệp vụ đếm theo op + outcome (ok / rejected / error / timeout), không đếm lần đăng nhập.
import { describe, expect, it } from "vitest";
import { metrics } from "../../../observability/index.js";
import { FptRestClient } from "./fpt-rest-client.js";

const CREDS = { useR_ID: "BI820001", password: "pw", terminaL_ID: "Z0000M", terminaL_ACCESS_KEY: "K" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function client(reply: () => Response | Promise<Response>, timeoutMs?: number) {
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    if (new URL(String(url)).pathname === "/api/auth/login") return json({ token: "tok", expiration: "2099-01-01T00:00:00Z" });
    if (timeoutMs) {
      // Mô phỏng fetch tôn trọng AbortSignal.timeout.
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason as Error)));
    }
    return reply();
  }) as typeof fetch;
  return new FptRestClient({ baseUrl: "http://fpt.test", username: "u", password: "p", fetch: fetchFn, ...(timeoutMs ? { timeoutMs } : {}) });
}

const count = async (op: string, outcome: string) =>
  (await metrics().fptRequests.get()).values.find((v) => v.labels["op"] === op && v.labels["outcome"] === outcome)?.value ?? 0;

describe("FptRestClient – khaibao_fpt_requests_total", () => {
  it("200 JSON → ok; 4xx → rejected; 5xx → error; timeout → timeout", async () => {
    await client(() => json({ errorList: [] })).post("IDB", {}, CREDS);
    await client(() => json({ error: "bad" }, 400)).post("IDB", {}, CREDS).catch(() => undefined);
    await client(() => new Response("down", { status: 503 })).post("IDB", {}, CREDS).catch(() => undefined);
    await client(() => json({}), 20).post("IDB", {}, CREDS).catch(() => undefined);
    expect([await count("IDB", "ok"), await count("IDB", "rejected"), await count("IDB", "error"), await count("IDB", "timeout")]).toEqual([1, 1, 1, 1]);
    const hist = (await metrics().fptDuration.get()).values.find((v) => v.labels["op"] === "IDB" && v.metricName === "khaibao_fpt_request_duration_seconds_count");
    expect(hist?.value).toBe(4);
  });
});
