import { describe, expect, it } from "vitest";
import { catalogAccess } from "./catalog-access";

const sets = [{ id: "kho", ownerIds: ["usr_ha"] }, { id: "xnk", ownerIds: [] }];

describe("catalogAccess (spec §7 – chỉ ẩn nút)", () => {
  it("VIEWER: chỉ xem, kể cả khi có tên trong người phụ trách", () => {
    const a = catalogAccess("VIEWER", "usr_ha", sets);
    expect([a.canContribute, a.canEditItem, a.isAdmin, a.managesSet("kho"), a.canEditConversions]).toEqual([false, false, false, false, false]);
  });
  it("DECLARANT phụ trách bộ Kho: quản lý mã bộ Kho + quy đổi, không bộ XNK, không sửa thông tin chung", () => {
    const a = catalogAccess("DECLARANT", "usr_ha", sets);
    expect([a.canContribute, a.canEditItem, a.managesSet("kho"), a.managesSet("xnk"), a.canEditConversions]).toEqual([true, false, true, false, true]);
  });
  it("APPROVER sửa thông tin chung + quy đổi; ADMIN/OWNER tất cả; chưa biết vai trò → ẩn hết", () => {
    expect(catalogAccess("APPROVER", "usr_tuan", sets)).toMatchObject({ canEditItem: true, canEditConversions: true, isAdmin: false });
    for (const r of ["ADMIN", "OWNER"] as const) expect(catalogAccess(r, "x", sets).managesSet("xnk")).toBe(true);
    expect(catalogAccess(null, null, sets)).toMatchObject({ ready: false, canContribute: false });
  });
});
