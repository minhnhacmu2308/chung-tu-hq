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
  it("đơn vị kiện → mã loại kiện UN/ECE Rec 21 (pallet PX, cuộn RO); không nhận ra → PK kèm guessed", () => {
    expect(resolvePackageUnit("PALLETS")?.code).toBe("PX");
    expect(resolvePackageUnit("PL")?.code).toBe("PX");
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
});
