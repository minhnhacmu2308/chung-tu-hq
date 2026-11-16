import { LAYOUT_EDA, LAYOUT_IDA } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { blockHasData } from "./view-state";

describe("blockHasData – khối có ít nhất một ô có giá trị", () => {
  it("chưa có số liệu Hải quan: không khối Hải quan nào có dữ liệu", () => {
    for (const layout of [LAYOUT_IDA, LAYOUT_EDA]) {
      const v = { TK_CH: "02CI", TK_IMC: "0101234567" };
      expect(layout.customs.flatMap((s) => s.blocks).filter((b) => blockHasData(b, v))).toEqual([]);
    }
  });
  it("đã khai: khối đăng ký và thuế có dữ liệu; chưa thông quan nên khối thông quan chưa có; ô chỉ có khoảng trắng không tính", () => {
    const v = { TK_ICN: "105000000000", TK_A09: "2026-10-08", THUE_KF1: "N", THUE_KH1: "0", THUE_B02: "0", TK_C21: "   " };
    const byId = Object.fromEntries(LAYOUT_IDA.customs.flatMap((s) => s.blocks).map((b) => [b.id, blockHasData(b, v)]));
    expect(byId).toMatchObject({ "dang-ky": true, "sac-thue": true, "thong-quan": false });
  });
});
