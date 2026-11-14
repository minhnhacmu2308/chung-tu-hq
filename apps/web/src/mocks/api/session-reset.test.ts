import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { getCatalogSettings, listCodeSets, setupCatalog } from "./catalog";
import { resetMockDataEmptyCatalog } from "./session";

// Mỗi lời gọi mock trễ 250–650 ms (mock-request).
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => resetDb());

describe("Khôi phục dữ liệu mẫu – danh mục chưa thiết lập (chỉ bản dữ liệu mẫu)", () => {
  it("danh mục trống, chưa chọn chế độ; dòng hàng mẫu bỏ liên kết mặt hàng / Mã lạ / mã hàng; hồ sơ khác giữ nguyên", async () => {
    const dossiers = getDb().dossiers.length;
    expect(getDb().lineItems.some((l) => l.catalogItem || l.unknownCode)).toBe(true);

    await resetMockDataEmptyCatalog();

    expect(await getCatalogSettings()).toMatchObject({ mode: null, setupAt: null });
    expect(await listCodeSets()).toHaveLength(0);
    const db = getDb();
    expect(db.catalog.items).toHaveLength(0);
    expect(db.catalog.queue).toHaveLength(0);
    expect(db.lineItems.some((l) => l.catalogItem || l.unknownCode || l.itemCode || l.unitFactor)).toBe(false);
    expect(db.dossiers).toHaveLength(dossiers);
  });

  it("sau đó thiết lập lần đầu chọn được 'Dùng chung một bộ mã' → một bộ Mã chung", async () => {
    await resetMockDataEmptyCatalog();
    const sets = await setupCatalog({ mode: "SHARED", sets: [] });
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ kind: "SHARED", name: "Mã chung", isDefault: true });
    expect(await getCatalogSettings()).toMatchObject({ mode: "SHARED" });
  });
});
