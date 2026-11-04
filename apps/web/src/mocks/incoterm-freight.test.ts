import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_VALUE_CHARGES } from "@kb/contracts";
import { getDb, resetDb } from "@/mocks/db";
import { saveValueCharges } from "@/mocks/api/value-charges";
import { incotermFreightCheck, syncIncotermFreightCheck } from "./incoterm-freight";

const base = { direction: "XK" as const, transportMode: "SEA_CONTAINER" as const, kinds: [], manual: null };

describe("luật cước theo điều kiện giao hàng (mock, giống backend)", () => {
  beforeEach(() => resetDb());

  it("xuất khẩu: FOB, FCA, C&I không đòi cước; CIF, DAP, DAF thiếu cước → FAIL R-EXPORT-FREIGHT-DEDUCT; có lý do → WARN", () => {
    for (const incoterm of ["FOB", "FCA", "C&I"]) expect(incotermFreightCheck({ ...base, incoterm })).toMatchObject({ ruleCode: "R-EXPORT-FREIGHT-DEDUCT", result: "PASS" });
    for (const incoterm of ["CIF", "DAP", "DAF"]) expect(incotermFreightCheck({ ...base, incoterm })).toMatchObject({ result: "FAIL", severity: "BLOCKER" });
    expect(incotermFreightCheck({ ...base, incoterm: "CIF", manual: { amount: null, currency: null, reason: "INVOICE_LATER", note: "" } })?.result).toBe("WARN");
    expect(incotermFreightCheck({ ...base, incoterm: "CIF", kinds: ["FREIGHT_INVOICE"] })?.result).toBe("PASS");
  });

  it("xuất khẩu phương thức vận chuyển 9 (giao tại chỗ): DAP không đòi cước", () => {
    expect(incotermFreightCheck({ ...base, incoterm: "DAP", transportMode: "OTHER" })).toMatchObject({ result: "PASS", detail: expect.stringMatching(/phương thức vận chuyển 9/) });
  });

  it("nhập khẩu: FOB thiếu cước → FAIL R-INCOTERM-FREIGHT; CIF → PASS", () => {
    expect(incotermFreightCheck({ ...base, direction: "NK", incoterm: "FOB" })).toMatchObject({ ruleCode: "R-INCOTERM-FREIGHT", result: "FAIL" });
    expect(incotermFreightCheck({ ...base, direction: "NK", incoterm: "CIF" })?.result).toBe("PASS");
  });

  it("hồ sơ xuất FOB dos_025: không còn lỗi chặn vì thiếu cước; đổi sang CIF → chặn; lưu số cước → hết chặn", async () => {
    const db = getDb();
    const freightChecks = () => db.checks.filter((c) => c.dossierId === "dos_025" && /FREIGHT-(DEDUCT|INCOTERM)|INCOTERM-FREIGHT/.test(c.ruleCode));
    expect(freightChecks()).toEqual([expect.objectContaining({ ruleCode: "R-EXPORT-FREIGHT-DEDUCT", result: "PASS" })]);
    db.dossiers.find((d) => d.id === "dos_025")!.incoterm = "CIF";
    syncIncotermFreightCheck(db, "dos_025");
    expect(freightChecks()[0]?.result).toBe("FAIL");
    await saveValueCharges("dos_025", { ...EMPTY_VALUE_CHARGES, freight: { amount: "420", currency: "USD", reason: "CONTRACT", note: "" } });
    expect(getDb().checks.filter((c) => c.dossierId === "dos_025" && c.ruleCode === "R-EXPORT-FREIGHT-DEDUCT")[0]?.result).toBe("PASS");
  });
});
