// Nguồn danh mục hàng hóa: dòng tờ khai đã duyệt / đã truyền có mã hàng + HS đã xác nhận (Task 4 – "Lấy từ chứng từ đã đọc").
import { describe, expect, it } from "vitest";
import { listApprovedLinesForCatalog } from "../catalog-source.js";
import type { DeclarationRow, LineItemRow } from "../ports.js";
import { InMemoryDeclarationUow } from "../test/in-memory-uow.js";

const at = new Date("2026-11-13T00:00:00Z");
const decl = (id: string, orgId: string, dossierId: string, version: number, status: DeclarationRow["status"]) => ({ id, orgId, dossierId, kind: "IDA", version, status, fields: {}, createdAt: at, updatedAt: at }) as unknown as DeclarationRow;
const line = (id: string, orgId: string, dossierId: string, lineNo: number, itemCode: string | null, hsConfirmed: string | null) =>
  ({ id, orgId, dossierId, lineNo, description: `Hàng ${id}`, unit: "PCE", itemCode, hsConfirmed, createdAt: at, updatedAt: at }) as unknown as LineItemRow;

describe("listApprovedLinesForCatalog", () => {
  it("chỉ tờ khai mới nhất APPROVED/SUBMITTED; dòng có mã hàng + HS đã xác nhận; org khác không thấy", async () => {
    const uow = new InMemoryDeclarationUow();
    uow.data.declarations.push(decl("d1", "org_a", "dos1", 1, "APPROVED"), decl("d2", "org_a", "dos2", 1, "DRAFT"), decl("d3", "org_b", "dos3", 1, "SUBMITTED"));
    uow.data.lineItems.push(
      line("l1", "org_a", "dos1", 1, "BL-8", "73181510"),
      line("l2", "org_a", "dos1", 2, null, "73181510"),
      line("l3", "org_a", "dos1", 3, "X", null),
      line("l4", "org_a", "dos2", 1, "Y", "84821000"),
      line("l5", "org_b", "dos3", 1, "Z", "84821000"),
    );
    const rows = await listApprovedLinesForCatalog({ uow }, "org_a");
    expect(rows).toEqual([{ declarationId: "d1", dossierId: "dos1", lineNo: 1, itemCode: "BL-8", description: "Hàng l1", unit: "PCE", hsCode: "73181510" }]);
  });
});
