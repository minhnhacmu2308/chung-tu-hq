import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFptMock, type MockOptions } from "./app.js";
import edaRequest from "./fixtures/eda-request.json" with { type: "json" };
import pastDepartureRequest from "./fixtures/eda-request-past-departure.json" with { type: "json" };
import pastDepartureResponse from "./fixtures/eda-response-past-departure.json" with { type: "json" };
import successResponse from "./fixtures/eda-response-success.json" with { type: "json" };
import wrongPasswordResponse from "./fixtures/eda-response-wrong-password.json" with { type: "json" };

// Thời điểm của mẫu thật: 14/10/2026 22:01:21 giờ VN.
const NOW = new Date("2026-10-14T15:01:21Z");
let server: Server;
let base: string;
let clock: Date;
const start = async (opts: MockOptions = {}) => {
  const mock = createFptMock({ now: () => clock, nextDeclarationNo: () => "309062686130", ...opts });
  server = createServer(mock.handler);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
};
const post = (path: string, body: unknown, token?: string) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const login = async () => ((await (await post("/api/auth/login", { username: "test", password: "test" })).json()) as { token: string }).token;
const clone = <T>(o: T): T => structuredClone(o);

beforeEach(async () => { clock = NOW; await start(); });
afterEach(() => new Promise<void>((r) => server.close(() => r())));

