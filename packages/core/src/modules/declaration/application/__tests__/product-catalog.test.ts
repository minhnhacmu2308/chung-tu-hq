import type { ProductCatalogInput, ProductImportItem } from "@kb/contracts";
import { ProductCatalogInputSchema } from "@kb/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import { ORG } from "../../domain/test/shipment.js";
import { createProduct, deleteProducts, importProducts, listProducts, recordApprovedProducts, updateProduct } from "../product-catalog.js";
import type { DeclarationDeps } from "../ports.js";
import { FakeDossiers, FakeShipments, fakeOrg, fakeUsers, fakeValidation, RecordingAudit, ScriptedHs } from "../test/fakes.js";
import { InMemoryDeclarationUow } from "../test/in-memory-uow.js";

const ctx = (role: Ctx["role"], org = "org_a"): Ctx => ({ orgId: asOrgId(org), userId: asUserId(`usr_${role}`), role });
const input = (v: Partial<ProductCatalogInput> = {}): ProductCatalogInput => ({ code: "", name: "Nước hoa YSL Libre EDP 90ml", hsCode: "3303.00.00", unit: "UNA", origin: "fr", tariffSchedule: "B01", importDutyRate: "18%", vatRate: "",
    envTaxRate: "", exciseRate: "", safeguardRate: "", antiDiscriminationRate: "", description: "", unit2: "", unitPrice: "", currency: "", partner: "", note: "", ...v });
const values = (v: Partial<ProductCatalogInput> = {}) => ProductCatalogInputSchema.parse(input(v));
const imp = (v: Partial<ProductImportItem> = {}): ProductImportItem => ({
  code: "145612", name: "Nước hoa YSL Libre EDP 90ml, 145612. Hàng mới 100%", hsCode: "33030000", unit: "UNA", origin: "FR", tariffSchedule: "B01",
  importDutyRate: "18", vatRate: null, envTaxRate: null, exciseRate: null, safeguardRate: null, antiDiscriminationRate: null, description: null, unit2: "UNA",
  unitPrice: "46.46", currency: "USD", partner: "DFASS SINGAPORE PTE. LTD", note: null, timesDeclared: 2, lastDeclarationNo: "108091566221", lastDeclarationDate: "2026-03-27", lastTypeCode: "A44",
  raw: { "Số TK": "108091566221" }, ...v,
});

let uow: InMemoryDeclarationUow;
let deps: DeclarationDeps;
beforeEach(() => {
  uow = new InMemoryDeclarationUow();
  deps = {
    uow, queue: new InMemoryJobQueue(), hs: new ScriptedHs([]), shipments: new FakeShipments({}, {}), dossiers: new FakeDossiers([], {}), validation: fakeValidation({}),
    org: fakeOrg(ORG), audit: new RecordingAudit(), users: fakeUsers, clock: fixedClock("2026-10-22T03:00:00.000Z"), idGen: sequentialIdGen(),
  };
});

