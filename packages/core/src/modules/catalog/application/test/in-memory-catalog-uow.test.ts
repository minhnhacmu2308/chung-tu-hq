import { describe, expect, it } from "vitest";
import { asOrgId, asUserId } from "../../../../shared/ids.js";
import type { CatalogItemRow } from "../ports.js";
import { InMemoryCatalogUow } from "./in-memory-catalog-uow.js";

const A = { orgId: asOrgId("org_a"), userId: asUserId("usr_a") };
const B = { orgId: asOrgId("org_b"), userId: asUserId("usr_b") };
const now = new Date("2026-11-13T00:00:00Z");
const item = (id: string, orgId: string, extra: Partial<CatalogItemRow> = {}): CatalogItemRow => ({
  id, orgId, itemNo: `MH-${id}`, kind: "GOODS", name: id, nameKey: id, hsCode: null, baseUnit: null, origin: null, tariffSchedule: null, importDutyRate: null, vatRate: null, envTaxRate: null, exciseRate: null, safeguardRate: null, antiDiscriminationRate: null,
  description: null, note: null, timesDeclared: 0, lastDeclarationNo: null, lastDeclarationDate: null, lastTypeCode: null, status: "ACTIVE", mergedIntoId: null, source: "MANUAL", updatedBy: null, createdAt: now, updatedAt: now, ...extra,
});

describe("InMemoryCatalogUow", () => {
  it("org khác không đọc/ghi được; nextItemNo tăng dần; resolveMerged theo chuỗi", async () => {
    const uow = new InMemoryCatalogUow();
    await uow.asOrg(A, async (r) => {
      await r.items.insert(item("c", A.orgId));
      await r.items.insert(item("b", A.orgId, { status: "MERGED", mergedIntoId: "c" }));
      await r.items.insert(item("a", A.orgId, { status: "MERGED", mergedIntoId: "b" }));
      expect(await r.settings.nextItemNo(A.orgId)).toBe("MH-000001");
      expect(await r.settings.nextItemNo(A.orgId)).toBe("MH-000002");
    });
    expect((await uow.asOrg(A, (r) => r.items.resolveMerged(A.orgId, "a")))?.id).toBe("c");
    expect(await uow.asOrg(B, (r) => r.items.get(B.orgId, "a"))).toBeNull();
    expect(await uow.asOrg(B, (r) => r.items.resolveMerged(B.orgId, "a"))).toBeNull();
    await expect(uow.asOrg(B, (r) => r.items.insert(item("z", A.orgId)))).rejects.toThrow(/row-level security/);
  });

  it("unique bí danh ACTIVE: ACTIVE thứ hai lỗi, PROPOSED được", async () => {
    const uow = new InMemoryCatalogUow();
    const al = (id: string, status: "ACTIVE" | "PROPOSED") => ({ id, orgId: A.orgId as string, codeSetId: "s", code: "x", codeKey: "X", name: null, unit: null, itemId: "i", status, proposedBy: null, decidedBy: null, decidedAt: null, source: "MANUAL" as const, createdAt: now, updatedAt: now });
    await uow.asOrg(A, async (r) => {
      await r.aliases.insert(al("1", "ACTIVE"));
      await r.aliases.insert(al("2", "PROPOSED"));
      await expect(r.aliases.insert(al("3", "ACTIVE"))).rejects.toThrow(/unique/);
    });
  });
});
