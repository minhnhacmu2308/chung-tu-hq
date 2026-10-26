import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FptRestClient, FptTransientError } from "./fpt-rest-client.js";
import { FptVnaccsGateway } from "./fpt-vnaccs-gateway.js";

// Phản hồi thật của FPT (đã che terminal key) – cùng bộ mẫu mà apps/fpt-mock phải khớp.
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../../../../apps/fpt-mock/src/fixtures/${name}`, import.meta.url), "utf8")) as Record<string, unknown>;
const SUCCESS = fixture("eda-response-success.json");
const PAST_DEPARTURE = fixture("eda-response-past-departure.json");
const REQUEST = fixture("eda-request.json");
const CREDS = { useR_ID: "BI820001", password: "12345678", terminaL_ID: "Z0000M", terminaL_ACCESS_KEY: "MOCKTERMINALKEY0" };

type Call = { path: string; auth: string | null; body: Record<string, unknown> };
/** fetch giả: ghi lại lời gọi, trả lời theo `routes[path]` (hàm nhận số thứ tự lần gọi path đó). */
function fakeFetch(routes: Record<string, (n: number, call: Call) => Response>) {
  const calls: Call[] = [];
  const count: Record<string, number> = {};
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const call: Call = { path, auth: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> };
    calls.push(call);
    count[path] = (count[path] ?? 0) + 1;
    const route = routes[path];
    return route ? route(count[path], call) : new Response("", { status: 404 });
  }) as typeof fetch;
  return { fn, calls };
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const login = (n: number) => ok({ token: `tok-${n}`, expiration: "2026-10-14T18:02:22Z" });
const NOW = new Date("2026-10-14T15:01:21Z");
const client = (fetchFn: typeof fetch, now = () => NOW) => new FptRestClient({ baseUrl: "http://fpt.test/", username: "test", password: "pw", fetch: fetchFn, now });

describe("FptRestClient", () => {
  it("đăng nhập trước, gửi Bearer + objVNACCS_ACCOUNT; lần gọi sau dùng lại token", async () => {
    const f = fakeFetch({ "/api/auth/login": login, "/api/EDA": () => ok(SUCCESS) });
    const c = client(f.fn);
    await c.post("EDA", { objVN_EDA: {} }, CREDS);
    await c.post("EDA", { objVN_EDA: {} }, CREDS);
    expect(f.calls.map((x) => x.path)).toEqual(["/api/auth/login", "/api/EDA", "/api/EDA"]);
    expect(f.calls[0]!.body).toEqual({ username: "test", password: "pw" });
    expect(f.calls[1]!.auth).toBe("Bearer tok-1");
    expect(f.calls[1]!.body["objVNACCS_ACCOUNT"]).toEqual(CREDS);
  });
  it("token sắp hết hạn → đăng nhập lại trước khi gọi", async () => {
    const f = fakeFetch({ "/api/auth/login": login, "/api/EDA": () => ok(SUCCESS) });
    let now = NOW;
    const c = client(f.fn, () => now);
    await c.post("EDA", {}, CREDS);
    now = new Date("2026-10-14T17:58:00Z"); // còn < 5 phút
    await c.post("EDA", {}, CREDS);
    expect(f.calls.filter((x) => x.path === "/api/auth/login")).toHaveLength(2);
    expect(f.calls.at(-1)!.auth).toBe("Bearer tok-2");
  });
  it("nghiệp vụ trả 401 → đăng nhập lại đúng một lần rồi gửi lại", async () => {
    const f = fakeFetch({ "/api/auth/login": login, "/api/EDA": (n) => (n === 1 ? new Response("", { status: 401 }) : ok(SUCCESS)) });
    await client(f.fn).post("EDA", {}, CREDS);
    expect(f.calls.map((x) => `${x.path} ${x.auth ?? ""}`.trim())).toEqual(["/api/auth/login", "/api/EDA Bearer tok-1", "/api/auth/login", "/api/EDA Bearer tok-2"]);
  });
  it("nhiều lời gọi song song chỉ đăng nhập một lần", async () => {
    const f = fakeFetch({ "/api/auth/login": login, "/api/EDA": () => ok(SUCCESS) });
    const c = client(f.fn);
    await Promise.all([c.post("EDA", {}, CREDS), c.post("EDA", {}, CREDS), c.post("EDA", {}, CREDS)]);
    expect(f.calls.filter((x) => x.path === "/api/auth/login")).toHaveLength(1);
  });
  it("sai tài khoản API → INTEGRATION_NOT_CONFIGURED (không retry)", async () => {
    const f = fakeFetch({ "/api/auth/login": () => new Response("", { status: 401 }) });
    await expect(client(f.fn).post("EDA", {}, CREDS)).rejects.toMatchObject({ code: "INTEGRATION_NOT_CONFIGURED" });
  });
  it.each([429, 500, 503])("HTTP %i → FptTransientError (BullMQ retry)", async (status) => {
    const f = fakeFetch({ "/api/auth/login": login, "/api/EDA": () => new Response("", { status }) });
    await expect(client(f.fn).post("EDA", {}, CREDS)).rejects.toBeInstanceOf(FptTransientError);
  });
  it("mất kết nối → FptTransientError", async () => {
    const c = client((async () => { throw new TypeError("fetch failed"); }) as typeof fetch);
    await expect(c.post("EDA", {}, CREDS)).rejects.toBeInstanceOf(FptTransientError);
  });
  it("HTTP 404 → GATEWAY_ERROR gợi ý sửa đường dẫn", async () => {
    const f = fakeFetch({ "/api/auth/login": login });
    await expect(client(f.fn).post("IEX", {}, CREDS)).rejects.toMatchObject({ code: "GATEWAY_ERROR", message: expect.stringContaining("FPT_PATHS") });
  });
});

describe("FptVnaccsGateway (phản hồi thật của FPT)", () => {
  const gateway = (routes: Parameters<typeof fakeFetch>[0]) => {
    const f = fakeFetch({ "/api/auth/login": login, ...routes });
    return { g: new FptVnaccsGateway(client(f.fn), { get: async () => CREDS }), calls: f.calls };
  };
  const request = { objVN_EDA: REQUEST["objVN_EDA"], objVN_EDA_CON: REQUEST["objVN_EDA_CON"], objVN_EDA_CTHQ: REQUEST["objVN_EDA_CTHQ"], objVN_EDA_HANG: REQUEST["objVN_EDA_HANG"] };

  it("EDA thành công → externalId = số tờ khai trong objEDA[0]", async () => {
    const { g } = gateway({ "/api/EDA": () => ok(SUCCESS) });
    const res = await g.preDeclare("org1", { kind: "EDA", request });
    expect(res).toMatchObject({ externalId: "309062686130", declarationNo: "309062686130" });
    // Thông tin Hải quan trả về đọc từ cùng phản hồi: HS đại diện, tên Chi cục, tỷ giá, trị giá từng dòng.
    expect("info" in res ? res.info : undefined).toMatchObject({ declarationNo: "309062686130", representativeHs: "5512", customsOfficeName: "CCHQTN", exchangeRates: [{ currency: "USD", rate: "25720" }], items: [{ lineNo: 1, hsCode: "55121900" }] });
  });
  it("EDA lỗi S1139 → errors kèm chỉ tiêu và cách khắc phục, bỏ \\r\\n", async () => {
    const { g } = gateway({ "/api/EDA": () => ok(PAST_DEPARTURE) });
    expect((await g.preDeclare("org1", { kind: "EDA", request })).errors).toEqual([
      { code: "S1139", field: "SYM", message: "Ngày hàng đi dự kiến là ngày trong quá khứ khi so với Ngày khai báo (Dự kiến)", solution: "Kiểm tra nội dung đã nhập." },
    ]);
  });
  it("EDC gửi tK_ECN dạng số, đọc phân luồng từ objVN_EDA_TRANGTHAI", async () => {
    const declared = structuredClone(SUCCESS) as { objEDA: { objVN_EDA_TRANGTHAI: Record<string, unknown> }[] };
    declared.objEDA[0]!.objVN_EDA_TRANGTHAI["tK_LUONG"] = "2";
    const { g, calls } = gateway({ "/api/EDC": () => ok(declared) });
    expect(await g.declare("org1", { kind: "EDC", externalId: "309062686130" })).toMatchObject({ accepted: true, channel: "YELLOW", info: { declarationNo: "309062686130" } });
    expect(calls.at(-1)!.body["tK_ECN"]).toBe(309062686130);
  });
  it("IEX: chưa thông quan → nhãn trạng thái tiếng Việt, không cleared", async () => {
    const { g } = gateway({ "/api/IEX": () => ok(SUCCESS) });
    expect(await g.queryStatus("org1", "309062686130")).toMatchObject({ status: "Khai báo tạm (IDA)", cleared: false, declarationNo: "309062686130", info: { declarationNo: "309062686130" } });
  });
  const hys = { dossierId: "dos_1", customsOffice: "03CE", processingUnit: "01", procedureCode: "A02", phone: "0901", internalRef: "HS-NK-2610-021", note: null, files: [{ name: "ds.xlsx", bytes: Buffer.from("x") }] };
  it("HYS: request đủ chỉ tiêu sheet HYS (tK_TSB theo bộ), đọc tK_JNO + tK_YMD dd/MM/yyyy → YYYY-MM-DD", async () => {
    const { g, calls } = gateway({ "/api/HYS": () => ok({ tK_JNO: "300000000123", tK_YMD: "26/10/2026", tK_CH: "03CE" }) });
    expect(await g.attachDocuments("org1", hys)).toEqual({ receiptNo: "300000000123", registeredOn: "2026-10-26" });
    expect(calls.at(-1)!.body).toMatchObject({ tK_CH: "03CE", tK_CHB: "01", tK_TSB: "A02", tK_STL: "0901", tK_REF: "HS-NK-2610-021", tK_KJJ: "", lisT_FILE: [{ filE_NAME: "ds.xlsx", filE_BASE64: Buffer.from("x").toString("base64") }] });
  });
  it("HYS: tK_JNO / tK_STL dạng số → chuỗi; phản hồi sai dạng → DomainError GATEWAY_ERROR (lỗi vĩnh viễn, không retry)", async () => {
    const num = gateway({ "/api/HYS": () => ok({ tK_JNO: 300000000124, tK_STL: 901, tK_YMD: "26/10/2026 10:00:00" }) });
    expect(await num.g.attachDocuments("org1", hys)).toEqual({ receiptNo: "300000000124", registeredOn: "2026-10-26" });
    const bad = gateway({ "/api/HYS": () => ok({ tK_JNO: { so: "1" } }) });
    await expect(bad.g.attachDocuments("org1", hys)).rejects.toMatchObject({ code: "GATEWAY_ERROR", message: expect.stringMatching(/tK_JNO/) });
  });
  it("HYS: thiếu TK_CH → lỗi E-SCHEMA, không gọi mạng; errorList → errors", async () => {
    const { g, calls } = gateway({ "/api/HYS": () => ok({ errorList: [{ errorCode: "E1", errorContent: "Sai mã thủ tục" }] }) });
    expect((await g.attachDocuments("org1", { ...hys, customsOffice: "" })).errors?.[0]).toMatchObject({ code: "E-SCHEMA" });
    expect(calls).toHaveLength(0);
    expect(await g.attachDocuments("org1", hys)).toEqual({ errors: [{ code: "E1", message: "Sai mã thủ tục" }] });
  });
  it("chưa có tài khoản VNACCS → INTEGRATION_NOT_CONFIGURED, không gọi mạng", async () => {
    const f = fakeFetch({});
    const g = new FptVnaccsGateway(client(f.fn), { get: async () => null });
    await expect(g.preDeclare("org1", { kind: "EDA", request })).rejects.toMatchObject({ code: "INTEGRATION_NOT_CONFIGURED" });
    expect(f.calls).toHaveLength(0);
  });
});

describe("FptVnaccsGateway.send – nghiệp vụ chưa có đặc tả FPT", () => {
  const g = new FptVnaccsGateway({ post: async () => { throw new Error("không được gọi HTTP"); } }, { get: async () => null });
  it.each(["IDB", "IDD", "IDA01", "IDE", "CONT", "PORT_FEE"] as const)("%s → NOT_SUPPORTED nêu chưa có đặc tả, không gọi HTTP", async (op) => {
    await expect(g.send("org", { op })).rejects.toMatchObject({ code: "NOT_SUPPORTED", message: expect.stringMatching(new RegExp(`${op}.*chưa có đặc tả API FPT`)) });
  });
  it.each(["AMB", "AMC"] as const)("%s → NOT_SUPPORTED (chưa có đặc tả API FPT)", async (op) => {
    await expect(g.send("org", { op })).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
  });
  it("AMA sai đặc tả (thiếu objVN_AMA) → lỗi theo chỉ tiêu, không gọi HTTP", async () => {
    expect((await g.send("org", { op: "AMA", request: {} })).errors?.length).toBeGreaterThan(0);
  });
  it("AMA đúng đặc tả → POST AMA, số tờ khai bổ sung từ objAMA[0].objVN_AMA.tK_SYN", async () => {
    const calls: string[] = [];
    const ok = new FptVnaccsGateway(
      { post: async (op) => (calls.push(op), { errorList: null, objAMA: [{ objVN_AMA: { tK_SYN: "308173826831" } }] }) },
      { get: async () => ({ useR_ID: "u", password: "p", terminaL_ID: "t", terminaL_ACCESS_KEY: "k" }) },
    );
    const res = await ok.send("org", { op: "AMA", request: { objVN_AMA: { tK_ICN: 108173826831, tK_ICB: "A12", tK_CHS: "10BB", tK_CHB: "00", tK_IDD: "23/04/2026", tK_IPD: "28/04/2026", tK_REC: "6", tK_TTC: "VND" }, objVN_AMA_HANG: [{ haG_RAN: "01" }] } });
    expect(calls).toEqual(["AMA"]);
    expect(res).toMatchObject({ receiptNo: "308173826831" });
  });
});
