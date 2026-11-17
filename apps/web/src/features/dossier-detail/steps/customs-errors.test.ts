import { describe, expect, it } from "vitest";
import { errorPlace, errorsForField, fieldErrors } from "./customs-errors";

const rejection = {
  operation: "IDA" as const,
  at: "2026-10-17T03:00:00.000Z",
  errors: [
    { code: "MOCK-REQ", field: "EPA", message: "Chưa nhập địa chỉ người xuất khẩu", solution: "Nhập địa chỉ" },
    { code: "E1004", field: "CMD", line: 2, message: "Mã HS không tồn tại" },
    { code: "S9999", message: "Lỗi hệ thống" },
  ],
};

describe("fieldErrors", () => {
  it("gắn mã chỉ tiêu lỗi FPT vào số chỉ tiêu Phụ lục II; giữ dòng hàng; mã không xác định → không có số", () => {
    const errs = fieldErrors("IDA", rejection);
    expect(errs.map((e) => [e.no, e.line])).toEqual([["1.22", undefined], ["1.74", 2], [undefined, undefined]]);
    expect(errorsForField(errs, "1.22")).toHaveLength(1);
    expect(errorsForField(errs, "1.74")).toEqual([]); // lỗi theo dòng hàng không gắn vào ô thông tin chung
    expect(errorsForField(errs, undefined)).toEqual([]);
  });
  it("chưa bị từ chối → rỗng", () => {
    expect(fieldErrors("EDA", null)).toEqual([]);
  });
  it("lỗi chưa mở cổng ký không gắn vào tờ khai (không cần sửa)", () => {
    expect(fieldErrors("IDA", { ...rejection, errors: [{ code: "SIGNING_PORT_CLOSED", field: "000", message: "Máy chủ chưa khởi động cổng ký" }] })).toEqual([]);
  });
  it("errorPlace: vị trí lỗi để người khai tìm ô", () => {
    const [a, b, c] = fieldErrors("IDA", rejection);
    expect(errorPlace(a!)).toBe("1.22 · Địa chỉ");
    expect(errorPlace(b!)).toBe("Dòng hàng 2 · 1.74 · Mã số hàng hóa");
    expect(errorPlace(c!)).toBe("Mã lỗi S9999");
  });
});

describe("fieldErrors – ô thuế", () => {
  it("HAG_TX2 → slot 2 cùng số chỉ tiêu; ô khác không có slot", () => {
    const errs = fieldErrors("IDA", { operation: "IDA", at: "2026-10-17T03:00:00.000Z", errors: [{ code: "E1", field: "HAG_TX2", line: 1, message: "x" }, { code: "E2", field: "CMD", line: 1, message: "y" }] });
    expect(errs[0]).toMatchObject({ no: "1.94", line: 1, slot: 2 });
    expect(errs[1]!.slot).toBeUndefined();
  });
});
