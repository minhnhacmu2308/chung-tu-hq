import { describe, expect, it } from "vitest";
import { emptyVnaccsForm, validateVnaccsForm } from "./vnaccs-account-form";

const FULL = { userId: " BI820001 ", password: "12345678", terminalId: "Z9999M", terminalAccessKey: "MOCKTERMINALKEY9" };

describe("vnaccs-account-form", () => {
  it("đổi tài khoản: điền sẵn User ID/Terminal ID, mật khẩu và terminal key để trống", () => {
    expect(emptyVnaccsForm({ userId: "BI820001", terminalId: "Z9999M" })).toEqual({ userId: "BI820001", password: "", terminalId: "Z9999M", terminalAccessKey: "" });
    expect(emptyVnaccsForm()).toEqual({ userId: "", password: "", terminalId: "", terminalAccessKey: "" });
  });
  it("đủ trường → hợp lệ, cắt khoảng trắng User ID", () => {
    expect(validateVnaccsForm(FULL)).toEqual({ ok: true, value: { ...FULL, userId: "BI820001" } });
  });
  it("thiếu trường → lỗi tiếng Việt đúng ô", () => {
    expect(validateVnaccsForm({ ...FULL, password: "", terminalAccessKey: " " })).toEqual({ ok: false, errors: { password: "Nhập mật khẩu VNACCS", terminalAccessKey: "Nhập Terminal Access Key" } });
  });
  it("quá 50 ký tự → lỗi độ dài", () => {
    expect(validateVnaccsForm({ ...FULL, terminalId: "x".repeat(51) })).toEqual({ ok: false, errors: { terminalId: "Tối đa 50 ký tự" } });
  });
});
