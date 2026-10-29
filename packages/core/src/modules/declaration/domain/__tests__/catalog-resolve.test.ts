import { describe, expect, it } from "vitest";
import { A016, CATALOGS } from "./a016.js";
import { PORT_ALIASES, pickDischargePort, pickLoadingPort, resolveDischargePort, resolveWorldPort, resolvePackageUnit, resolvePayment, resolvePort, resolveWarehouse, transportModeCode, type CatalogEntry } from "../catalog-resolve.js";

describe("catalog-resolve", () => {
  it("cảng: theo bí danh hoặc LOCODE có sẵn – mã và tên theo danh mục A016; không có danh mục / mã không có trong A016 → null", () => {
    expect(resolvePort("BUSAN, KOREA", A016)).toEqual({ code: "KRPUS", name: "BUSAN" });
    expect(resolvePort("HAIPHONG, VIETNAM", A016)).toEqual({ code: "VNHPH", name: "CANG HAI PHONG" });
    expect(resolvePort("TAN VU TERMINAL", A016)).toEqual({ code: "VNHPN", name: "CANG TAN VU - HP" });
    expect(resolvePort("VNHPN – Cảng Tân Vũ", A016)?.code).toBe("VNHPN");
    expect(resolvePort("PORT OF NOWHERE", A016)).toBeNull();
    expect(resolvePort(null, A016)).toBeNull();
    expect(resolvePort("BUSAN, KOREA", undefined)).toBeNull();
    // Từ tiếng Anh trùng mã A016 ở giữa câu không bị bắt thành mã cảng.
    expect(resolvePort("GRAND PORT TERMINAL", A016)).toBeNull();
  });
  it("bí danh chỉ trỏ tới mã: mã có trong A016 thì dùng tên A016, mã chưa có (sân bay VNSGN/VNHAN) thì bỏ qua", () => {
    const codes = new Set(A016.map((e) => e.code));
    const missing = PORT_ALIASES.filter((p) => !codes.has(p.code)).map((p) => p.code);
    expect(missing.sort()).toEqual(["VNHAN", "VNSGN"]);
    expect(resolvePort("TAN SON NHAT AIRPORT", A016)).toBeNull();
    expect(resolvePort("TAN SON NHAT AIRPORT", [...A016, { code: "VNSGN", name: "SAN BAY TAN SON NHAT", parent: "VN" }])).toEqual({ code: "VNSGN", name: "SAN BAY TAN SON NHAT" });
  });
  it("POD nước ngoài (chuyển tải) → điểm đến cuối tại VN kèm ghi chú", () => {
    // Chỉ tên thành phố → cảng chung, kèm ghi chú chọn bến cụ thể.
    expect(resolveDischargePort("HAIPHONG", null, CATALOGS.ports)).toMatchObject({ resolved: { code: "VNHPH", name: "CANG HAI PHONG" }, note: expect.stringMatching(/tên thành phố/) });
    const r = resolveDischargePort("SINGAPORE", "TAN VU TERMINAL, HAIPHONG", CATALOGS.ports);
    expect(r.resolved?.code).toBe("VNHPN");
    expect(r.note).toMatch(/chuyển tải/);
    expect(pickDischargePort(["SINGAPORE"], [], CATALOGS.ports, { world: A016 })).toMatchObject({ resolved: { code: "SGSIN" }, note: expect.stringMatching(/không phải cảng Việt Nam/) });
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

  describe("cảng/sân bay nước ngoài theo danh mục A016", () => {
    const WORLD: CatalogEntry[] = [{ code: "CNZUH", name: "ZHUHAI", parent: "CN" }, { code: "CNJIN", name: "JINWAN", parent: "CN" }, { code: "XXVIC", name: "VICTORIA", parent: "SC" }, { code: "CAVIC", name: "VICTORIA", parent: "CA" }];
    it("tên trên chứng từ khớp một đoạn tên trong danh mục (“ZHUHAI, CHINA” → CNZUH); trùng tên nhiều nước chỉ nhận khi biết nước", () => {
      expect(resolveWorldPort("ZHUHAI, CHINA", "CN", WORLD)?.code).toBe("CNZUH");
      expect(resolveWorldPort("BUSAN, KOREA", null, A016)?.code).toBe("KRPUS");
      expect(resolveWorldPort("VICTORIA", null, WORLD)).toBeNull();
      expect(resolveWorldPort("VICTORIA", "CA", WORLD)?.code).toBe("CAVIC");
    });
    it("cảng xếp: chứng từ ghi nơi đi → mã đó; không chứng từ nào ghi → suy từ thành phố (đoạn có CITY) trong địa chỉ người xuất khẩu, đánh dấu kiểm", () => {
      expect(pickLoadingPort(["ZHUHAI,CHINA"], [], "CN", WORLD)).toMatchObject({ resolved: { code: "CNZUH" }, raw: "ZHUHAI,CHINA" });
      expect(pickLoadingPort(["ZHUHAI,CHINA"], [], "CN", WORLD).note).toBeUndefined();
      const addr = "NO.591,JIN HE ROAD, HONG QI TOWN, JINWAN DISTRICT,ZHUHAI CITY.GUANGDONG , CHINA";
      expect(pickLoadingPort([], [addr], "CN", WORLD)).toMatchObject({ resolved: { code: "CNZUH" }, note: expect.stringMatching(/ZHUHAI.*địa chỉ người xuất khẩu/) });
      expect(pickLoadingPort([], [addr], null, WORLD).resolved).toBeNull();
      expect(pickLoadingPort(["SOMEWHERE"], [addr], "CN", WORLD)).toMatchObject({ resolved: null, raw: "SOMEWHERE" });
    });
    it("mã sân bay IATA / mã trạm chuyển phát FedEx (IATA + 1 chữ) → mã nước + IATA; từ 3 chữ trong câu dài không bị nhầm", () => {
      // VNSGN / VNHAN chưa có trong A016 → không nhận (có trong danh mục là tự nhận, xem test bí danh ở trên).
      expect(resolvePort("SGNA", A016)).toBeNull();
      expect(resolvePort("HAN", A016)).toBeNull();
      expect(resolveWorldPort("ZUHA", "CN", WORLD)?.code).toBe("CNZUH");
      expect(resolveWorldPort("ZUH", null, WORLD)?.code).toBe("CNZUH");
      expect(resolvePort("VIET NAM", A016)).toBeNull();
      const withSgn = [...CATALOGS.ports, { code: "VNSGN", name: "SAN BAY TAN SON NHAT", parent: "VN" }];
      expect(pickDischargePort(["SGNA"], [], withSgn, { air: true })).toMatchObject({ resolved: { code: "VNSGN" } });
      expect(pickLoadingPort(["ZUHA"], [], "CN", WORLD)).toMatchObject({ resolved: { code: "CNZUH" }, raw: "ZUHA" });
    });
    it("cảng dỡ hàng air: tên thành phố là sân bay (HO CHI MINH → VNSGN khi danh mục có mã này), không nhắc chọn bến", () => {
      const withSgn = [{ code: "VNSGN", name: "SAN BAY TAN SON NHAT", parent: "VN" }];
      expect(pickDischargePort(["HO CHI MINH , VIET NAM"], [], withSgn, { air: true })).toEqual({ resolved: { code: "VNSGN", name: "SAN BAY TAN SON NHAT" }, raw: "HO CHI MINH , VIET NAM" });
      expect(pickDischargePort(["HO CHI MINH , VIET NAM"], [], withSgn).note).toMatch(/tên thành phố/);
    });
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
  it("cảng dỡ: tên trùng danh mục A016 trên Arrival Notice thắng tên thành phố trên B/L; không có danh mục → không đoán mã", () => {
    expect(pickDischargePort(["HO CHI MINH, VIETNAM", "CANG CAT LAI (HCM)"], [], PORTS_A016)).toMatchObject({ resolved: { code: "VNCLI", name: "CANG CAT LAI (HCM)" }, raw: "CANG CAT LAI (HCM)", fromCatalog: true });
    expect(pickDischargePort(["HO CHI MINH, VIETNAM", "CANG CAT LAI (HCM)"], []).resolved).toBeNull();
    expect(pickDischargePort(["CAT LAI"], [], CATALOGS.ports)).toMatchObject({ resolved: { code: "VNCLI", name: "CANG CAT LAI (HCM)" } });
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
