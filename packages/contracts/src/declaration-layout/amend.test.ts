import { describe, expect, it } from "vitest";
import { amendLock, layoutFields, LAYOUT_EDA, LAYOUT_IDA } from "./index.js";

describe("amendLock – ô không được sửa khi khai sửa đổi bổ sung trong thông quan (IDA01/EDA01)", () => {
  it("IDA: 6 chỉ tiêu không được khai bổ sung theo mục 3.1 Phụ lục II (căn cứ pháp lý)", () => {
    for (const k of ["TK_ICB", "TK_CCC", "TK_MTC", "TK_CH", "TK_IMC", "TK_ICC"]) expect(amendLock("IDA", k, {})).toMatchObject({ basis: "LAW" });
  });
  it("EDA: 6 chỉ tiêu không được khai bổ sung theo mục 3.1 Phụ lục II", () => {
    for (const k of ["TK_ECB", "TK_CCC", "TK_MTC", "TK_CH", "TK_EPC", "TK_ECC"]) expect(amendLock("EDA", k, {})).toMatchObject({ basis: "LAW" });
  });
  it("nhóm loại hình đi theo mã loại hình – khóa cùng", () => {
    expect(amendLock("IDA", "APP_NHOM_LH", {})).toMatchObject({ basis: "LAW" });
    expect(amendLock("EDA", "APP_NHOM_LH", {})).toMatchObject({ basis: "LAW" });
  });
  it("tên người nhập/xuất khẩu, địa điểm lưu kho chờ thông quan: Hệ thống không hỗ trợ sửa – hướng dẫn ghi vào ô Ký hiệu và số hiệu", () => {
    for (const [kind, keys] of [["IDA", ["TK_IMN", "VD_ST"]], ["EDA", ["TK_EPN", "TK_ST"]]] as const) {
      for (const k of keys) {
        const lock = amendLock(kind, k, {});
        expect(lock).toMatchObject({ basis: "SYSTEM" });
        expect(lock!.reason).toContain("Ký hiệu và số hiệu");
      }
    }
  });
  it("đối tác nước ngoài: phần mềm khóa theo ảnh IDA01/EDA01, chưa có căn cứ văn bản", () => {
    for (const k of ["TK_EPC", "TK_EPN"]) expect(amendLock("IDA", k, {})).toMatchObject({ basis: "SOFTWARE" });
    for (const k of ["TK_CGC", "TK_CGN"]) expect(amendLock("EDA", k, {})).toMatchObject({ basis: "SOFTWARE" });
  });
  it("IDA đã đề nghị giải phóng hàng (có mã lý do BP): khóa thêm các chỉ tiêu mục 3.2", () => {
    const bp = { TK_BP: "A" };
    for (const k of ["VD_BL1", "VD_BL5", "VD_NO", "VD_GW", "VD_VSN", "VD_ARR", "VD_DST", "VD_PSC", "VD_COC", "TK_IV1", "TK_IV2", "TK_BP", "TK_SBC", "TK_RYA", "TK_SCM", "TK_SCN"]) {
      expect(amendLock("IDA", k, bp)).toMatchObject({ basis: "LAW" });
      expect(amendLock("IDA", k, {})).toBeNull();
    }
  });
  it("còn lại được sửa: số vận đơn, hóa đơn, địa chỉ, dòng hàng…", () => {
    for (const k of ["VD_BL1", "TK_IV3", "TK_IMA", "TK_SKB", "HAG_CMD", "HAG_QN1"]) expect(amendLock("IDA", k, {})).toBeNull();
    for (const k of ["TK_EKN", "TK_CGA", "CON_C01", "HAG_CMD"]) expect(amendLock("EDA", k, {})).toBeNull();
  });
  it("mọi khóa trong danh sách đều là ô có trên bố cục", () => {
    for (const [kind, layout] of [["IDA", LAYOUT_IDA], ["EDA", LAYOUT_EDA]] as const) {
      const locked = layoutFields(layout).filter((f) => amendLock(kind, f.key, { TK_BP: "A" }));
      expect(locked.length).toBeGreaterThanOrEqual(kind === "IDA" ? 30 : 11);
    }
  });
});
