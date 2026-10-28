import type { Shipment, ValueCharges } from "@kb/contracts";
import { EMPTY_VALUE_CHARGES } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { hansol, NK_SEA, ORG } from "../../test/shipments.js";
import { ruleByCode } from "../index.js";

const rule = ruleByCode("R-FREIGHT-TERM")!;
const ship = (incoterm: string | null, term: string | null): Shipment => {
  const s = hansol();
  s.invoice.incoterm.value = incoterm;
  s.transport.freightTerm = { value: term, sources: [], status: "SINGLE_SOURCE" };
  return s;
};
const run = (s: Shipment, charges?: ValueCharges) => rule.run(s, { org: ORG, dossier: NK_SEA, ...(charges ? { charges } : {}) });

describe("R-FREIGHT-TERM (BLOCKER)", () => {
  it("PASS: FCA + Collect (người mua trả cước), CIF + Prepaid (người bán trả)", () => {
    expect(run(ship("FCA BUSAN", "COLLECT")).result).toBe("PASS");
    const r = run(ship("CIF HAIPHONG", "PREPAID"));
    expect(r.result).toBe("PASS");
    expect(r.detail).toMatch(/CIF khớp vận đơn Freight Prepaid/);
  });

  it("FAIL: CIF mà vận đơn ghi Collect, chưa giải trình → chặn; có giải trình → cảnh báo kèm lý do", () => {
    const r = run(ship("CIF", "COLLECT"));
    expect(r.result).toBe("FAIL");
    expect(r.fields).toEqual(["/invoice/incoterm", "/transport/freightTerm"]);
    expect(r.detail).toMatch(/CIF: giá đã gồm cước.*Freight Collect/);
    const noted = run(ship("C AND F Haiphong", "COLLECT"), { ...EMPTY_VALUE_CHARGES, freightTermNote: { reason: "LOCAL_CHARGES", note: "THC + D/O" } });
    expect(noted.result).toBe("WARN");
    expect(noted.detail).toMatch(/C&F.*phí tại cảng đến.*THC \+ D\/O/);
  });

  it("WARN: FOB mà vận đơn ghi Prepaid – người bán trả hộ, vẫn phải cộng cước", () => {
    const r = run(ship("FOB", "PREPAID"));
    expect(r.result).toBe("WARN");
    expect(r.detail).toMatch(/vẫn phải khai cước/);
  });

  it("SKIPPED: thiếu điều kiện giao hàng, vận đơn không ghi người trả cước, hoặc lô hàng cũ chưa có trường này", () => {
    expect(run(ship(null, "COLLECT")).result).toBe("SKIPPED");
    expect(run(ship("CIF", null)).result).toBe("SKIPPED");
    const old = hansol();
    delete old.transport.freightTerm;
    expect(run(old).result).toBe("SKIPPED");
  });
});
