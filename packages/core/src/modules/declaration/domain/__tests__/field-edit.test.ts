import { DERIVED_DECLARATION_FIELD_CODES } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { errCode } from "../../../../shared/result.js";
import { buildDeclaration, mappingsFor } from "../build.js";
import { canEditField } from "../guards.js";
import { DOSSIER, hansol, ORG } from "../test/shipment.js";

const NOW = new Date("2026-10-14T03:00:00.000Z");
const built = buildDeclaration({ shipment: hansol(), dossier: DOSSIER, org: ORG, items: [{ id: "li_1", amount: "20850", importDutyRate: "0", vatRate: "8" }], now: NOW, exchange: { date: "2026-10-14", rates: { USD: "25400" }, missing: [] } });

describe("canEditField", () => {
  it("chỉ tiêu là đầu vào tính thuế không sửa tay", () => {
    for (const code of DERIVED_DECLARATION_FIELD_CODES) expect(errCode(canEditField("IDA", code, "1"))).toBe("VALIDATION");
  });

  it("chỉ tiêu bắt buộc không để trống; chỉ tiêu tùy chọn được xóa", () => {
    expect(errCode(canEditField("IDA", "SO_HD", ""))).toBe("VALIDATION");
    const optional = mappingsFor("IDA").find((m) => !m.required && !DERIVED_DECLARATION_FIELD_CODES.includes(m.code))!;
    expect(canEditField("IDA", optional.code, "").ok).toBe(true);
  });

  it("số và ngày phải đúng dạng theo catalog Phụ lục II", () => {
    expect(canEditField("IDA", "TRONG_LUONG", "5402.5").ok).toBe(true);
    for (const bad of ["5.402,50", "5402 kg", "abc", "-1"]) expect(errCode(canEditField("IDA", "TRONG_LUONG", bad))).toBe("VALIDATION");
    expect(canEditField("IDA", "NGAY_HD", "2026-10-02").ok).toBe(true);
    for (const bad of ["02/10/2026", "2026-13-01", "2026-02-30"]) expect(errCode(canEditField("IDA", "NGAY_HD", bad))).toBe("VALIDATION");
    expect(canEditField("EDA", "TRONG_LUONG", "12.5").ok).toBe(true);
    expect(canEditField("IDA", "SO_VD", "COSU6402210870").ok).toBe(true);
  });

  it("giá trị hệ thống tự dựng luôn qua được chính luật này (không tự mâu thuẫn với ánh xạ)", () => {
    expect(built.kind).toBe("IDA");
    const rejected = Object.entries(built.fields)
      .filter(([code, f]) => !DERIVED_DECLARATION_FIELD_CODES.includes(code) && f.value !== "")
      .filter(([code, f]) => !canEditField("IDA", code, f.value).ok)
      .map(([code, f]) => `${code}=${f.value}`);
    expect(rejected).toEqual([]);
  });
});
