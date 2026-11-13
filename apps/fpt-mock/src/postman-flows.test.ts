// Đủ 35 API của Postman "API-VNACCS NEW" (21/04/2026): body mẫu ở docs/vnaccs-api/samples (đã che mật khẩu → thay tài khoản mock).
import { readdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFptMock } from "./app.js";
import edaRequest from "./fixtures/eda-request.json" with { type: "json" };

const SAMPLES = path.resolve(import.meta.dirname, "../../../docs/vnaccs-api/samples");
const ACC = { useR_ID: "MOCK0001", password: "12345678", terminaL_ID: "Z0000M", terminaL_ACCESS_KEY: "MOCKTERMINALKEY0" };
let BEARER = "";
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let server: Server;
let base: string;
let seq = 0;
beforeEach(async () => {
  seq = 0;
  const mock = createFptMock({ now: () => new Date("2026-10-14T03:00:00Z"), nextDeclarationNo: (k) => `${k === "EDA" ? "30" : "10"}000000000${++seq}` });
  server = createServer(mock.handler);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
  const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "test", password: "test" }) });
  BEARER = `Bearer ${((await login.json()) as { token: string }).token}`;
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

const call = async (op: string, body: unknown, auth?: string) => {
  const res = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "content-type": "application/json", authorization: auth ?? BEARER }, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as J };
};
const sample = (op: string): J => {
  const b = JSON.parse(readFileSync(path.join(SAMPLES, `${op}.request.json`), "utf8")) as J;
  if (b["objVNACCS_ACCOUNT"]) b["objVNACCS_ACCOUNT"] = ACC;
  if ("terminaL_ACCESS_KEY" in b) Object.assign(b, ACC);
  return b;
};
const decl = (kind: "IDA" | "EDA") => kind === "EDA"
  ? { ...structuredClone(edaRequest), objVNACCS_ACCOUNT: ACC }
  : { objVNACCS_ACCOUNT: ACC, objVN_IDA: { tK_ID: "i1", tK_ICB: "A11", tK_CH: "03CE", tK_MTC: "1", tK_IMC: "0316789012", tK_IMN: "CONG TY AN PHAT" }, objVN_IDA_HANG: [{ haG_CMD: "84821000", haG_CMN: "Vong bi", haG_QN1: 10, haG_QT1: "PCE", haG_BPR: 100 }] };
const msgCodes = async () => {
  const r = await call("VNACCSREP", ACC);
  return [...(r.body.objIDA ?? []), ...(r.body.objEDA ?? []), ...(r.body.objAMA ?? [])].map((x: J) => `${x.objMsgResult.code}/${x.objMsgResult.type}`);
};

describe("fpt-mock: mọi API trong Postman", () => {
  it("mỗi body mẫu Postman đều được xử lý (200 JSON, không 404/500), đường dẫn không phân biệt hoa thường", async () => {
    const ops = readdirSync(SAMPLES).map((f) => f.replace(".request.json", "")).filter((op) => op !== "login");
    // 35 API trong Postman: trừ login và SyncCategory (body rỗng – không có file mẫu, thử riêng ở dưới).
    expect(ops.length).toBe(33);
    for (const op of ops) {
      const r = await call(op, sample(op));
      expect([op, r.status]).toEqual([op, 200]);
      expect(r.body).not.toBeNull();
    }
  });
  it("chỉ nhận Bearer: HTTP Basic (Postman cũ) → 401; không xác thực → 401", async () => {
    expect((await call("IID", sample("IID"), `Basic ${Buffer.from("test:test").toString("base64")}`)).status).toBe(401);
    expect((await call("IID", sample("IID"), "")).status).toBe(401);
  });
});

