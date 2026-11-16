import { describe, expect, it } from "vitest";
import { shapeAmaBody, shapeEdaBody, shapeIdaBody } from "./request-shape.js";

describe("shapeIdaBody – body IDA đúng hình mẫu request FPT", () => {
  it("đủ mọi key; ô trống: decimal → null, chữ/ngày/Long → \"\"; bỏ tK_CHB, haG_B25; giữ object khác (tài khoản, CTHQ)", () => {
    const b = shapeIdaBody({
      objVNACCS_ACCOUNT: { useR_ID: "U" },
      objVN_IDA: { tK_ICB: "A11", tK_CHB: "00", tK_IP4: 100, tK_BNO: "" },
      objVN_IDA_HANG: [{ haG_CMD: "03038919", haG_B25: "01", haG_QN1: 10 }],
      objVN_IDA_VANDON: { vD_NO: "208", vD_GW: 15.5 },
      objVN_IDA_KTG: { ktG_VD1: "6" },
    });
    const head = b["objVN_IDA"] as Record<string, unknown>;
    expect(Object.keys(head)).toHaveLength(86);
    expect(head).toMatchObject({ tK_ICB: "A11", tK_IP4: 100, tK_BNO: "", tK_ICN: null, tK_TDN: null, tK_FIC: "", tK_RYA: "", tK_IV2: null });
    expect(head).not.toHaveProperty("tK_CHB");
    const hang = (b["objVN_IDA_HANG"] as Record<string, unknown>[])[0]!;
    expect(Object.keys(hang)).toHaveLength(46);
    expect(hang).toMatchObject({ haG_CMD: "03038919", haG_QN1: 10, haG_VN1: "", haG_TXA: null, haG_TG1: null });
    expect(hang).not.toHaveProperty("haG_B25");
    expect(Object.keys(b["objVN_IDA_VANDON"] as object)).toHaveLength(20);
    expect(b["objVN_IDA_VANDON"]).toMatchObject({ vD_NO: "208", vD_GW: 15.5, vD_COC: "", vD_MRK: "" });
    expect(Object.keys(b["objVN_IDA_KTG"] as object)).toHaveLength(37);
    expect(b["objVN_IDA_KTG"]).toMatchObject({ ktG_VD1: "6", ktG_VPC: null, ktG_FR3: null, ktG_VR1: "" });
    expect(b["objVNACCS_ACCOUNT"]).toEqual({ useR_ID: "U" });
  });

  it("EDA: đủ key (95 / HANG 27 / CON 57), giữ tK_CHB, bỏ haG_R01; chưa có CTHQ → CTHQ rỗng 30 key; CTHQ của EDA01 giữ nguyên", () => {
    const b = shapeEdaBody({ objVN_EDA: { tK_ECB: "B11", tK_CHB: "00", tK_FKK: 5543.17, tK_NO: "23" }, objVN_EDA_CON: null, objVN_EDA_HANG: [{ haG_CMD: "84821000", haG_R01: "01", haG_QN1: 5 }] });
    const head = b["objVN_EDA"] as Record<string, unknown>;
    expect(Object.keys(head)).toHaveLength(95);
    expect(head).toMatchObject({ tK_ECB: "B11", tK_CHB: "00", tK_FKK: 5543.17, tK_NO: "23", tK_ECN: null, tK_FIC: "", tK_BYA: "" });
    expect(head).not.toHaveProperty("tK_ID");
    const hang = (b["objVN_EDA_HANG"] as Record<string, unknown>[])[0]!;
    expect(Object.keys(hang)).toHaveLength(27);
    expect(hang).not.toHaveProperty("haG_R01");
    expect(Object.keys(b["objVN_EDA_CON"] as object)).toHaveLength(57);
    expect(b["objVN_EDA_CON"]).toMatchObject({ coN_VC1: "", coN_C50: "" });
    expect(Object.keys(b["objVN_EDA_CTHQ"] as object)).toHaveLength(30);
    const cthq = { cthQ_CCM: "X", cthQ_D01: "A" };
    expect(shapeEdaBody({ objVN_EDA: {}, objVN_EDA_HANG: [], objVN_EDA_CTHQ: cthq })["objVN_EDA_CTHQ"]).toBe(cthq);
  });

  it("AMA: đủ 79 / 120 key theo mẫu Postman; ô trống null hoặc \"\" đúng như mẫu; giá trị có sẵn giữ nguyên", () => {
    const b = shapeAmaBody({ objVN_AMA: { tK_ICN: 108173826831, tK_CHS: "10BB", tK_BYA: "2026" }, objVN_AMA_HANG: [{ haG_RAN: "01", haG_AKB: 100 }] });
    const head = b["objVN_AMA"] as Record<string, unknown>;
    expect(Object.keys(head)).toHaveLength(79);
    expect(head).toMatchObject({ tK_ICN: 108173826831, tK_CHS: "10BB", tK_BYA: "2026", tK_ADD: null, tK_SYN: null, tK_AD3: "", tK_A02: "" });
    const hang = (b["objVN_AMA_HANG"] as Record<string, unknown>[])[0]!;
    expect(Object.keys(hang)).toHaveLength(120);
    expect(hang).toMatchObject({ haG_RAN: "01", haG_AKB: 100, haG_MK2: "", haG_A26: "" });
  });
});
