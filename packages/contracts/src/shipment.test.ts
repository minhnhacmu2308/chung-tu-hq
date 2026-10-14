import { describe, expect, it } from "vitest";
import { emptyShipment, ShipmentSchema } from "./shipment.js";

describe("ShipmentSchema", () => {
  it("emptyShipment hợp lệ và mọi giá trị null, không có nguồn", () => {
    const s = ShipmentSchema.parse(emptyShipment());
    expect(s.invoice.no.value).toBeNull();
    expect(s.invoice.no.sources).toEqual([]);
    expect(s.items).toEqual([]);
  });
  it("Sourced: tiền là DecimalString, nguồn có documentId/kind/page", () => {
    const s = emptyShipment();
    s.invoice.totalAmount = { value: "20850.00", status: "SINGLE_SOURCE", sources: [{ documentId: "doc_1", kind: "INVOICE", page: 1, raw: "20,850.00" }] };
    expect(ShipmentSchema.parse(s).invoice.totalAmount.value).toBe("20850.00");
    s.invoice.totalAmount = { value: "20,850.00", status: "SINGLE_SOURCE", sources: [] };
    expect(ShipmentSchema.safeParse(s).success).toBe(false);
  });
});