describe("fpt-mock: luồng tờ khai nhập IDA → IDB → IDA → IDC → IDD → IDA01 → IDE → IID / VNACCSREP", () => {
  it("đi đủ trạng thái T/A/C/TE/A01/E, giữ số tờ khai, thông điệp phân luồng / sửa đổi / thông quan qua VNACCSREP", async () => {
    const ida = await call("IDA", decl("IDA"));
    const no = Number(ida.body.objIDA[0].objMsgResult.decNumber);
    const state = (r: { body: J }) => r.body.objIDA?.[0]?.objVN_IDA_TRANGTHAI?.tK_TRANGTHAI ?? r.body.errorList?.[0]?.errorContent;

    expect(state(await call("IDB", { objVNACCS_ACCOUNT: ACC, tK_ICN: no }))).toBe("T");
    const again = await call("IDA", decl("IDA"));
    expect(Number(again.body.objIDA[0].objMsgResult.decNumber)).toBe(no);
    expect(state(await call("IDD", { objVNACCS_ACCOUNT: ACC, tK_ICN: no }))).toContain("chưa đăng ký");

    expect(state(await call("IDC", { objVNACCS_ACCOUNT: ACC, tK_ICN: no }))).toBe("C");
    expect(state(await call("IDB", { objVNACCS_ACCOUNT: ACC, tK_ICN: no }))).toContain("đã đăng ký");
    expect(await msgCodes()).toEqual(["VAD1LD0/P"]);

    expect(state(await call("IDD", { objVNACCS_ACCOUNT: ACC, tK_ICN: no }))).toBe("TE");
    const body = decl("IDA");
    (body.objVN_IDA as J)["tK_ICN"] = no;
    expect(state(await call("IDA01", body))).toBe("A01");
    expect(state(await call("IDE", { objVNACCS_ACCOUNT: ACC, tK_ICN: no }))).toBe("E");
    expect(await msgCodes()).toEqual(["VAD2LE0/P"]);

    const iid = await call("IID", { objVNACCS_ACCOUNT: ACC, tK_ICN: no });
    expect(iid.body.objIDA[0].objMsgResult.code).toBe("VAD0LC0");
    expect(await msgCodes()).toEqual(["VAD1LF0/P"]);
    expect(state(await call("IDD", { objVNACCS_ACCOUNT: ACC, tK_ICN: no }))).toContain("đã thông quan");
    expect(await msgCodes()).toEqual([]);
  });
  it("IDA01 khi chưa gọi IDD → lỗi trạng thái", async () => {
    const no = Number((await call("IDA", decl("IDA"))).body.objIDA[0].objMsgResult.decNumber);
    const body = decl("IDA");
    (body.objVN_IDA as J)["tK_ICN"] = no;
    expect((await call("IDA01", body)).body.errorList[0]).toMatchObject({ indexCode: "STATE" });
  });
});

describe("fpt-mock: luồng tờ khai xuất EDA → EDC → EDD → EDA01 → EDE → IEX", () => {
  it("IEX nhận tK_ECN như Postman (vẫn nhận tK_SOTK cũ); mã thông điệp theo REP_VNACCS", async () => {
    const eda = await call("EDA", decl("EDA"));
    const no = Number(eda.body.objEDA[0].objMsgResult.decNumber);
    expect((await call("EDB", { objVNACCS_ACCOUNT: ACC, tK_ECN: no })).body.objEDA[0].objMsgResult.code).toBe("VAE4000");
    await call("EDA", decl("EDA"));
    await call("EDC", { objVNACCS_ACCOUNT: ACC, tK_ECN: no });
    expect((await call("EDD", { objVNACCS_ACCOUNT: ACC, tK_ECN: no })).body.objEDA[0].objMsgResult.code).toBe("VAE4110");
    const body = decl("EDA") as J;
    body["objVN_EDA"]["tK_ECN"] = no;
    expect((await call("EDA01", body)).body.objEDA[0].objMsgResult.code).toBe("VAE0LB0");
    expect((await call("EDE", { objVNACCS_ACCOUNT: ACC, tK_ECN: no })).body.objEDA[0].objVN_EDA_TRANGTHAI.tK_TRANGTHAI).toBe("E");
    const iex = await call("IEX", { objVNACCS_ACCOUNT: ACC, tK_ECN: no });
    expect(iex.body.objEDA[0].objMsgResult.code).toBe("VAE0LC0");
    expect((await call("IEX", { objVNACCS_ACCOUNT: ACC, tK_SOTK: String(no) })).body.objEDA[0].objVN_EDA_TRANGTHAI.tK_THONGQUAN).toBe("1");
    expect(await msgCodes()).toEqual(["VAE1LD0/P", "VAE2LE0/P", "VAE1LF0/P"]);
  });
});

