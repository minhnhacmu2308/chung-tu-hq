import { describe, expect, it } from "vitest";
import { domainError } from "../shared/errors.js";
import { FptTransientError } from "../modules/integration/infrastructure/fpt-rest-client.js";
import { metricsAccess } from "./auth.js";
import { addAiCostVnd, configureMetrics, fptOutcome, metrics, metricsText, observeAiCall, observeHttp, registerQueueCollector, routeTemplate, statusClass, type QueueCountSource } from "./metrics.js";

const value = async (name: string, labels: Record<string, string>) => {
  const all = await metrics().registry.getSingleMetric(name)!.get();
  return all.values.find((v) => Object.entries(labels).every(([k, x]) => v.labels[k] === x))?.value;
};

describe("metricsAccess – chặn /metrics bằng Bearer token", () => {
  const T = "a".repeat(64);
  it("không đặt token → disabled (web 404, worker không mở cổng)", () => {
    expect(metricsAccess(`Bearer ${T}`, undefined)).toBe("disabled");
    expect(metricsAccess(`Bearer ${T}`, "")).toBe("disabled");
  });
  it("thiếu header, sai kiểu, sai token, token là tiền tố → unauthorized", () => {
    expect(metricsAccess(null, T)).toBe("unauthorized");
    expect(metricsAccess("", T)).toBe("unauthorized");
    expect(metricsAccess(`Basic ${T}`, T)).toBe("unauthorized");
    expect(metricsAccess("Bearer sai", T)).toBe("unauthorized");
    expect(metricsAccess(`Bearer ${T.slice(0, 10)}`, T)).toBe("unauthorized");
    expect(metricsAccess(`Bearer ${T} thua`, T)).toBe("unauthorized");
  });
  it("đúng token → ok (không phân biệt hoa thường chữ Bearer)", () => {
    expect(metricsAccess(`Bearer ${T}`, T)).toBe("ok");
    expect(metricsAccess(`bearer ${T}`, T)).toBe("ok");
  });
});

describe("routeTemplate – nhãn route ít giá trị", () => {
  it("thay giá trị tham số động bằng :tên", () => {
    expect(routeTemplate("/api/dossiers/dos_01JABCDEFGHJKMNPQRSTVWXYZ0/fields/INV_NO", { id: "dos_01JABCDEFGHJKMNPQRSTVWXYZ0", code: "INV_NO" })).toBe("/api/dossiers/:id/fields/:code");
    expect(routeTemplate("/api/org/declaration-profile/IMPORT", { dir: "IMPORT" })).toBe("/api/org/declaration-profile/:dir");
  });
  it("giá trị mã hóa URL vẫn khớp tham số", () => {
    expect(routeTemplate("/api/x/a%20b", { name: "a b" })).toBe("/api/x/:name");
  });
  it("catch-all → :tên*", () => {
    expect(routeTemplate("/api/files/a/b/c.pdf", { path: ["a", "b", "c.pdf"] })).toBe("/api/files/:path*");
  });
  it("không có params mà đoạn trông như id (số, uuid, ulid, prefix_id) → :id; đoạn tĩnh giữ nguyên", () => {
    expect(routeTemplate("/api/dossiers/12345/events")).toBe("/api/dossiers/:id/events");
    expect(routeTemplate("/api/x/3f2b8a9c-1d2e-4f5a-8b9c-0d1e2f3a4b5c")).toBe("/api/x/:id");
    expect(routeTemplate("/api/x/01JABCDEFGHJKMNPQRSTVWXYZ0")).toBe("/api/x/:id");
    expect(routeTemplate("/api/line-items/li_01jabcdefghjkm/hs/confirm")).toBe("/api/line-items/:id/hs/confirm");
    expect(routeTemplate("/api/dossiers/draft/")).toBe("/api/dossiers/draft");
    expect(routeTemplate("/api/health")).toBe("/api/health");
  });
  it("statusClass", () => {
    expect([statusClass(200), statusClass(204), statusClass(404), statusClass(503), statusClass(0)]).toEqual(["2xx", "2xx", "4xx", "5xx", "other"]);
  });
  it("observeHttp ghi counter + histogram theo route mẫu", async () => {
    observeHttp("GET", "/api/test-route/:id", 503, 0.2);
    expect(await value("khaibao_http_requests_total", { method: "GET", route: "/api/test-route/:id", status_class: "5xx" })).toBe(1);
  });
});

