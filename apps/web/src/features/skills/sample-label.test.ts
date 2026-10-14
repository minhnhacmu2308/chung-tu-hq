import type { SkillField } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { structuredCount, toExpected, toFormValues } from "./sample-label";

const f = (key: string, type: SkillField["type"], extract = true): SkillField => ({ key, label: key, type, required: false, aliases: [], extract, display: true });
const FIELDS = [f("invoice_no", "string"), f("total_amount", "decimal"), f("seller", "party"), f("items", "items"), f("internal", "string", false), f("issue_date", "date")];

describe("nhãn mẫu ↔ ô nhập", () => {
  it("chỉ hiện trường vô hướng cần đọc; null/thiếu → ô trống; số → chuỗi", () => {
    const rows = toFormValues(FIELDS, { invoice_no: "A-1", total_amount: 100, seller: { name: "X" }, items: [{}], issue_date: null });
    expect(rows.map((r) => [r.field.key, r.value])).toEqual([["invoice_no", "A-1"], ["total_amount", "100"], ["issue_date", ""]]);
    expect(toFormValues(FIELDS, null).map((r) => r.value)).toEqual(["", "", ""]);
    expect(structuredCount(FIELDS)).toBe(2);
  });

  it("trường vô hướng mà nhãn đang là object thì không đưa lên màn (tránh ghi đè hỏng)", () => {
    expect(toFormValues(FIELDS, { invoice_no: { odd: true } }).map((r) => r.field.key)).toEqual(["total_amount", "issue_date"]);
  });

  it("ghép lại: cắt khoảng trắng, ô trống → null, giữ nguyên dữ liệu có cấu trúc và key ngoài màn", () => {
    const old = { invoice_no: "A-1", total_amount: "100", seller: { name: "X" }, items: [{ n: 1 }], legacy: 1 };
    expect(toExpected(old, { invoice_no: " A-2 ", total_amount: "  " })).toEqual({ invoice_no: "A-2", total_amount: null, seller: { name: "X" }, items: [{ n: 1 }], legacy: 1 });
    expect(toExpected(null, { invoice_no: "A" })).toEqual({ invoice_no: "A" });
  });
});