describe("danh mục hàng hóa", () => {
  it("thêm tay: chuẩn hóa HS/thuế suất/xuất xứ; trùng tên (không phân biệt hoa thường, đuôi 'Hàng mới 100%') → DUPLICATE", async () => {
    const p = unwrap(await createProduct(deps, ctx("DECLARANT"), values()));
    expect(p).toMatchObject({ code: null, hsCode: "33030000", origin: "FR", importDutyRate: "18", vatRate: null, source: "MANUAL", timesDeclared: 0, unitPrice: null, currency: null });
    const priced = unwrap(await createProduct(deps, ctx("DECLARANT"), values({ code: "P1", unitPrice: "1 234,5", currency: "usd", exciseRate: "65%", description: "Mô tả", partner: "ABC" })));
    expect(priced).toMatchObject({ unitPrice: "1234.5", currency: "USD", exciseRate: "65", description: "Mô tả", partner: "ABC" });
    expect(ProductCatalogInputSchema.safeParse(input({ currency: "US" })).success).toBe(false);
    const dup = await createProduct(deps, ctx("ADMIN"), values({ name: "NƯỚC HOA YSL LIBRE EDP 90ML. Hàng mới 100%" }));
    expect(errCode(dup)).toBe("DUPLICATE");
    expect(!dup.ok && dup.error.reason).toBe("PRODUCT_NAME_EXISTS");
    // Có mã hàng thì khóa theo mã: cùng tên khác mã vẫn thêm được; trùng mã thì chặn
    unwrap(await createProduct(deps, ctx("DECLARANT"), values({ code: "A1" })));
    const dupCode = await createProduct(deps, ctx("DECLARANT"), values({ code: "a1", name: "Khác" }));
    expect(!dupCode.ok && dupCode.error).toMatchObject({ reason: "PRODUCT_CODE_EXISTS", params: { code: "a1" } });
  });

  it("sửa: đổi HS/tên; đổi sang khóa của mặt hàng khác → DUPLICATE; id lạ → NOT_FOUND", async () => {
    const a = unwrap(await createProduct(deps, ctx("DECLARANT"), values()));
    const b = unwrap(await createProduct(deps, ctx("DECLARANT"), values({ name: "Rượu Jack Daniels 1L", hsCode: "22083090" })));
    expect(unwrap(await updateProduct(deps, ctx("DECLARANT"), a.id, values({ hsCode: "33049930" }))).hsCode).toBe("33049930");
    expect(errCode(await updateProduct(deps, ctx("DECLARANT"), b.id, values()))).toBe("DUPLICATE");
    expect(errCode(await updateProduct(deps, ctx("DECLARANT"), "prd_x", values()))).toBe("NOT_FOUND");
  });

  it("quyền: Người duyệt / Người xem chỉ đọc; Người khai, Quản trị, Chủ sở hữu ghi được", async () => {
    for (const role of ["VIEWER", "APPROVER"] as const) {
      expect(errCode(await createProduct(deps, ctx(role), values()))).toBe("FORBIDDEN");
      expect(errCode(await importProducts(deps, ctx(role), { items: [imp()] }))).toBe("FORBIDDEN");
      expect(errCode(await deleteProducts(deps, ctx(role), ["x"]))).toBe("FORBIDDEN");
    }
    unwrap(await createProduct(deps, ctx("OWNER"), values()));
    expect(unwrap(await listProducts(deps, ctx("VIEWER")))).toHaveLength(1);
  });

  it("import: thêm mới; import lại cùng file không cộng dồn; bản mới hơn ghi đè, bản cũ hơn chỉ điền ô trống", async () => {
    expect(unwrap(await importProducts(deps, ctx("DECLARANT"), { items: [imp(), imp({ code: null, name: "Rượu Jack Daniels 1L", hsCode: "22083090", timesDeclared: 5 })] }))).toEqual({ created: 2, updated: 0 });
    expect(unwrap(await importProducts(deps, ctx("DECLARANT"), { items: [imp()] }))).toEqual({ created: 0, updated: 1 });
    let ysl = unwrap(await listProducts(deps, ctx("VIEWER"))).find((p) => p.code === "145612")!;
    expect(ysl).toMatchObject({ source: "IMPORT", timesDeclared: 2, hsCode: "33030000", lastDeclarationDate: "2026-03-27", raw: { "Số TK": "108091566221" } });

    expect(ysl).toMatchObject({ unit2: "UNA", unitPrice: "46.46", currency: "USD", partner: "DFASS SINGAPORE PTE. LTD", envTaxRate: null });

    unwrap(await importProducts(deps, ctx("DECLARANT"), { items: [imp({ hsCode: "33049990", lastDeclarationDate: "2026-05-19", timesDeclared: 3, vatRate: "8", unitPrice: "50", envTaxRate: "0", description: "Nước hoa nữ, chai thủy tinh 90ml" })] }));
    ysl = unwrap(await listProducts(deps, ctx("VIEWER"))).find((p) => p.code === "145612")!;
    expect(ysl).toMatchObject({ hsCode: "33049990", lastDeclarationDate: "2026-05-19", timesDeclared: 3, vatRate: "8", unitPrice: "50", envTaxRate: "0", description: "Nước hoa nữ, chai thủy tinh 90ml" });

    unwrap(await importProducts(deps, ctx("DECLARANT"), { items: [imp({ hsCode: "11111111", lastDeclarationDate: "2025-01-01", timesDeclared: 1, note: "cũ" })] }));
    ysl = unwrap(await listProducts(deps, ctx("VIEWER"))).find((p) => p.code === "145612")!;
    expect(ysl).toMatchObject({ hsCode: "33049990", lastDeclarationDate: "2026-05-19", timesDeclared: 3, note: "cũ" });
  });

  it("import: trùng khóa trong cùng lô → giữ dòng có tờ khai mới nhất", async () => {
    unwrap(await importProducts(deps, ctx("DECLARANT"), { items: [imp({ lastDeclarationDate: "2026-05-01", hsCode: "22222222" }), imp({ lastDeclarationDate: "2026-03-01" })] }));
    expect(unwrap(await listProducts(deps, ctx("VIEWER")))).toMatchObject([{ hsCode: "22222222" }]);
  });

  it("tờ khai được duyệt: khớp theo tên cả mặt hàng có mã hàng (tăng số lần khai, giữ HS); mặt hàng mới thêm vào; dòng chưa xác nhận HS bỏ qua", async () => {
    unwrap(await importProducts(deps, ctx("DECLARANT"), { items: [imp()] }));
    const now = new Date("2026-10-22T03:00:00Z");
    const line = (lineNo: number, description: string, hsConfirmed: string | null) => ({
      id: `itm_${lineNo}`, orgId: "org_a", dossierId: "dos_1", lineNo, description, quantity: "1", unit: "UNA", unitPrice: "1", amount: "1", origin: "FR",
      invoiceHsCode: null, hsSuggested: null, hsConfidence: null, hsConfirmed, hsConfirmedBy: null, hsConfirmedAt: null, importDutyRate: "18", vatRate: "8", policyNote: null, taxDetail: null,
      hsJobId: null, hsItemId: null, hsStatus: "completed" as const, hsQuestion: null, hsError: null, hsDetail: null, createdAt: now, updatedAt: now,
    });
    const f = (no: string, value: string) => ({ no, label: "", section: "GENERAL" as const, value, source: "USER" as const });
    const decl = { id: "dec_1", orgId: "org_a", kind: "IDA", fields: { TK_ICB: f("1.4", "A11"), MA_TT: f("1.44", "EUR"), NXK_TEN: f("1.20", " L'OREAL SA ") } } as unknown as Parameters<typeof recordApprovedProducts>[2];
    await uow.asOrg(ctx("APPROVER"), (r) => recordApprovedProducts(r, deps.idGen, decl, [
      line(1, "  NƯỚC HOA YSL LIBRE EDP 90ML, 145612 ", "9999.99.99"),
      line(2, "Mặt hàng mới", "8482.10.00"),
      line(3, "Chưa xác nhận", null),
    ], now, "usr_x"));
    const list = unwrap(await listProducts(deps, ctx("VIEWER")));
    // Đơn giá / mã tiền / đối tác theo lần khai mới nhất; ĐVT SL2 (chỉ có ở file import) giữ nguyên
    expect(list.find((p) => p.code === "145612")).toMatchObject({
      hsCode: "33030000", timesDeclared: 3, lastDeclarationDate: "2026-10-22", lastTypeCode: "A11", unitPrice: "1", currency: "EUR", partner: "L'OREAL SA", unit2: "UNA",
    });
    expect(list.find((p) => p.name === "Mặt hàng mới")).toMatchObject({ source: "DECLARATION", hsCode: "84821000", timesDeclared: 1, unitPrice: "1", currency: "EUR", partner: "L'OREAL SA", description: null });
    expect(list).toHaveLength(2);
  });

  it("xóa nhiều; doanh nghiệp khác không đọc, sửa, xóa được", async () => {
    const a = unwrap(await createProduct(deps, ctx("DECLARANT"), values()));
    const b = unwrap(await createProduct(deps, ctx("DECLARANT"), values({ name: "Khác" })));
    expect(unwrap(await listProducts(deps, ctx("OWNER", "org_b")))).toEqual([]);
    expect(errCode(await updateProduct(deps, ctx("OWNER", "org_b"), a.id, values()))).toBe("NOT_FOUND");
    expect(errCode(await deleteProducts(deps, ctx("OWNER", "org_b"), [a.id]))).toBe("NOT_FOUND");
    expect(unwrap(await deleteProducts(deps, ctx("DECLARANT"), [a.id, b.id, a.id]))).toEqual({ deleted: 2 });
    expect(unwrap(await listProducts(deps, ctx("VIEWER")))).toEqual([]);
  });
});
