import { describe, expect, it } from "vitest";
import { resolveDischargePort, resolvePackageUnit, resolvePayment, resolvePort, transportModeCode } from "../catalog-resolve.js";

describe("catalog-resolve", () => {
  it("cảng: theo alias hoặc LOCODE có sẵn; không có → null", () => {
    expect(resolvePort("BUSAN, KOREA")).toEqual({ code: "KRPUS", name: "Busan" });
    expect(resolvePort("HAIPHONG, VIETNAM")?.code).toBe("VNHPH");
    expect(resolvePort("VNTVU – Cảng Tân Vũ")?.code).toBe("VNTVU");
    expect(resolvePort("PORT OF NOWHERE")).toBeNull();
    expect(resolvePort(null)).toBeNull();
  });
  it("POD nước ngoài (chuyển tải) → điểm đến cuối tại VN kèm ghi chú", () => {
    expect(resolveDischargePort("HAIPHONG", null)).toEqual({ resolved: { code: "VNHPH", name: "Cảng Hải Phòng" } });
    const r = resolveDischargePort("SINGAPORE", "TAN VU TERMINAL, HAIPHONG");
    expect(r.resolved?.code).toBe("VNTVU");
    expect(r.note).toMatch(/chuyển tải/);
    expect(resolveDischargePort("SINGAPORE", null)).toMatchObject({ resolved: { code: "SGSIN" }, note: expect.stringMatching(/không phải cảng Việt Nam/) });
  });
  it("phương thức thanh toán → TK_IVP; đơn vị kiện → mã; phương thức vận chuyển → 1/2/3/4", () => {
    expect(resolvePayment("T/T 30 days after B/L date")?.code).toBe("TTR");
    expect(resolvePayment("Irrevocable L/C at sight")?.code).toBe("LC");
    expect(resolvePayment("D/P")?.code).toBe("DP");
    expect(resolvePayment("by cheque")?.code).toBe("KC");
    expect(resolvePackageUnit("PALLETS")?.code).toBe("PL");
    expect(resolvePackageUnit("CTNS")?.code).toBe("CT");
    expect(resolvePackageUnit("xyz")?.code).toBe("PK");
    expect(transportModeCode("SEA", true).code).toBe("2");
    expect(transportModeCode("SEA", false).code).toBe("3");
    expect(transportModeCode("AIR", false).code).toBe("1");
    expect(transportModeCode("ROAD", false).code).toBe("4");
  });
});
