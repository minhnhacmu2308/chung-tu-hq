import { describe, expect, it } from "vitest";
import { pickDischargePort, resolveDischargePort, resolvePackageUnit, resolvePayment, resolvePort, resolveWarehouse, transportModeCode, type CatalogEntry } from "../catalog-resolve.js";

describe("catalog-resolve", () => {
  it("cảng: theo alias hoặc LOCODE có sẵn; không có → null", () => {
    expect(resolvePort("BUSAN, KOREA")).toEqual({ code: "KRPUS", name: "Busan" });
    expect(resolvePort("HAIPHONG, VIETNAM")?.code).toBe("VNHPH");
    expect(resolvePort("VNTVU – Cảng Tân Vũ")?.code).toBe("VNTVU");
    expect(resolvePort("PORT OF NOWHERE")).toBeNull();
    expect(resolvePort(null)).toBeNull();
  });
  it("POD nước ngoài (chuyển tải) → điểm đến cuối tại VN kèm ghi chú", () => {
    // Chỉ tên thành phố → cảng chung, kèm ghi chú chọn bến cụ thể.
    expect(resolveDischargePort("HAIPHONG", null)).toMatchObject({ resolved: { code: "VNHPH", name: "Cảng Hải Phòng" }, note: expect.stringMatching(/tên thành phố/) });
    const r = resolveDischargePort("SINGAPORE", "TAN VU TERMINAL, HAIPHONG");
    expect(r.resolved?.code).toBe("VNTVU");
    expect(r.note).toMatch(/chuyển tải/);
    expect(resolveDischargePort("SINGAPORE", null)).toMatchObject({ resolved: { code: "SGSIN" }, note: expect.stringMatching(/không phải cảng Việt Nam/) });
  });
  it("phương thức thanh toán → TK_IVP theo Phụ lục II: T/T thường là KC (kèm hướng dẫn ghi phương thức thực tế), TTR chỉ khi chuyển tiền bồi hoàn", () => {
    expect(resolvePayment("T/T 30 days after B/L date")).toMatchObject({ code: "KC", note: expect.stringMatching(/ghi phương thức thực tế/) });
    expect(resolvePayment("Bank transfer")?.code).toBe("KC");
    expect(resolvePayment("TTR reimbursement")?.code).toBe("TTR");
    expect(resolvePayment("Irrevocable L/C at sight")?.code).toBe("LC");
    expect(resolvePayment("D/P")?.code).toBe("DP");
    expect(resolvePayment("D/A 60 days")?.code).toBe("DA");
    expect(resolvePayment("Open account 30 days")?.code).toBe("OA");
    expect(resolvePayment("by cheque")?.code).toBe("CHEQUE");
    expect(resolvePayment("Cash")?.code).toBe("CASH");
    expect(resolvePayment("FOC – no commercial value")?.code).toBe("KHONGTT");
    expect(resolvePayment(null)).toBeNull();
  });
  it("phương thức thanh toán không nhận ra → KC kèm nghi ngờ (không im lặng)", () => {
    expect(resolvePayment("Barter 50/50")).toMatchObject({ code: "KC", suspect: true, note: expect.stringMatching(/Không nhận ra/) });
  });
  it("đơn vị kiện → mã loại kiện PACKAGE_KIND (pallet PK vì VNACCS không có PX, cuộn RO); không nhận ra → PK kèm guessed", () => {
    expect(resolvePackageUnit("PALLETS")).toMatchObject({ code: "PK", note: expect.stringMatching(/pallet/) });
    expect(resolvePackageUnit("PL")?.code).toBe("PK");
    expect(resolvePackageUnit("ROLLS")?.code).toBe("RO");
    expect(resolvePackageUnit("CTNS")).toEqual({ code: "CT", name: "Carton" });
    expect(resolvePackageUnit("xyz")).toMatchObject({ code: "PK", guessed: true });
    expect(resolvePackageUnit(null)).toBeNull();
  });
  it("Tân Sơn Nhất không còn mã giả VNSGN-A (không phải UN/LOCODE) → không tra được, người khai chọn", () => {
    expect(resolvePort("TAN SON NHAT AIRPORT")).toBeNull();
  });

  it.each([["AIR", "1"], ["SEA_CONTAINER", "2"], ["SEA_BULK", "3"], ["ROAD", "4"], ["RAIL", "5"], ["RIVER", "6"], ["OTHER", "9"]] as const)(
    "phương thức vận chuyển %s → mã %s",
    (mode, code) => expect(transportModeCode(mode, mode === "SEA_CONTAINER")).toEqual({ code, name: expect.any(String) }),
  );

  it("đường biển lệch với vận đơn → giữ mã người chọn, kèm ghi chú", () => {
    expect(transportModeCode("SEA_CONTAINER", false)).toMatchObject({ code: "2", note: expect.stringContaining("không có số container") });
    expect(transportModeCode("SEA_BULK", true)).toMatchObject({ code: "3", note: expect.stringContaining("có số container") });
  });

  // Lô FANS25040166 (TK 107139226350): B/L ghi "HO CHI MINH, VIETNAM", Arrival Notice ghi "CANG CAT LAI (HCM)" → VNCLI; kho "CÁT LÁI KHO 3" → 02CIRCI.
  const PORTS_A016: CatalogEntry[] = [
    { code: "VNCLI", name: "CANG CAT LAI (HCM)", parent: "VN" }, { code: "VNSGN", name: "CANG SAI GON (HCM)", parent: "VN" }, { code: "VNFDW", name: "CFS CAT LAI", parent: "VN" },
  ];
  const WH_02CI: CatalogEntry[] = [
    { code: "02CIRCI", name: "CCHQCK CANG SG KV I", parent: "02CI", note: "Địa điểm tập kết hàng do Chi cục HQ CK Cảng Sài Gòn KV I quản lý" },
    { code: "02CIS01", name: "TONG CTY TAN CANG SG", parent: "02CI", note: "Địa điểm lưu HH XNK bằng container tại Cảng Cát Lái" },
  ];
  it("cảng dỡ: tên trùng danh mục A016 trên Arrival Notice thắng tên thành phố trên B/L; không có danh mục vẫn ra bến cụ thể", () => {
    expect(pickDischargePort(["HO CHI MINH, VIETNAM", "CANG CAT LAI (HCM)"], [], PORTS_A016)).toMatchObject({ resolved: { code: "VNCLI", name: "CANG CAT LAI (HCM)" }, raw: "CANG CAT LAI (HCM)", fromCatalog: true });
    expect(pickDischargePort(["HO CHI MINH, VIETNAM", "CANG CAT LAI (HCM)"], [])).toMatchObject({ resolved: { code: "VNCLI" }, raw: "CANG CAT LAI (HCM)" });
    expect(pickDischargePort(["HO CHI MINH, VIETNAM"], [], PORTS_A016)).toMatchObject({ resolved: { code: "VNSGN" }, note: expect.stringMatching(/tên thành phố/) });
  });
  it("địa điểm lưu kho (A202): mã/tên khớp danh mục; AN chỉ ghi tên bãi → địa điểm tập kết của chi cục (không chắc); AN có mã lạ → giữ mã AN", () => {
    expect(resolveWarehouse(null, "CÁT LÁI KHO 3", WH_02CI)).toEqual({ entry: WH_02CI[0], exact: false });
    expect(resolveWarehouse(null, "Tổng Cty Tân Cảng SG", WH_02CI)).toEqual({ entry: WH_02CI[1], exact: true });
    expect(resolveWarehouse("02cis01", null, WH_02CI)).toEqual({ entry: WH_02CI[1], exact: true });
    expect(resolveWarehouse("02B1A04", "KHO SCSC", WH_02CI)).toBeNull();
    expect(resolveWarehouse(null, null, WH_02CI)).toBeNull();
    expect(resolveWarehouse(null, "CÁT LÁI KHO 3", undefined)).toBeNull();
  });
});