describe("fpt-mock: sau thông quan AMA → AMB → AMA → AMC", () => {
  it("giữ số tK_SYN khi khai lại; AMC đăng ký và Hải quan chấp nhận (VAL8050 qua VNACCSREP); AMC lần 2 lỗi", async () => {
    const ama = { objVNACCS_ACCOUNT: ACC, objVN_AMA: { tK_ICN: 104265243240, tK_REC: "4" }, objVN_AMA_HANG: [{ haG_RAN: "01" }] };
    const syn = (await call("AMA", ama)).body.objAMA[0].objVN_AMA.tK_SYN;
    expect((await call("AMB", { objVNACCS_ACCOUNT: ACC, tK_SYN: Number(syn) })).body.objAMA[0].objMsgResult.code).toBe("VAL8010");
    expect((await call("AMA", { ...ama, objVN_AMA: { ...ama.objVN_AMA, tK_SYN: syn } })).body.objAMA[0].objVN_AMA.tK_SYN).toBe(syn);
    expect((await call("AMC", { objVNACCS_ACCOUNT: ACC, tK_SYN: Number(syn) })).body.objAMA[0].objMsgResult.code).toBe("VAL8020");
    expect(await msgCodes()).toEqual(["VAL8050/P"]);
    expect((await call("AMC", { objVNACCS_ACCOUNT: ACC, tK_SYN: Number(syn) })).body.errorList[0].indexCode).toBe("SYN");
  });
});

describe("fpt-mock: HYS", () => {
  it("theo Excel (phẳng + lisT_FILE) → số tiếp nhận ở cấp ngoài và vaL0020", async () => {
    const r = await call("HYS", { objVNACCS_ACCOUNT: ACC, tK_CH: "60CB", tK_CHB: "00", tK_TSB: "A02", lisT_FILE: [{ filE_NAME: "a.pdf", filE_BASE64: Buffer.from("x").toString("base64") }] });
    expect(r.body.errorList).toBeNull();
    expect(r.body.tK_JNO).toHaveLength(12);
    expect(r.body.vaL0020.tK_JNO).toBe(r.body.tK_JNO);
  });
  it("dạng Postman (có thể cũ): /api/hys + objVN_HYS.lisT_FILE_HYS vẫn nhận", async () => {
    const r = await call("hys", { objVNACCS_ACCOUNT: ACC, objVN_HYS: { tK_CH: "60CB", tK_CHB: "00", tK_TSB: "A02", tK_TNM: "Danh sách container", lisT_FILE_HYS: [{ filE_NAME: "a.pdf", filE_BASE64: Buffer.from("x").toString("base64") }] } });
    expect(r.body.errorList).toBeNull();
    expect(r.body.vaL0020.tK_JNO).toHaveLength(12);
    expect(r.body.vaL0020.tK_TNM).toBe("Danh sách container");
    expect(r.body.tK_JNO).toBe(r.body.vaL0020.tK_JNO);
  });
});

