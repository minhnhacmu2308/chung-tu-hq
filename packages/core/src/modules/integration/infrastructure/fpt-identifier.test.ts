import { describe, expect, it } from "vitest";
import { FptRestClient } from "./fpt-rest-client.js";
import { FptVnaccsGateway, mapIdentifierResponse } from "./fpt-vnaccs-gateway.js";

// Phản hồi V5IdentifierReq thật của FPT (Postman, 15/11/2026) – kết quả trả ngay, không cần hỏi V5IdentifierRes. QR rút gọn.
const REAL_RESPONSE = {
  mA_DV: "0313833810", sO_DD: "122600050501472", ngaY_DD: "15/11/2026", codE_CONTENT: "iVBORw0KGgoAAAANSUhEUgAAAKQAAACkCAIAAAC1Ky+0Jggg==", teN_DV: "test", mA_HQ: "60CB",
  mA_DAI_LY: "", teN_DAI_LY: "", useR_ID: "BI820001", errorList: [], reF_ID: "6FA648DF-C2FD-4B5E-934C-F39EC1E0F53C", sO_TN: "100126446660", ngaY_TN: "15/11/2026", naM_TN: "2026",
  tranG_THAI: "15", keT_QUA: "Số định danh là [122600050501472], ngày định danh [15/11/2026]!",
};
const REQ = { objectType: "1" as const, goodsType: "2" as const, customsOffice: "60CB", taxCode: "0313833810", companyName: "test", agentTaxCode: "", agentName: "", userId: "BI820001" };

describe("mapIdentifierResponse – phản hồi định danh FPT", () => {
  it("phản hồi thật (tranG_THAI 15 + sO_DD) → ACCEPTED, ngày đổi sang YYYY-MM-DD, giữ QR và câu kết quả", () => {
    expect(mapIdentifierResponse(REAL_RESPONSE)).toEqual({
      state: "ACCEPTED", refId: "6FA648DF-C2FD-4B5E-934C-F39EC1E0F53C", receiptNo: "100126446660", receiptDate: "2026-11-15", customsState: "15",
      identifierNo: "122600050501472", identifiedOn: "2026-11-15", qrPng: REAL_RESPONSE.codE_CONTENT, resultText: REAL_RESPONSE.keT_QUA,
    });
  });
  it("chỉ có reF_ID (cổng xử lý sau) → PENDING kèm REF_ID", () => {
    expect(mapIdentifierResponse({ reF_ID: "R1", errorList: null })).toEqual({ state: "PENDING", refId: "R1" });
  });
  it("tranG_THAI 10 → REJECTED kèm câu kết quả", () => {
    expect(mapIdentifierResponse({ reF_ID: "R1", tranG_THAI: 10, keT_QUA: "Từ chối" })).toMatchObject({ state: "REJECTED", customsState: "10", resultText: "Từ chối" });
  });
  it("errorList → REJECTED với mã, chỉ tiêu, cách xử lý", () => {
    const res = mapIdentifierResponse({ errorList: [{ errorCode: "E01", indexCode: "LOAI_DT", errorContent: "Loại đối tượng sai ", proposedSolution: "Chọn 1 hoặc 2" }] });
    expect(res).toEqual({ state: "REJECTED", errors: [{ code: "E01", field: "LOAI_DT", message: "Loại đối tượng sai", solution: "Chọn 1 hoặc 2" }] });
  });
});

describe("FptVnaccsGateway.sendIdentifier", () => {
  const login = () => new Response(JSON.stringify({ token: "tok", expiration: "2026-11-15T18:00:00Z" }), { status: 200 });
  it("gửi body phẳng đúng như Postman (không objVNACCS_ACCOUNT, không đọc tài khoản VNACCS)", async () => {
    const calls: { path: string; body: Record<string, unknown> }[] = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      calls.push({ path, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
      return path === "/api/auth/login" ? login() : new Response(JSON.stringify(REAL_RESPONSE), { status: 200 });
    }) as typeof fetch;
    const http = new FptRestClient({ baseUrl: "http://fpt.test", username: "u", password: "p", fetch: fetchFn });
    const gw = new FptVnaccsGateway(http, { get: async () => { throw new Error("không được đọc tài khoản VNACCS"); } });
    const res = await gw.sendIdentifier("org_a", REQ);
    expect(res.state).toBe("ACCEPTED");
    expect(calls[1]).toEqual({ path: "/api/V5IdentifierReq", body: { mA_DV: "0313833810", teN_DV: "test", loaI_DT: "1", loaI_HH: "2", mA_HQ: "60CB", mA_DAI_LY: "", teN_DAI_LY: "", useR_ID: "BI820001" } });
  });
  it("V5IdentifierRes: body đúng Postman (không loaI_DT/loaI_HH); chưa xử lý xong (tranG_THAI 11, số null) → PENDING; USER_ID trống → INTEGRATION_NOT_CONFIGURED", async () => {
    // Phản hồi V5IdentifierRes thật của FPT (Postman, 15/11/2026) khi Hải quan mới tiếp nhận, chưa cấp số định danh.
    const PENDING_RESPONSE = {
      mA_DV: "0313833810", sO_DD: null, ngaY_DD: null, codE_CONTENT: null, teN_DV: "string", mA_HQ: "02CI", mA_DAI_LY: "", teN_DAI_LY: "", useR_ID: "BI820001", errorList: [],
      reF_ID: "1DF7DAC7-D75C-477C-84DA-15EB154FDCC1", sO_TN: null, ngaY_TN: null, naM_TN: null, tranG_THAI: "11",
      keT_QUA: "Message [1DF7DAC7-D75C-477C-84DA-15EB154FDCC1] đã được hệ thống tiếp nhận nhưng chưa xử lý xong, vui lòng đợi ...",
    };
    const calls: { path: string; body: Record<string, unknown> }[] = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path !== "/api/auth/login") calls.push({ path, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
      return path === "/api/auth/login" ? login() : new Response(JSON.stringify(PENDING_RESPONSE), { status: 200 });
    }) as typeof fetch;
    const gw = new FptVnaccsGateway(new FptRestClient({ baseUrl: "http://fpt.test", username: "u", password: "p", fetch: fetchFn }), { get: async () => null });
    const refId = PENDING_RESPONSE.reF_ID;
    expect(await gw.identifierResult("org_a", { ...REQ, customsOffice: "02CI", companyName: "string", refId })).toEqual({ state: "PENDING", refId, customsState: "11", resultText: PENDING_RESPONSE.keT_QUA });
    expect(calls[0]).toEqual({ path: "/api/V5IdentifierRes", body: { mA_HQ: "02CI", mA_DV: "0313833810", teN_DV: "string", mA_DAI_LY: "", teN_DAI_LY: "", reF_ID: refId, useR_ID: "BI820001" } });
    await expect(gw.sendIdentifier("org_a", { ...REQ, userId: " " })).rejects.toMatchObject({ code: "INTEGRATION_NOT_CONFIGURED" });
    expect(calls).toHaveLength(1);
  });
});
