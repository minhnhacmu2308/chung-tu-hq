import { describe, expect, it } from "vitest";
import { REASON_CODES, REASON_TEXT_VI, reasonVi } from "@kb/contracts";
import { UI_LOCALES } from "@kb/ui";
import { ApiError } from "./api-error";
import { errorText, reasonText, rowReason } from "./reason-codes";
import { DOMAIN_ERROR_MESSAGES, REASON_MESSAGES } from "./reason-codes.messages";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("bộ nhãn mã lý do", () => {
  it("bản vi trùng từng chữ với câu backend (@kb/contracts REASON_TEXT_VI) – không mã nào thiếu/thừa", () => {
    expect(Object.keys(REASON_MESSAGES.vi).sort()).toEqual([...REASON_CODES].sort());
    for (const code of REASON_CODES) expect(REASON_MESSAGES.vi[code], code).toBe(REASON_TEXT_VI[code]);
  });
  it("en/zh có đủ mã và cùng tham số {…} với bản vi", () => {
    for (const locale of UI_LOCALES) {
      for (const code of REASON_CODES) {
        expect(REASON_MESSAGES[locale][code].trim(), `${locale} ${code}`).not.toBe("");
        expect(placeholders(REASON_MESSAGES[locale][code]), `${locale} ${code}`).toEqual(placeholders(REASON_TEXT_VI[code]));
      }
    }
  });
});

describe("reasonText", () => {
  it("dịch theo mã ở vi/en/zh, điền tham số", () => {
    const params = { ops: "IDC, HYS" };
    expect(reasonText("OPERATION_PENDING", params, "Đang chờ phản hồi IDC, HYS", "vi")).toBe("Đang chờ phản hồi IDC, HYS");
    expect(reasonText("OPERATION_PENDING", params, "Đang chờ phản hồi IDC, HYS", "en")).toBe("Waiting for a response to IDC, HYS");
    expect(reasonText("OPERATION_PENDING", params, "Đang chờ phản hồi IDC, HYS", "zh")).toBe("正在等待 IDC, HYS 的回复");
    expect(reasonText("IDB_REQUIRES_PRE_DECLARED", undefined, undefined, "en")).toBe("Recall is only possible after pre-declaration and before official declaration");
  });
  it("vi giống hệt câu backend cho mọi mã", () => {
    for (const code of REASON_CODES) expect(reasonText(code, { n: 2, ops: "IDA", fields: "1.22", week: "2026-10-19", blockers: "x", issues: "y" }, undefined, "vi"))
      .toBe(reasonVi(code, { n: 2, ops: "IDA", fields: "1.22", week: "2026-10-19", blockers: "x", issues: "y" }));
  });
  it("mã lạ hoặc thiếu mã → câu tiếng Việt server gửi kèm", () => {
    expect(reasonText("SOMETHING_NEW", undefined, "Lý do mới từ server", "en")).toBe("Lý do mới từ server");
    expect(reasonText(undefined, undefined, "Lý do cũ", "zh")).toBe("Lý do cũ");
    expect(reasonText("toString", undefined, "Không phải mã", "en")).toBe("Không phải mã");
  });
  it("rowReason: dòng không có lý do → undefined", () => {
    expect(rowReason({}, "en")).toBeUndefined();
    expect(rowReason({ reason: "Lô hàng không có container", reasonCode: "NO_CONTAINERS" }, "zh")).toBe("该批货物没有集装箱");
    expect(rowReason({ reason: "Lý do cũ (backend chưa gửi mã)" }, "en")).toBe("Lý do cũ (backend chưa gửi mã)");
  });
  it("SENT_SHEETS_CHANGED: linesOnly = 1 → `fields` dịch thành dòng hàng / line items / 商品行; = 0 → giữ số chỉ tiêu", () => {
    const lines = { sheets: "1, 3", fields: "dòng hàng", linesOnly: "1" };
    expect(reasonText("SENT_SHEETS_CHANGED", lines, undefined, "vi")).toBe(reasonVi("SENT_SHEETS_CHANGED", lines));
    expect(reasonText("SENT_SHEETS_CHANGED", lines, undefined, "en")).toBe("Sheets 1, 3 were not recalled but their declared content changed (line items) – recall these sheets or undo the change");
    expect(reasonText("SENT_SHEETS_CHANGED", lines, undefined, "zh")).toBe("第1, 3页未召回，但已申报内容已更改（商品行）——请召回这些页或撤销更改");
    expect(reasonText("SENT_SHEETS_CHANGED", { sheets: "2", fields: "1.51", linesOnly: "0" }, undefined, "en")).toContain("(1.51)");
  });
  it("SENT_SHEETS_CHANGED đổi cả chỉ tiêu chung lẫn dòng: fields ghép lại theo ngôn ngữ từ numbers + lineSheets; vi trùng câu backend", () => {
    const p = { sheets: "1, 3", fields: "1.51; dòng hàng tờ 3", numbers: "1.51", lineSheets: "3", linesOnly: "0" };
    expect(reasonText("SENT_SHEETS_CHANGED", p, undefined, "vi")).toBe(reasonVi("SENT_SHEETS_CHANGED", p));
    expect(reasonText("SENT_SHEETS_CHANGED", p, undefined, "en")).toBe("Sheets 1, 3 were not recalled but their declared content changed (1.51; line items of sheet(s) 3) – recall these sheets or undo the change");
    expect(reasonText("SENT_SHEETS_CHANGED", p, undefined, "zh")).toBe("第1, 3页未召回，但已申报内容已更改（1.51；第3页商品行）——请召回这些页或撤销更改");
  });
  it("SENT_SHEETS_UNVERIFIED (tờ khai trước khi lưu nội dung đã gửi) có đủ 3 ngôn ngữ", () => {
    const p = { sheets: "1, 3" };
    expect(reasonText("SENT_SHEETS_UNVERIFIED", p, undefined, "vi")).toBe("Tờ 1, 3 khai trước khi hệ thống lưu nội dung đã gửi – không kiểm tra được, gọi về các tờ này trước khi sửa");
    expect(reasonText("SENT_SHEETS_UNVERIFIED", p, undefined, "en")).toBe("Sheets 1, 3 were declared before the system recorded sent content – cannot be verified; recall these sheets before editing");
    expect(reasonText("SENT_SHEETS_UNVERIFIED", p, undefined, "zh")).toBe("第 1, 3 张在系统记录已发送内容之前申报——无法核对，请先召回这些页再修改");
  });
});