describe("fpt-mock: gửi → REF_ID → hỏi kết quả", () => {
  it("V5Bill → V5Response: 11 chưa phản hồi rồi 12 chấp nhận có số tiếp nhận; dữ liệu chứa REJECT → 10 từ chối", async () => {
    const sent = await call("V5Bill", sample("V5Bill"));
    expect(sent.body.errorList).toBeNull();
    const ask = async (refId: string) => (await call("V5Response", { reF_ID: refId, useR_ID: "MOCK0001" })).body;
    expect((await ask(sent.body.reF_ID)).tranG_THAI).toBe("11");
    const done = await ask(sent.body.reF_ID);
    expect(done).toMatchObject({ tranG_THAI: "12", loaI_CT: "VD" });
    expect(done.sO_TN).toHaveLength(12);
    const rej = await call("V5Bill", { ...sample("V5Bill"), VD_GHICHU: "REJECT" });
    await ask(rej.body.reF_ID);
    expect((await ask(rej.body.reF_ID)).tranG_THAI).toBe("10");
    expect((await call("V5Response", { reF_ID: "khong-co" })).body.errorList[0].indexCode).toBe("REF_ID");
  });
  it("định danh: V5IdentifierRes trạng thái 15 có số định danh + QR; sai LOAI_DT → lỗi", async () => {
    const req = await call("V5IdentifierReq", sample("V5IdentifierReq"));
    await call("V5IdentifierRes", { reF_ID: req.body.reF_ID });
    const res = (await call("V5IdentifierRes", { reF_ID: req.body.reF_ID })).body;
    expect(res).toMatchObject({ tranG_THAI: "15" });
    expect(res.sO_DD).toMatch(/^DD/);
    expect(res.codE_CONTENT).toBeTruthy();
    expect((await call("V5IdentifierReq", { ...sample("V5IdentifierReq"), loaI_DT: "9" })).body.errorList[0].indexCode).toBe("LOAI_DT");
  });
  it("tách vận đơn: số lượng nhánh lệch → lỗi; mẫu Postman → REF_ID rồi chấp nhận", async () => {
    expect((await call("TachVanDonReq", { ...sample("TachVanDonReq"), tvD_VDNHANH_SOLUONG: 3 })).body.errorList[0].indexCode).toBe("TVD_VDNHANH_SOLUONG");
    const req = await call("TachVanDonReq", sample("TachVanDonReq"));
    await call("TachVanDonRes", { reF_ID: req.body.reF_ID });
    expect((await call("TachVanDonRes", { reF_ID: req.body.reF_ID })).body.tranG_THAI).toBe("12");
  });
  it("container, KVGS, in, ký file, danh mục", async () => {
    const req = await call("ContainerReq", sample("ContainerReq"));
    expect(req.body.hanG_CONT).toHaveLength(1);
    expect((await call("ContainerReq", { ...sample("ContainerReq"), hanG_CONT: [] })).body.errorList[0].indexCode).toBe("HANG_CONT");
    // Bản dùng (Excel v1.1): số seal bắt buộc từng dòng.
    const v5 = { ...sample("ContainerReq"), hanG_CONT: [{ vD_SO: "BL1", coN_SO: "MSCU1234567", seL_SO: "", ghI_CHU: "" }] };
    expect((await call("V5ContainerReq", v5)).body.errorList[0].indexCode).toBe("SEL_SO");
    const ok = await call("V5ContainerReq", { ...v5, hanG_CONT: [{ ...v5.hanG_CONT[0], seL_SO: "SEAL01" }] });
    await call("V5ContainerRes", { reF_ID: ok.body.reF_ID });
    expect((await call("V5ContainerRes", { reF_ID: ok.body.reF_ID })).body.tranG_THAI).toBe("12");
    // V5ContainerRes: Hải quan từ chối khi có seal bắt đầu bằng REJECT – errorList theo dòng (rowPosition); phản hồi không trả lại dòng container.
    const bad = await call("V5ContainerReq", { ...v5, hanG_CONT: [{ ...v5.hanG_CONT[0], seL_SO: "SEAL01" }, { vD_SO: "BL1", coN_SO: "MSCU7654321", seL_SO: "REJECT-9", ghI_CHU: "" }] });
    await call("V5ContainerRes", { reF_ID: bad.body.reF_ID });
    const rejected = (await call("V5ContainerRes", { reF_ID: bad.body.reF_ID })).body;
    expect(rejected.tranG_THAI).toBe("10");
    expect(rejected.errorList[0].rowPosition).toBe("0002");
    expect(rejected.hanG_CONT).toBeUndefined();
    expect((await call("V5ContainerRes", { reF_ID: ok.body.reF_ID })).body.hanG_CONT).toBeUndefined();
    // KVGS hai bước: KVGS → reF_ID; KVGSRes → (lần đầu chưa có phản hồi) → đủ trường 2 mẫu in.
    const kv = await call("KVGS", sample("KVGS"));
    expect(kv.body.reF_ID).toBeTruthy();
    expect((await call("KVGS", { ...sample("KVGS"), TK_SOTK: "" })).body.errorList[0].indexCode).toBe("TK_SOTK");
    expect((await call("KVGSRes", { reF_ID: kv.body.reF_ID })).body.tranG_THAI).toBe("11");
    const full = (await call("KVGSRes", { reF_ID: kv.body.reF_ID })).body;
    expect(full.tranG_THAI).toBe("12");
    expect(full).toMatchObject({ sO_QUAN_LY: "QL307072510200", mA_VACH: "*307072510200*", phaiNiemPhong: true });
    expect(full.danH_SACH_CONT).toHaveLength(2);
    expect(full.danH_SACH_CONT[0].mA_VACH).toBe("307072510200|FBIU5802429");
    expect(full.hanG_LE.sO_LUONG).toBe("10");
    expect((await call("KVGSRes", { reF_ID: "khong-co" })).body.errorList[0].indexCode).toBe("REF_ID");
    expect((await call("PrintXPS", sample("PrintXPS"))).body.filE_BASE64).toBeTruthy();
    expect((await call("KyFile", sample("KyFile"))).body.daA_KY).toBe(true);
    const cat = (await call("SyncCategory", {})).body;
    expect(cat.vN_A038.length).toBeGreaterThan(10);
    expect(cat.vN_A038[0]).toHaveProperty("mA_HQ");
  });
});
