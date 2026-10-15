import { describe, expect, it } from "vitest";
import { buildDocumentSheet } from "../document-sheet.js";

describe("buildDocumentSheet – bảng đọc chứng từ (STT | Tên trường | Trị giá)", () => {
  it("theo thứ tự danh mục; bên (party) = tên + địa chỉ xuống dòng; số giữ nguyên; trống → chuỗi rỗng", () => {
    const rows = buildDocumentSheet("BILL_OF_LADING", {
      billNo: "FANS25040166", shipper: { name: "SHENZHEN APTUS", address: "SHENZHEN, CHINA", taxCode: null, country: "CN" }, vessel: "INTERASIA VISION", voyage: "S079",
      grossWeightKg: 119.5, containers: [{ no: "WHSU5082841", sealNo: "WHAC346102", size: "LCL" }], uncertainties: [],
    });
    expect(rows[0]).toEqual({ stt: 1, key: "billNo", label: "Số vận đơn", value: "FANS25040166" });
    expect(rows.find((r) => r.key === "shipper")?.value).toBe("SHENZHEN APTUS\nSHENZHEN, CHINA");
    expect(rows.find((r) => r.key === "grossWeightKg")?.value).toBe("119.5");
    expect(rows.find((r) => r.key === "masterBillNo")?.value).toBe("");
    expect(rows.find((r) => r.key === "containers.0.no")).toMatchObject({ label: "Container 1 – Số container", value: "WHSU5082841" });
    expect(rows.map((r) => r.stt)).toEqual(rows.map((_, i) => i + 1));
  });
  it("boolean → Có/Không; trường bổ sung riêng ở cuối với nhãn của doanh nghiệp", () => {
    const rows = buildDocumentSheet("CERT_OF_ORIGIN", { coNo: "E25", certified: true, custom: { lc_no: "LC-1" }, uncertainties: [] }, { lc_no: "Số L/C" });
    expect(rows.find((r) => r.key === "certified")?.value).toBe("Có");
    expect(rows.at(-1)).toMatchObject({ key: "custom.lc_no", label: "Số L/C (bổ sung)", value: "LC-1" });
  });
});
