import { describe, expect, it } from "vitest";
import { shapeIdaBody } from "./ida-request-shape.js";

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
});
