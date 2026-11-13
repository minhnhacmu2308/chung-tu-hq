// Nguồn danh mục hàng hóa: dòng invoice/packing list đã đọc có Part No + đối tác theo chiều hồ sơ (lô hàng mới nhất mỗi hồ sơ).
import { emptyShipment, type Shipment } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { listInvoiceLinesForCatalog } from "../catalog-source.js";
import type { OrgInfo } from "../ports.js";
import { InMemoryExtractionUow } from "../test/fakes.js";

const s = (v: string | null) => ({ value: v, sources: [], status: "SINGLE_SOURCE" as const });
function shipment(seller: string, buyer: string, items: { lineNo: number; partNo: string | null; desc: string }[], buyerTax: string | null = null): Shipment {
  const sh = emptyShipment();
  sh.parties.seller.name = s(seller);
  sh.parties.buyer.name = s(buyer);
  sh.parties.buyer.taxCode = s(buyerTax);
  sh.items = items.map((i) => ({ lineNo: i.lineNo, description: s(i.desc), quantity: s("1"), unit: s("PCE"), unitPrice: s(null), amount: s(null), origin: s(null), hsOnInvoice: s("8482.10"), partNo: s(i.partNo) }));
  return sh;
}
const at = new Date("2026-11-13T00:00:00Z");
const ORG_INFO = { taxCode: "0316789012", name: "CÔNG TY TNHH AN PHÁT", suspectThreshold: "BALANCED" } as unknown as OrgInfo;
function documents(directions: Record<string, "NK" | "XK">) {
  return {
    orgInfo: async () => ORG_INFO,
    dossierInfo: async (_o: string, id: string) => (directions[id] ? { status: "NEEDS_REVIEW" as const, direction: directions[id]!, documentSources: {} as never, declarationNo: null } : null),
  };
}

describe("listInvoiceLinesForCatalog", () => {
  it("NK: người bán → SUPPLIER; lô mới nhất mỗi hồ sơ; chỉ dòng có Part No; org khác không thấy", async () => {
    const uow = new InMemoryExtractionUow();
    uow.data.shipments.push(
      { id: "s1", orgId: "org_a", dossierId: "dos1", version: 1, data: shipment("OLD", "An Phát", [{ lineNo: 1, partNo: "OLD-1", desc: "cũ" }]), schemaVersion: "v", createdAt: at },
      { id: "s2", orgId: "org_a", dossierId: "dos1", version: 2, data: shipment("ACME", "An Phát", [{ lineNo: 1, partNo: "P-1", desc: "Bearing" }, { lineNo: 2, partNo: null, desc: "no part" }]), schemaVersion: "v", createdAt: at },
      { id: "s3", orgId: "org_b", dossierId: "dos9", version: 1, data: shipment("B", "C", [{ lineNo: 1, partNo: "Q", desc: "x" }]), schemaVersion: "v", createdAt: at },
    );
    expect(await listInvoiceLinesForCatalog({ uow, documents: documents({ dos1: "NK", dos9: "NK" }) }, "org_a")).toEqual([
      { dossierId: "dos1", lineNo: 1, partNo: "P-1", description: "Bearing", unit: "PCE", hsCode: "8482.10", direction: "NK", partnerKind: "SUPPLIER", partnerName: "ACME" },
    ]);
  });

  it("XK: người mua → CUSTOMER (không lấy người bán = chính doanh nghiệp); đối tác là chính doanh nghiệp (MST/tên) → bỏ dòng", async () => {
    const uow = new InMemoryExtractionUow();
    uow.data.shipments.push(
      { id: "x1", orgId: "org_a", dossierId: "xk1", version: 1, data: shipment("CÔNG TY TNHH AN PHÁT", "Globex GmbH", [{ lineNo: 1, partNo: "FG-1", desc: "Finished good" }]), schemaVersion: "v", createdAt: at },
      // Mua bán nội bộ: người mua chính là doanh nghiệp (trùng MST) → bỏ.
      { id: "x2", orgId: "org_a", dossierId: "xk2", version: 1, data: shipment("Ai đó", "Khác tên", [{ lineNo: 1, partNo: "FG-2", desc: "x" }], "0316789012"), schemaVersion: "v", createdAt: at },
      // Nhập mà người bán là chính doanh nghiệp (trùng tên chuẩn hóa) → bỏ.
      { id: "n1", orgId: "org_a", dossierId: "nk1", version: 1, data: shipment("Cong ty TNHH An Phat", "x", [{ lineNo: 1, partNo: "P-9", desc: "y" }]), schemaVersion: "v", createdAt: at },
    );
    const got = await listInvoiceLinesForCatalog({ uow, documents: documents({ xk1: "XK", xk2: "XK", nk1: "NK" }) }, "org_a");
    expect(got).toEqual([{ dossierId: "xk1", lineNo: 1, partNo: "FG-1", description: "Finished good", unit: "PCE", hsCode: "8482.10", direction: "XK", partnerKind: "CUSTOMER", partnerName: "Globex GmbH" }]);
  });
});