describe("fpt-mock: đăng nhập", () => {
  it("trả token + expiration (UTC, không mili giây) đúng dạng mẫu thật", async () => {
    const res = await post("/api/auth/login", { username: "test", password: "test" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expiration: string };
    expect(Object.keys(body)).toEqual(["token", "expiration"]);
    expect(body.token.split(".")).toHaveLength(3);
    expect(body.expiration).toBe("2026-10-14T18:01:21Z");
  });
  it("sai mật khẩu API → 401", async () => {
    expect((await post("/api/auth/login", { username: "test", password: "x" })).status).toBe(401);
  });
  it("gọi EDA không có token, token sai hoặc hết hạn → 401 kèm WWW-Authenticate", async () => {
    expect((await post("/api/EDA", edaRequest)).status).toBe(401);
    expect((await post("/api/EDA", edaRequest, "abc.def.ghi")).status).toBe(401);
    const token = await login();
    clock = new Date(NOW.getTime() + 3 * 3600_000 + 1000);
    const res = await post("/api/EDA", edaRequest, token);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("token expired");
  });
});

describe("fpt-mock: EDA", () => {
  it("curl thành công → response khớp từng key/giá trị với OUTPUT_API_THANH_CONG", async () => {
    const res = await post("/api/EDA", edaRequest, await login());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(successResponse);
  });
  it("ngày hàng đi trong quá khứ → đúng y lỗi S1139 của mẫu thật", async () => {
    const res = await post("/api/EDA", pastDepartureRequest, await login());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(pastDepartureResponse);
  });
  it("sai mật khẩu VNACCS → A0004 lặp 2 lần như mẫu thật", async () => {
    const req = clone(edaRequest);
    req.objVNACCS_ACCOUNT.password = "99999999999";
    expect(await (await post("/api/EDA", req, await login())).json()).toEqual(wrongPasswordResponse);
  });
  it("thiếu chỉ tiêu bắt buộc → errorList mã MOCK-REQ, có rowPosition dòng hàng", async () => {
    const req = clone(edaRequest) as typeof edaRequest & { objVN_EDA: Record<string, unknown>; objVN_EDA_HANG: Record<string, unknown>[] };
    req.objVN_EDA["tK_ECB"] = "";
    req.objVN_EDA_HANG[0]!["haG_CMD"] = "";
    const body = (await (await post("/api/EDA", req, await login())).json()) as { errorList: { errorCode: string; indexCode: string; rowPosition: string }[]; objEDA: unknown };
    expect(body.objEDA).toBeNull();
    expect(body.errorList.map((e) => [e.errorCode, e.indexCode, e.rowPosition])).toEqual([["MOCK-REQ", "ECB", "0000"], ["MOCK-REQ", "CMD", "0001"]]);
  });
  it("gửi lại cùng tK_ID → giữ số tờ khai cũ", async () => {
    let n = 0;
    await new Promise<void>((r) => server.close(() => r()));
    await start({ nextDeclarationNo: () => `30000000000${++n}` });
    const token = await login();
    const no = async () => ((await (await post("/api/EDA", edaRequest, token)).json()) as { objEDA: { objMsgResult: { decNumber: string } }[] }).objEDA[0]!.objMsgResult.decNumber;
    expect(await no()).toBe("300000000001");
    expect(await no()).toBe("300000000001");
  });
  it("body không phải JSON → 400 ValidationProblemDetails", async () => {
    const res = await fetch(`${base}/api/EDA`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await login()}` }, body: "{oops" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { title: string }).title).toBe("One or more validation errors occurred.");
  });
});

describe("fpt-mock: luồng đủ EDA → EDC → HYS → IEX", () => {
  it("phân luồng theo số cuối số tờ khai, thông quan sau 2 lần IEX", async () => {
    const token = await login();
    const acc = edaRequest.objVNACCS_ACCOUNT;
    await post("/api/EDA", edaRequest, token);
    const edc = (await (await post("/api/EDC", { objVNACCS_ACCOUNT: acc, tK_ECN: 309062686130 }, token)).json()) as { errorList: unknown; objEDA: { objVN_EDA_TRANGTHAI: Record<string, string> }[] };
    expect(edc.errorList).toBeNull();
    expect(edc.objEDA[0]!.objVN_EDA_TRANGTHAI).toMatchObject({ tK_LUONG: "1", tK_TRANGTHAI: "C", tK_THONGQUAN: "0" });

    const hys = (await (await post("/api/HYS", { objVNACCS_ACCOUNT: acc, tK_CH: "88AB", tK_TSB: "A99", tK_REF: "309062686130", lisT_FILE: [{ filE_NAME: "inv.pdf", filE_BASE64: Buffer.from("pdf").toString("base64") }] }, token)).json()) as Record<string, unknown>;
    expect(hys["errorList"]).toBeNull();
    expect(hys["tK_JNO"]).toBe("202600000001");

    const iex = async () => ((await (await post("/api/IEX", { objVNACCS_ACCOUNT: acc, tK_SOTK: "309062686130" }, token)).json()) as { objEDA: { objVN_EDA_TRANGTHAI: Record<string, string> }[] }).objEDA[0]!.objVN_EDA_TRANGTHAI.tK_THONGQUAN;
    expect(await iex()).toBe("0");
    expect(await iex()).toBe("1");
  });
  it("EDC với số tờ khai chưa khai trước → lỗi", async () => {
    const body = (await (await post("/api/EDC", { objVNACCS_ACCOUNT: edaRequest.objVNACCS_ACCOUNT, tK_ECN: 300000000099 }, await login())).json()) as { errorList: { indexCode: string }[] };
    expect(body.errorList[0]!.indexCode).toBe("ECN");
  });
  it("X-Mock-Fail: 503 → trả 503 để thử retry", async () => {
    const res = await fetch(`${base}/api/EDA`, { method: "POST", headers: { "x-mock-fail": "503" }, body: "{}" });
    expect(res.status).toBe(503);
  });
});

describe("fpt-mock: AMA khai bổ sung sau thông quan (giả định)", () => {
  const acc = edaRequest.objVNACCS_ACCOUNT;
  it("đủ số tờ khai, mã lý do, dòng hàng → cấp số tờ khai bổ sung; thiếu → lỗi theo chỉ tiêu", async () => {
    const token = await login();
    const ok = (await (await post("/api/AMA", { objVNACCS_ACCOUNT: acc, objVN_AMA: { tK_ICN: 108173826831, tK_REC: "6" }, objVN_AMA_HANG: [{ haG_RAN: "01" }] }, token)).json()) as { errorList: unknown; objAMA: { objVN_AMA: Record<string, unknown> }[] };
    expect(ok.errorList).toBeNull();
    expect(String(ok.objAMA[0]!.objVN_AMA["tK_SYN"])).toMatch(/^3\d{11}$/);
    const bad = (await (await post("/api/AMA", { objVNACCS_ACCOUNT: acc, objVN_AMA: {} }, token)).json()) as { errorList: { indexCode: string }[] };
    expect(bad.errorList.map((e) => e.indexCode)).toEqual(["ICN", "REC", "RAN"]);
  });
});

describe("fpt-mock: IDA tờ khai nhánh (TK_FIC / TK_BNO / TK_DNO)", () => {
  const acc = edaRequest.objVNACCS_ACCOUNT;
  const ida = (branch: Record<string, unknown>, tkId: string) => ({
    objVNACCS_ACCOUNT: acc,
    objVN_IDA: { tK_ID: tkId, tK_ICB: "A11", tK_CH: "03CE", tK_MTC: "1", tK_IMC: "0316789012", tK_IMN: "CONG TY AN PHAT", ...branch },
    objVN_IDA_HANG: [{ haG_CMD: "84821000", haG_CMN: "Vong bi cau", haG_QN1: 10, haG_QT1: "PCE", haG_BPR: 100 }],
  });
  type Res = { errorList: { errorCode: string; indexCode: string }[] | null; objIDA: { objMsgResult: { decNumber: string }; objVN_IDA: Record<string, unknown> }[] | null };
  const call = async (token: string, branch: Record<string, unknown>, tkId: string) => (await (await post("/api/IDA", ida(branch, tkId), token)).json()) as Res;
  const startSeq = async () => {
    let n = 0;
    await new Promise<void>((r) => server.close(() => r()));
    await start({ nextDeclarationNo: () => `10000000000${++n}` });
    return login();
  };

  it("tờ 1 (F, nhánh 1/3) cấp số mới; tờ 2 và 3 tham chiếu số tờ 1 và nhận số khác nhau", async () => {
    const token = await startSeq();
    const first = await call(token, { tK_FIC: "F", tK_BNO: 1, tK_DNO: 3 }, "a1");
    expect(first.errorList).toBeNull();
    const no1 = first.objIDA![0]!.objMsgResult.decNumber;
    expect(no1).toBe("100000000001");
    expect(first.objIDA![0]!.objVN_IDA).toMatchObject({ tK_FIC: "F", tK_BNO: 1, tK_DNO: 3 });
    const second = await call(token, { tK_FIC: no1, tK_BNO: 2, tK_DNO: 3 }, "a2");
    const third = await call(token, { tK_FIC: no1, tK_BNO: 3, tK_DNO: 3 }, "a3");
    const nos = [no1, second.objIDA![0]!.objMsgResult.decNumber, third.objIDA![0]!.objMsgResult.decNumber];
    expect(new Set(nos).size).toBe(3);
    expect(second.objIDA![0]!.objVN_IDA).toMatchObject({ tK_FIC: no1, tK_BNO: 2 });
  });

  it("nhánh ≥ 2 mà TK_FIC không phải số tờ khai đầu tiên đã cấp → lỗi nghiệp vụ", async () => {
    const token = await startSeq();
    const bad = await call(token, { tK_FIC: "199999999999", tK_BNO: 2, tK_DNO: 3 }, "b1");
    expect(bad.objIDA).toBeNull();
    expect(bad.errorList![0]).toMatchObject({ errorCode: "MOCK-REQ", indexCode: "FIC" });
    const f = await call(token, { tK_FIC: "F", tK_BNO: 2, tK_DNO: 3 }, "b2");
    expect(f.errorList![0]).toMatchObject({ indexCode: "FIC" });
  });

  it("khai lại đúng tờ (cùng tK_ID) giữ số; không khai nhánh (không TK_FIC) hành vi cũ", async () => {
    const token = await startSeq();
    const a = await call(token, { tK_FIC: "F", tK_BNO: 1, tK_DNO: 2 }, "c1");
    const b = await call(token, { tK_FIC: "F", tK_BNO: 1, tK_DNO: 2 }, "c1");
    expect(b.objIDA![0]!.objMsgResult.decNumber).toBe(a.objIDA![0]!.objMsgResult.decNumber);
    expect((await call(token, {}, "c2")).errorList).toBeNull();
  });
});
