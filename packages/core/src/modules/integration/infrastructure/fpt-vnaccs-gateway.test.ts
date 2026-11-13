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

describe("FptVnaccsGateway.send – gọi lại, sửa đổi, AMB/AMC (Postman FPT + Excel)", () => {
  const ACC = { get: async () => ({ useR_ID: "u", password: "p", terminaL_ID: "t", terminaL_ACCESS_KEY: "k" }) };
  /** HTTP giả: ghi (nghiệp vụ, body), trả `reply(op)`. */
  const rec = (reply: (op: string) => unknown = () => ({ errorList: null })) => {
    const calls: { op: string; body: Record<string, unknown> }[] = [];
    return { calls, g: new FptVnaccsGateway({ post: async (op, body) => (calls.push({ op, body: body as Record<string, unknown> }), reply(op)) }, ACC) };
  };
  const g = new FptVnaccsGateway({ post: async () => { throw new Error("không được gọi HTTP"); } }, { get: async () => null });
  it.each([["IDB", "tK_ICN"], ["IDD", "tK_ICN"], ["EDB", "tK_ECN"], ["EDD", "tK_ECN"], ["IDE", "tK_ICN"], ["EDE", "tK_ECN"]] as const)("%s → POST %s theo số tờ khai (number)", async (op, field) => {
    const r = rec();
    const res = await r.g.send("org", { op, externalId: "104265243240" });
    expect(r.calls).toEqual([{ op, body: { [field]: 104265243240 } }]);
    expect(res.errors).toBeUndefined();
  });
  it("IDE trả phân luồng từ objVN_IDA_TRANGTHAI.tK_LUONG", async () => {
    const r = rec(() => ({ errorList: null, objIDA: [{ objMsgResult: { code: "VAD2LE0" }, objVN_IDA_TRANGTHAI: { tK_LUONG: "2", tK_TRANGTHAI: "E" } }] }));
    expect((await r.g.send("org", { op: "IDE", externalId: "104265243240" })).channel).toBe("YELLOW");
  });
  it("IDA01: kiểm đặc tả IDA, đầu tờ khai mang số tờ khai đã đăng ký", async () => {
    const r = rec();
    const bad = await r.g.send("org", { op: "IDA01", externalId: "1", request: {} });
    expect(bad.errors?.length).toBeGreaterThan(0);
    expect(r.calls).toHaveLength(0);
  });
  it("EDA01: chỉ thị Hải quan gửi lại NGUYÊN VĂN (giữ khoảng trắng, không qua schema); đầu tờ khai mang số tờ khai", async () => {
    const r = rec(() => ({ errorList: null, objEDA: [{ objMsgResult: { code: "VAE1LA0" } }] }));
    const cthq = { cthQ_CCM: "A", cthQ_D01: "20/10/2026", cthQ_T01: " Bổ sung  C/O ", cthQ_I01: "Nộp bản chính C/O   form E  " };
    const request = { objVN_EDA: REQUEST["objVN_EDA"], objVN_EDA_CON: REQUEST["objVN_EDA_CON"], objVN_EDA_HANG: REQUEST["objVN_EDA_HANG"], objVN_EDA_CTHQ: cthq };
    expect((await r.g.send("org", { op: "EDA01", externalId: "309062686130", request })).errors).toBeUndefined();
    expect(r.calls[0]!.body["objVN_EDA_CTHQ"]).toEqual(cthq);
    expect((r.calls[0]!.body["objVN_EDA"] as Record<string, unknown>)["tK_ECN"]).toBe(309062686130);
  });
  it("VNACCSREP: thông điệp loại B giữ ediBase64 + loại", async () => {
    const r = rec(() => ({ errorList: null, objEDA: [{ objMsgResult: { code: "VAE1LF0", name: "Thông quan", type: "B", ediBase64: "RURJ", time: "01/11/2026 10:00" }, objVN_EDA: { tK_ECN: 309062686130 } }] }));
    expect(await r.g.pullMessages("org")).toMatchObject([{ kind: "EDA", code: "VAE1LF0", declarationNo: "309062686130", msgType: "B", ediBase64: "RURJ" }]);
  });
  it("AMB/AMC: body tK_SYN (number); thiếu tK_SYN → lỗi, không gọi HTTP", async () => {
    const r = rec();
    expect((await r.g.send("org", { op: "AMB", request: {} })).errors?.[0]?.code).toBe("E-AMA-NO-SYN");
    expect(r.calls).toHaveLength(0);
    expect(await r.g.send("org", { op: "AMC", request: { tK_SYN: "308173826831" } })).toMatchObject({ receiptNo: "308173826831" });
    expect(r.calls).toEqual([{ op: "AMC", body: { tK_SYN: 308173826831 } }]);
  });
  it.each(["CONT", "PORT_FEE"] as const)("%s → NOT_SUPPORTED, không gọi HTTP", async (op) => {
    await expect(g.send("org", { op })).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
  });
  it("queryStatus: nhập → IID {tK_ICN}, xuất → IEX {tK_ECN}; không truyền chiều thì suy từ số (3… = xuất)", async () => {
    const r = rec((op) => ({ errorList: null, [op === "IEX" ? "objEDA" : "objIDA"]: [{ [op === "IEX" ? "objVN_EDA_TRANGTHAI" : "objVN_IDA_TRANGTHAI"]: { tK_LUONG: "1", tK_TRANGTHAI: "C", tK_THONGQUAN: "1" } }] }));
    expect((await r.g.queryStatus("org", "104265243240", "d", "NK")).cleared).toBe(true);
    await r.g.queryStatus("org", "309062686130", "d");
    expect(r.calls).toEqual([{ op: "IID", body: { tK_ICN: 104265243240 } }, { op: "IEX", body: { tK_ECN: 309062686130 } }]);
  });
  it("pullMessages: VNACCSREP → thông điệp theo số tờ khai (+ trạng thái), AMA theo tK_SYN", async () => {
    const r = rec(() => ({
      errorList: null,
      objIDA: [{ objMsgResult: { code: "VAD1LD0", name: "Phân luồng", type: "P", time: "14/10/2026 10:00:00" }, objVN_IDA: { tK_ICN: 104265243240 }, objVN_IDA_TRANGTHAI: { tK_LUONG: "1", tK_TRANGTHAI: "C", tK_THONGQUAN: "0" } }],
      objAMA: [{ objMsgResult: { code: "VAL8050", name: "Chấp nhận" }, objVN_AMA: { tK_SYN: 308173826831 } }],
    }));
    const msgs = await r.g.pullMessages("org");
    expect(r.calls[0]!.op).toBe("VNACCSREP");
    expect(msgs.map((m) => [m.kind, m.code, m.declarationNo, m.status?.channel])).toEqual([["IDA", "VAD1LD0", "104265243240", "GREEN"], ["AMA", "VAL8050", "308173826831", undefined]]);
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

describe("FptVnaccsGateway – danh sách container (V5ContainerReq/Res) và KVGS", () => {
  const gateway = (routes: Parameters<typeof fakeFetch>[0]) => {
    const f = fakeFetch({ "/api/auth/login": login, ...routes });
    return { g: new FptVnaccsGateway(client(f.fn), { get: async () => CREDS }), calls: f.calls };
  };
  const req = {
    declarationNo: "108007708100", registeredOn: "2026-02-27", typeCode: "A11", customsOffice: "02CI", taxCode: "0316789012", companyName: "CONG TY AN PHAT", userId: "BI820001",
    rows: [{ billNo: "BL1", containerNo: "FBIU5802429", sealNo: "S1", note: "" }],
  };
  const { rows: _rows, ...head } = req;

  it("V5ContainerReq: ngày dd/MM/yyyy, body phẳng có USER_ID, không mật khẩu / objVNACCS_ACCOUNT; trả REF_ID", async () => {
    const { g, calls } = gateway({ "/api/V5ContainerReq": () => ok({ reF_ID: "REF-1", errorList: null }) });
    expect(await g.sendContainerList("org", req, "k")).toEqual({ refId: "REF-1" });
    const body = calls.at(-1)!.body;
    expect(body).toMatchObject({ tK_SOTK: "108007708100", tK_NGAYDK: "27/02/2026", tK_MALH: "A11", tK_MAHQ: "02CI", mA_DV: "0316789012", useR_ID: "BI820001", hanG_CONT: [{ vD_SO: "BL1", coN_SO: "FBIU5802429", seL_SO: "S1", ghI_CHU: "" }] });
    expect(body).not.toHaveProperty("objVNACCS_ACCOUNT");
    expect(JSON.stringify(body)).not.toContain("12345678");
  });
  it("V5ContainerReq lỗi Hải quan → errors có dòng (rowPosition)", async () => {
    const { g } = gateway({ "/api/V5ContainerReq": () => ok({ errorList: [{ errorCode: "E1", indexCode: "SEL_SO", errorContent: "Thiếu seal", rowPosition: "0001" }] }) });
    const r = await g.sendContainerList("org", req, "k");
    expect(r.refId).toBeUndefined();
    expect(r.errors?.[0]).toMatchObject({ code: "E1", field: "SEL_SO", line: 1 });
  });
  it("V5ContainerRes: body không có dòng container; 12 → ACCEPTED (ngày → YYYY-MM-DD), 10 → REJECTED (KET_QUA), 11/0 → PENDING", async () => {
    const answers = [{ tranG_THAI: "12", sO_TN: 12345, ngaY_TN: "28/02/2026" }, { tranG_THAI: "10", keT_QUA: "Sai seal" }, { tranG_THAI: "11" }, { tranG_THAI: "0" }];
    const { g, calls } = gateway({ "/api/V5ContainerRes": (n) => ok({ errorList: null, ...answers[n - 1] }) });
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await g.containerListResult("org", { ...head, refId: "REF-1" }));
    expect(r[0]).toEqual({ state: "ACCEPTED", receiptNo: "12345", receiptDate: "2026-02-28" });
    expect(r[1]).toMatchObject({ state: "REJECTED", errors: [{ message: "Sai seal" }] });
    expect(r[2]).toEqual({ state: "PENDING" });
    expect(r[3]).toEqual({ state: "PENDING" });
    const body = calls.filter((c) => c.path === "/api/V5ContainerRes")[0]!.body;
    expect(body).toMatchObject({ reF_ID: "REF-1", useR_ID: "BI820001", tK_NGAYDK: "27/02/2026" });
    expect(body).not.toHaveProperty("hanG_CONT");
  });
  it("USER_ID rỗng (chưa cấu hình tài khoản VNACCS) → INTEGRATION_NOT_CONFIGURED, không gọi FPT", async () => {
    const { g, calls } = gateway({});
    await expect(g.sendContainerList("org", { ...req, userId: " " }, "k")).rejects.toMatchObject({ code: "INTEGRATION_NOT_CONFIGURED", message: expect.stringContaining("VNACCS") });
    await expect(g.containerListResult("org", { ...head, userId: "", refId: "R" })).rejects.toMatchObject({ code: "INTEGRATION_NOT_CONFIGURED" });
    expect(calls).toHaveLength(0);
  });
  const kv = { dossierId: "dos_1", declarationNo: "106123456780", registeredOn: "2026-11-10", customsOffice: "02CI", taxCode: "0312345678" };
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAIAAAUAAYRcDQAAAAAASUVORK5CYII=";
  const kvgsOk = {
    errorList: [],
    serviceMessage: {
      soDinhDanh: "101126000001", maDDGS: "02CIS01", tenDDGS: "Địa điểm giám sát mẫu", isContainer: 1, dvT_So_Luong_Hang: "PK", dvT_Tong_Trong_Luong_Hang: "KGM", so_Luong_Hang: 120, tong_Trong_Luong_Hang: 12450.5,
      tenChiCucHaiQuanGS: "Chi cục Hải quan giám sát mẫu", tenCucHaiQuan: "Cục Hải quan mẫu", tenChiCucHaiQuan: "Chi cục Hải quan đăng ký mẫu", tenDonViXNK: "Công ty Xuất nhập khẩu Mẫu", maSoThue: "0312345678",
      soToKhai: "106123456780", ngayToKhai: "10/11/2026", loaiHinh: "A11", tenLoaiHinh: "Nhập kinh doanh tiêu dùng", trangThaiToKhai: "Thông quan", luongToKhai: "Xanh", thoiGianLayDuLieu: "13/11/2026 09:30:00",
      bangKeMaVachContainer: [{ soContainer: "MSCU1234566", soSeal: "SL001234", soSealHQ: "HQ005678", barcodeImage: PNG }],
    },
  };
  it("KVGS: POST /api/KVGS một lần, Bearer, body phẳng đúng 4 trường (ngày dd/MM/yyyy, số giữ chuỗi), không tài khoản VNACCS; ACCEPTED + sheet + raw", async () => {
    const { g, calls } = gateway({ "/api/KVGS": () => ok(kvgsOk) });
    const r = await g.fetchKvgs("org", { ...kv, declarationNo: "006123456780" }, "k");
    const call = calls.find((c) => c.path === "/api/KVGS")!;
    expect(call.auth).toBe("Bearer tok-1");
    expect(call.body).toEqual({ TK_SOTK: "006123456780", TK_NGAYDK: "10/11/2026", TK_MAHQ: "02CI", MA_DV: "0312345678" });
    expect(calls.filter((c) => c.path === "/api/KVGS")).toHaveLength(1);
    expect(r.state).toBe("ACCEPTED");
    expect(r.sheet).toMatchObject({ kind: "CONTAINER", declarationNo: "106123456780", cargoControlNo: "101126000001", exportedAt: "2026-11-13T02:30:00.000Z", containers: [{ containerNo: "MSCU1234566", barcodeImage: PNG }] });
    expect(r.raw).toEqual(kvgsOk);
  });
  it("KVGS không cần tài khoản VNACCS của doanh nghiệp (chỉ JWT FPT_API_*): credentials reader trả null vẫn gọi được", async () => {
    const f = fakeFetch({ "/api/auth/login": login, "/api/KVGS": () => ok(kvgsOk) });
    const g = new FptVnaccsGateway(client(f.fn), { get: async () => null });
    expect((await g.fetchKvgs("org", kv, "k")).state).toBe("ACCEPTED");
    expect(f.calls.find((c) => c.path === "/api/KVGS")!.body).not.toHaveProperty("objVNACCS_ACCOUNT");
  });
  it("FptRestClient: thiếu tài khoản VNACCS cho nghiệp vụ cần tài khoản → INTEGRATION_NOT_CONFIGURED, không gọi FPT", async () => {
    const f = fakeFetch({ "/api/auth/login": login });
    await expect(client(f.fn).post("IID", { tK_ICN: 1 }, null)).rejects.toMatchObject({ code: "INTEGRATION_NOT_CONFIGURED" });
    expect(f.calls).toHaveLength(0);
  });
  it("KVGS errorList (thiếu TK_SOTK) → REJECTED, lỗi chuẩn hóa, raw giữ nguyên", async () => {
    const bad = { errorList: [{ errorCode: "000", indexCode: "000", nameCode: "TK_SOTK", errorContent: "Không được để trống TK_SOTK", proposedSolution: "Vui lòng nhập TK_SOTK", rowPosition: "0" }], serviceMessage: null };
    const { g } = gateway({ "/api/KVGS": () => ok(bad) });
    expect(await g.fetchKvgs("org", kv, "k")).toEqual({ state: "REJECTED", raw: bad, errors: [{ code: "000", field: "TK_SOTK", message: "Không được để trống TK_SOTK", solution: "Vui lòng nhập TK_SOTK" }] });
  });
  it("KVGS thiếu dữ liệu để in (container không có dòng) → REJECTED KVGS_RESPONSE_INCOMPLETE + raw", async () => {
    const res = { ...kvgsOk, serviceMessage: { ...kvgsOk.serviceMessage, bangKeMaVachContainer: [] } };
    const { g } = gateway({ "/api/KVGS": () => ok(res) });
    expect(await g.fetchKvgs("org", kv, "k")).toMatchObject({ state: "REJECTED", raw: res, errors: [{ code: "KVGS_RESPONSE_INCOMPLETE" }] });
  });
  it("KVGS: ngày đăng ký / số tờ khai / mã HQ / MST không hợp lệ → DomainError (lỗi vĩnh viễn) trước khi gọi FPT", async () => {
    const { g, calls } = gateway({});
    await expect(g.fetchKvgs("org", { ...kv, registeredOn: "10/11/2026x" }, "k")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(g.fetchKvgs("org", { ...kv, declarationNo: " " }, "k")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(g.fetchKvgs("org", { ...kv, customsOffice: "" }, "k")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(g.fetchKvgs("org", { ...kv, taxCode: " " }, "k")).rejects.toMatchObject({ code: "VALIDATION" });
    expect(calls.filter((c) => c.path === "/api/KVGS")).toHaveLength(0);
  });
  it("KVGS: phản hồi không có thoiGianLayDuLieu → exportedAt lấy từ đồng hồ được tiêm (không phải new Date())", async () => {
    const { thoiGianLayDuLieu: _t, ...msg } = kvgsOk.serviceMessage;
    const f = fakeFetch({ "/api/auth/login": login, "/api/KVGS": () => ok({ ...kvgsOk, serviceMessage: msg }) });
    const g = new FptVnaccsGateway(client(f.fn), { get: async () => null }, { now: () => new Date("2031-01-02T03:04:05.000Z") });
    const r = await g.fetchKvgs("org", kv, "k");
    expect(r).toMatchObject({ state: "ACCEPTED", sheet: { exportedAt: "2031-01-02T03:04:05.000Z" } });
  });
  it("KVGS: HTTP 503 → lỗi tạm (retry); HTTP 400 → DomainError (không retry)", async () => {
    const { g } = gateway({ "/api/KVGS": (n) => (n === 1 ? new Response("down", { status: 503 }) : new Response("{\"errors\":{}}", { status: 400 })) });
    await expect(g.fetchKvgs("org", kv, "k")).rejects.toBeInstanceOf(FptTransientError);
    await expect(g.fetchKvgs("org", kv, "k")).rejects.toMatchObject({ code: "GATEWAY_ERROR", message: expect.stringContaining("HTTP 400") });
  });
});