describe("errorText", () => {
  const withReason = new ApiError("HS_UNCONFIRMED", "Còn 2 mã HS chưa xác nhận", 409, { reason: "HS_UNCONFIRMED", params: { n: 2 } });
  const plain = new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ", 404);
  it("có mã lý do → dịch theo ngôn ngữ", () => {
    expect(errorText(withReason, "vi")).toBe("Còn 2 mã HS chưa xác nhận");
    expect(errorText(withReason, "en")).toBe("2 HS codes are still unconfirmed");
    expect(errorText(withReason, "zh")).toBe("仍有 2 个 HS 编码未确认");
  });
  it("mock giữ câu riêng nhưng gửi mã → vi giữ nguyên câu mock", () => {
    const mock = new ApiError("VALIDATION", "Chưa khai được – còn 1 chỉ tiêu bắt buộc chưa nhập: 1.22 Địa chỉ", 400, { reason: "REQUIRED_FIELDS_MISSING_SUBMIT", params: { n: 1, fields: "1.22 Địa chỉ" } });
    expect(errorText(mock, "vi")).toBe("Chưa khai được – còn 1 chỉ tiêu bắt buộc chưa nhập: 1.22 Địa chỉ");
    expect(errorText(mock, "en")).toBe("1 required fields are empty: 1.22 Địa chỉ – reopen the declaration to fill them in, then approve again");
  });
  it("không mã lý do: vi → nguyên message; en/zh → câu chung theo code", () => {
    expect(errorText(plain, "vi")).toBe("Không tìm thấy hồ sơ");
    expect(errorText(plain, "en")).toBe(DOMAIN_ERROR_MESSAGES.en.NOT_FOUND);
    expect(errorText(plain, "zh")).toBe(DOMAIN_ERROR_MESSAGES.zh.NOT_FOUND);
  });
  it("code lạ / Error thường → message; không phải Error → fallback", () => {
    expect(errorText(new ApiError("NETWORK", "Couldn't reach the server.", 0), "en")).toBe("Couldn't reach the server.");
    expect(errorText(new Error("boom"), "zh")).toBe("boom");
    expect(errorText("x", "en", "Something went wrong")).toBe("Something went wrong");
  });
});
