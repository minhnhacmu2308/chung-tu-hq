import { BILL_SPLIT_FORM, EXPORT_IDENTIFIER_FORM, IDENTIFIER_FORM } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { fixtureFor, valuesAt } from "./fixtures";
import type { FormValues } from "./form-state";
import { operationValues, operationsFor } from "./transport-operations";

describe("operationsFor – nút nghiệp vụ ở nhóm Vận đơn & vận chuyển", () => {
  it("nhập khẩu: Chia tách vận đơn + Khai báo định danh; xuất khẩu: chỉ Khai báo định danh", () => {
    expect(operationsFor("IDA").map((f) => f.id)).toEqual(["tach-van-don", "dinh-danh"]);
    expect(operationsFor("EDA").map((f) => f.id)).toEqual(["dinh-danh"]);
    expect(operationsFor("IDA").map((f) => f.menu)).toEqual(["Chia tách vận đơn", "Khai báo định danh"]);
    expect(operationsFor("EDA")).toEqual([EXPORT_IDENTIFIER_FORM]);
  });
});

describe("operationValues – điền sẵn từ tờ khai", () => {
  it("định danh (nhập): loại hàng nhập khẩu, doanh nghiệp = người nhập khẩu, chi cục = cơ quan Hải quan; nháp chưa có kết quả", () => {
    const header = valuesAt(fixtureFor("IDA"), "nhap").header;
    const v = operationValues(IDENTIFIER_FORM, "IDA", header, "nhap");
    expect(v).toMatchObject({ LOAI_DT: "1", LOAI_HH: "1", MA_DV: header["TK_IMC"], TEN_DV: header["TK_IMN"], MA_HQ: header["TK_CH"] });
    expect(v["SO_DD"]).toBeUndefined();
  });
  it("định danh (xuất): loại hàng xuất khẩu, doanh nghiệp = người xuất khẩu; đã khai → có số định danh, trạng thái 15", () => {
    const header = valuesAt(fixtureFor("EDA"), "da-khai").header;
    const v = operationValues(IDENTIFIER_FORM, "EDA", header, "da-khai");
    expect(v).toMatchObject({ LOAI_HH: "2", MA_DV: header["TK_EPC"], TEN_DV: header["TK_EPN"], TRANG_THAI: "15" });
    expect(v["SO_DD"]).toBeTruthy();
  });
  it("tách vận đơn: vận đơn gốc + ngày lấy từ dòng vận đơn 1; loại hàng theo phương thức vận chuyển (2 → container)", () => {
    const header: FormValues = { ...valuesAt(fixtureFor("IDA"), "nhap").header, TK_MTC: "2" };
    const v = operationValues(BILL_SPLIT_FORM, "IDA", header, "nhap");
    expect(v).toMatchObject({ TVD_VD_GOC: header["VD_BL1"], TVD_VD_GOC_NGAY: header["APP_NGAY_VD1"], TVD_LOAIHANG: "1", MA_DV: header["TK_IMC"] });
    expect(operationValues(BILL_SPLIT_FORM, "IDA", { ...header, TK_MTC: "1" }, "nhap")["TVD_LOAIHANG"]).toBe("0");
  });
});
