// C6 – số tờ khai cuối của mặt hàng: Hải quan cấp số (sau duyệt) → CatalogPort.recordDeclarationNo ghi last_declaration_no (+ ngày)
// khi ngày đang lưu trống hoặc ≤ ngày của số này; không cộng times_declared; theo chuỗi gộp; theo org; gọi lại y nguyên không đổi gì.
import { beforeEach, describe, expect, it } from "vitest";
import { createCatalogPort } from "../catalog-port.js";
import { createItem } from "../items.js";
import { mergeItems } from "../merge.js";
import { admin, makeHarness, ORG, OTHER, otherAdmin, seedSet, type Harness } from "./_harness.js";

let h: Harness;

async function item(name: string, ctx = admin) {
  const r = await createItem(h.deps, ctx, { kind: "MATERIAL", name, baseUnit: "MTR" });
  if (!r.ok || r.value.status !== "CREATED") throw new Error(JSON.stringify(r));
  return r.value.item.item.id;
}
const row = (id: string) => h.uow.data.items.find((i) => i.id === id)!;

beforeEach(() => {
  h = makeHarness();
  seedSet(h, { id: "cst_xnk", kind: "CUSTOMS", isDefault: true });
  seedSet(h, { id: "cst_xnk_b", kind: "CUSTOMS", isDefault: true }, OTHER);
});

describe("CatalogPort.recordDeclarationNo", () => {
  it("lúc duyệt chưa có số → Hải quan cấp số cùng/sau ngày duyệt: ghi số + ngày, times_declared giữ nguyên; gọi lại y nguyên vẫn vậy", async () => {
    const a = await item("A");
    const port = createCatalogPort(h.deps);
    await port.recordDeclared(ORG, [{ itemId: a, declarationNo: null, date: "2026-11-13", typeCode: "A11" }]);
    expect(row(a)).toMatchObject({ timesDeclared: 1, lastDeclarationNo: null, lastDeclarationDate: "2026-11-13" });
    expect(await port.recordDeclarationNo(ORG, [{ itemId: a, declarationNo: "107000000001", date: "2026-11-14" }])).toEqual({ updated: 1 });
    expect(row(a)).toMatchObject({ timesDeclared: 1, lastDeclarationNo: "107000000001", lastDeclarationDate: "2026-11-14", lastTypeCode: "A11" });
    expect(await port.recordDeclarationNo(ORG, [{ itemId: a, declarationNo: "107000000001", date: "2026-11-14" }])).toEqual({ updated: 1 });
    expect(row(a)).toMatchObject({ timesDeclared: 1, lastDeclarationNo: "107000000001", lastDeclarationDate: "2026-11-14" });
  });

  it("số của tờ khai cũ hơn tờ đang lưu → không ghi đè; cùng ngày → ghi", async () => {
    const a = await item("A");
    const port = createCatalogPort(h.deps);
    await port.recordDeclarationNo(ORG, [{ itemId: a, declarationNo: "107000000009", date: "2026-11-14" }]);
    expect(await port.recordDeclarationNo(ORG, [{ itemId: a, declarationNo: "107000000001", date: "2026-11-10" }])).toEqual({ updated: 0 });
    expect(row(a)).toMatchObject({ lastDeclarationNo: "107000000009", lastDeclarationDate: "2026-11-14" });
    expect(await port.recordDeclarationNo(ORG, [{ itemId: a, declarationNo: "107000000010", date: "2026-11-14" }])).toEqual({ updated: 1 });
    expect(row(a).lastDeclarationNo).toBe("107000000010");
  });

  it("mặt hàng đã gộp → ghi vào mặt hàng cuối chuỗi; nhiều dòng cùng mặt hàng → một lần", async () => {
    const a = await item("A");
    const b = await item("B");
    await mergeItems(h.deps, admin, { fromId: a, intoId: b });
    const port = createCatalogPort(h.deps);
    expect(await port.recordDeclarationNo(ORG, [{ itemId: a, declarationNo: "107000000002", date: "2026-11-14" }, { itemId: b, declarationNo: "107000000002", date: "2026-11-14" }])).toEqual({ updated: 1 });
    expect(row(b)).toMatchObject({ lastDeclarationNo: "107000000002", timesDeclared: 0 });
    expect(row(a).lastDeclarationNo).toBeNull();
  });

  it("org khác: mặt hàng không thuộc org → bỏ qua, dữ liệu org kia nguyên vẹn", async () => {
    const a = await item("A");
    const x = await item("X", otherAdmin);
    const port = createCatalogPort(h.deps);
    expect(await port.recordDeclarationNo(OTHER, [{ itemId: a, declarationNo: "107000000003", date: "2026-11-14" }])).toEqual({ updated: 0 });
    expect(row(a).lastDeclarationNo).toBeNull();
    expect(await port.recordDeclarationNo(ORG, [{ itemId: x, declarationNo: "107000000004", date: "2026-11-14" }])).toEqual({ updated: 0 });
    expect(row(x).lastDeclarationNo).toBeNull();
  });
});