describe("fptOutcome – kết quả lời gọi FPT.VNACCS", () => {
  it("không lỗi → ok", () => expect(fptOutcome(undefined)).toBe("ok"));
  it("timeout → timeout; lỗi tạm (mạng/429/5xx) → error", () => {
    expect(fptOutcome(new FptTransientError("FPT không phản hồi", undefined, true))).toBe("timeout");
    expect(fptOutcome(new FptTransientError("FPT trả HTTP 502", 502))).toBe("error");
  });
  it("DomainError (4xx, sai định dạng, token bị từ chối, chưa cấu hình) → rejected", () => {
    expect(fptOutcome(domainError("GATEWAY_ERROR", "FPT trả HTTP 400"))).toBe("rejected");
    expect(fptOutcome(domainError("INTEGRATION_NOT_CONFIGURED", "sai tài khoản"))).toBe("rejected");
  });
  it("lỗi lạ → error", () => expect(fptOutcome(new Error("boom"))).toBe("error"));
});

describe("queue gauge – đọc số job lúc scrape", () => {
  it("mỗi queue × trạng thái một giá trị; queue lỗi Redis bị bỏ qua, scrape vẫn thành công", async () => {
    const fake = (name: string, counts: Record<string, number>): QueueCountSource => ({ name, getJobCounts: async (...types) => Object.fromEntries(types.map((t) => [t, counts[t] ?? 0])) });
    const broken: QueueCountSource = { name: "broken", getJobCounts: async () => { throw new Error("redis down"); } };
    registerQueueCollector([fake("extract-document", { waiting: 7, active: 2, delayed: 1, failed: 3 }), broken]);
    const { body } = await metricsText();
    expect(body).toMatch(/khaibao_queue_jobs\{queue="extract-document",state="waiting"[^}]*\} 7/);
    expect(body).toMatch(/khaibao_queue_jobs\{queue="extract-document",state="failed"[^}]*\} 3/);
    expect(body).not.toContain('queue="broken"');
    // Đăng ký lại (worker khởi động lại trong cùng tiến trình test) thay nguồn, không đăng ký trùng metric.
    registerQueueCollector([fake("customs-send", { waiting: 1 })]);
    const again = (await metricsText()).body;
    expect(again).toMatch(/khaibao_queue_jobs\{queue="customs-send",state="waiting"[^}]*\} 1/);
    expect(again).not.toContain('queue="extract-document"');
  });
});

describe("AI + build_info", () => {
  it("observeAiCall: ok / AiDataError → invalid / lỗi khác → error", async () => {
    await observeAiCall("AI_TEST", "m1", async () => 1);
    const dataErr = Object.assign(new Error("x"), { name: "AiDataError" });
    await expect(observeAiCall("AI_TEST", "m1", async () => { throw dataErr; })).rejects.toBe(dataErr);
    await expect(observeAiCall("AI_TEST", "m1", async () => { throw new Error("529"); })).rejects.toThrow("529");
    for (const outcome of ["ok", "invalid", "error"]) expect(await value("khaibao_ai_calls_total", { kind: "AI_TEST", model: "m1", outcome })).toBe(1);
  });
  it("addAiCostVnd bỏ qua số không dương", async () => {
    addAiCostVnd("AI_COST_TEST", 1250.5);
    addAiCostVnd("AI_COST_TEST", 0);
    addAiCostVnd("AI_COST_TEST", Number.NaN);
    expect(await value("khaibao_ai_cost_vnd_total", { kind: "AI_COST_TEST" })).toBe(1250.5);
  });
  it("configureMetrics gắn service + build_info (commit cắt 12 ký tự, thiếu → unknown)", async () => {
    configureMetrics({ service: "worker", version: "1.2.3", commit: "0123456789abcdef" });
    let body = (await metricsText()).body;
    expect(body).toMatch(/khaibao_build_info\{[^}]*version="1\.2\.3"[^}]*commit="0123456789ab"[^}]*service="worker"[^}]*\} 1/);
    configureMetrics({ service: "web", version: undefined, commit: undefined });
    body = (await metricsText()).body;
    expect(body).toMatch(/khaibao_build_info\{version="unknown",commit="unknown",service="web"\} 1/);
    expect(body).not.toContain('commit="0123456789ab"');
  });
});
