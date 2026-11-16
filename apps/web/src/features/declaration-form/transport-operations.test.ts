import { BILL_SPLIT_FORM, EXPORT_IDENTIFIER_FORM, IDENTIFIER_FORM } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import type { FormValues } from "./form-state";
import { operationValues, operationsFor } from "./transport-operations";

describe("operationsFor – nút nghiệp vụ ở nhóm Vận đơn & vận chuyển", () => {
  it("nhập khẩu: Chia tách vận đơn + Khai báo định danh; xuất khẩu: chỉ Khai báo định danh", () => {
    expect(operationsFor("IDA").map((f) => f.id)).toEqual(["tach-van-don", "dinh-danh"]);
    expect(operationsFor("EDA").map((f) => f.id)).toEqual(["dinh-danh"]);
    expect(operationsFor("IDA").map((f) => f.menu)).toEqual(["Chia tách vận đơn", "Khai báo định danh"]);
    expect(operationsFor("EDA")).toEqual([EXPORT_IDENTIFIER_FORM]);
  });
  it("đang khai sửa đổi (ảnh IDA01/EDA01): nhập khẩu chỉ còn Chia tách vận đơn; xuất khẩu giữ Khai mã định danh", () => {
    expect(operationsFor("IDA", true).map((f) => f.id)).toEqual(["tach-van-don"]);
    expect(operationsFor("EDA", true)).toEqual([EXPORT_IDENTIFIER_FORM]);
  });
});

// Thông tin chung tối thiểu của tờ khai (tên trường VNACCS) để điền sẵn panel nghiệp vụ.
const IDA_HEADER: FormValues = { TK_CH: "02CI", TK_IMC: "0101234567", TK_IMN: "CONG TY NHAP KHAU A", VD_BL1: "HPH123456", APP_NGAY_VD1: "2026-10-01", TK_MTC: "2" };
const EDA_HEADER: FormValues = { TK_CH: "01B1", TK_EPC: "0309876543", TK_EPN: "CONG TY XUAT KHAU B" };

describe("operationValues – điền sẵn từ tờ khai", () => {
  it("định danh (nhập): loại hàng nhập khẩu, doanh nghiệp = người nhập khẩu, chi cục = cơ quan Hải quan; chưa có kết quả", () => {
    const header = IDA_HEADER;
    const v = operationValues(IDENTIFIER_FORM, "IDA", header);
    expect(v).toMatchObject({ LOAI_DT: "1", LOAI_HH: "1", MA_DV: header["TK_IMC"], TEN_DV: header["TK_IMN"], MA_HQ: header["TK_CH"] });
    expect(v["SO_DD"]).toBeUndefined();
  });
  it("định danh (xuất): loại hàng xuất khẩu, doanh nghiệp = người xuất khẩu; kết quả Hải quan để trống (không điền giả)", () => {
    const header = EDA_HEADER;
    const v = operationValues(IDENTIFIER_FORM, "EDA", header);
    expect(v).toMatchObject({ LOAI_DT: "1", LOAI_HH: "2", MA_DV: header["TK_EPC"], TEN_DV: header["TK_EPN"], MA_HQ: header["TK_CH"] });
    expect(v["SO_DD"]).toBeUndefined();
    expect(v["TRANG_THAI"]).toBeUndefined();
  });
  it("tách vận đơn: vận đơn gốc + ngày lấy từ dòng vận đơn 1; loại hàng theo phương thức vận chuyển (2 → container)", () => {
    const header: FormValues = { ...IDA_HEADER, TK_MTC: "2" };
    const v = operationValues(BILL_SPLIT_FORM, "IDA", header);
    expect(v).toMatchObject({ TVD_VD_GOC: header["VD_BL1"], TVD_VD_GOC_NGAY: header["APP_NGAY_VD1"], TVD_LOAIHANG: "1", MA_DV: header["TK_IMC"] });
    expect(operationValues(BILL_SPLIT_FORM, "IDA", { ...header, TK_MTC: "1" })["TVD_LOAIHANG"]).toBe("0");
  });
});
