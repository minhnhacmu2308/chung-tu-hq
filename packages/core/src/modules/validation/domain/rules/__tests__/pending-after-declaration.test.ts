// ADR 0013 GĐ1: chứng từ "có sau khi khai" (B/L, AWB, C/O hàng xuất) – luật thiếu dữ liệu vì chứng từ đó chưa có trả SKIPPED với lý do "chờ chứng từ sau khai";
// dữ liệu đã có (nhập tay, chứng từ khác) mà sai thì vẫn FAIL/WARN.
import type { DocKind, Shipment } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import type { DossierProfile } from "../../helpers.js";
import { runAllRules } from "../../run.js";
import { anphatExport, ORG, src, XK_SEA } from "../../test/shipments.js";

const XK_AIR: DossierProfile = { ...XK_SEA, transportMode: "AIR" };
const pending = (p: DossierProfile, kinds: DocKind[]): DossierProfile => ({ ...p, pendingKinds: kinds });
const without = (kinds: DocKind[]) => (s: Shipment) => (s.documents = s.documents.filter((d) => !kinds.includes(d.kind)));
const result = (code: string, s: Shipment, dossier: DossierProfile) => runAllRules(s, { org: ORG, dossier }).find((r) => r.code === code)!;

describe("chứng từ có sau khi khai", () => {
  it("B/L chờ sau khai, chưa tải lên: luật trọng lượng PL ↔ vận đơn trả SKIPPED kèm lý do chờ", () => {
    const s = anphatExport((x) => {
      without(["BILL_OF_LADING"])(x);
      x.transport.grossWeightKg = src("3860.5", ["PACKING_LIST"]);
    });
    const r = result("R-WEIGHT-PL-BL", s, pending(XK_SEA, ["BILL_OF_LADING"]));
    expect(r.result).toBe("SKIPPED");
    expect(r.detail).toBe("Chờ chứng từ sau khai: vận đơn đường biển (B/L) – luật chạy lại khi tải chứng từ lên");
  });

  it("dữ liệu đã có (nhập tay / chứng từ khác) mà sai thì vẫn FAIL dù B/L chờ sau khai", () => {
    const s = anphatExport((x) => {
      without(["BILL_OF_LADING"])(x);
      x.invoice.incoterm.value = "CIF TOKYO";
      x.transport.freightTerm = { ...x.invoice.incoterm, value: "COLLECT" };
    });
    expect(result("R-FREIGHT-TERM", s, pending(XK_SEA, ["BILL_OF_LADING"])).result).toBe("FAIL");
  });

  it("B/L đã tải lên dù từng đánh dấu chờ: luật chạy như thường (đối chiếu thật)", () => {
    const s = anphatExport((x) => {
      x.invoice.incoterm.value = "CIF TOKYO";
      x.transport.freightTerm = { ...x.invoice.incoterm, value: "COLLECT" };
    });
    expect(result("R-FREIGHT-TERM", s, pending(XK_SEA, ["BILL_OF_LADING"])).result).toBe("FAIL");
  });

  it("PASS giữ nguyên khi dữ liệu đã đủ từ chứng từ khác", () => {
    const s = anphatExport(without(["BILL_OF_LADING"]));
    expect(result("R-CONTAINER-LIST", s, pending(XK_SEA, ["BILL_OF_LADING"])).result).toBe("PASS");
  });

  it("R-CONTAINER-LIST vẫn chặn khi B/L chờ mà chưa có số container – nhắc nhập theo booking / Packing List", () => {
    const s = anphatExport((x) => {
      without(["BILL_OF_LADING"])(x);
      x.transport.containers = [];
    });
    const r = result("R-CONTAINER-LIST", s, pending(XK_SEA, ["BILL_OF_LADING"]));
    expect(r.result).toBe("FAIL");
    expect(r.detail).toContain("booking");
  });

  it("C/O chờ sau khai: R-ORIGIN-CO SKIPPED với lý do chờ C/O", () => {
    const s = anphatExport((x) => {
      without(["CERT_OF_ORIGIN"])(x);
      x.origin.coForm.value = null;
      x.origin.country.value = null;
    });
    const r = result("R-ORIGIN-CO", s, pending(XK_SEA, ["CERT_OF_ORIGIN"]));
    expect(r.result).toBe("SKIPPED");
    expect(r.detail).toContain("C/O");
  });

  it("AWB chờ sau khai: chưa có số AWB → SKIPPED chờ AWB; có số mà quá dài vẫn FAIL", () => {
    const s = anphatExport((x) => {
      x.documents = x.documents.filter((d) => d.kind !== "BILL_OF_LADING");
      x.transport.containers = [];
      x.transport.billNo.value = null;
      x.transport.masterBillNo.value = null;
    });
    const r = result("R-AWB-LENGTH", s, pending(XK_AIR, ["AIR_WAYBILL"]));
    expect(r.result).toBe("SKIPPED");
    expect(r.detail).toContain("AWB");
    s.transport.billNo.value = "180-123456789012345678901";
    expect(result("R-AWB-LENGTH", s, pending(XK_AIR, ["AIR_WAYBILL"])).result).toBe("FAIL");
  });

  it("luật không phụ thuộc chứng từ chờ (cước XK) không bị bỏ qua", () => {
    const s = anphatExport((x) => {
      without(["BILL_OF_LADING", "FREIGHT_INVOICE"])(x);
      x.invoice.incoterm.value = "CIF TOKYO";
    });
    expect(result("R-EXPORT-FREIGHT-DEDUCT", s, pending(XK_SEA, ["BILL_OF_LADING"])).result).toBe("FAIL");
  });
});
