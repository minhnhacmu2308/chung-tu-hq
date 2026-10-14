import { CATALOG_EDA, CATALOG_IDA } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { EDA_MAPPINGS } from "../mapping/eda.js";
import { IDA_MAPPINGS } from "../mapping/ida.js";

const byNo = (list: { no: string; label: string }[]) => new Map(list.map((d) => [d.no, d.label]));

describe("mapping ↔ catalog Phụ lục II", () => {
  it("mọi chỉ tiêu ánh xạ IDA/EDA có trong catalog; nhãn then chốt khớp", () => {
    const ida = byNo(CATALOG_IDA);
    const eda = byNo(CATALOG_EDA);
    for (const m of IDA_MAPPINGS) if (m.no) expect(ida.has(m.no), `IDA ${m.code} → ${m.no}`).toBe(true);
    for (const m of EDA_MAPPINGS) if (m.no) expect(eda.has(m.no), `EDA ${m.code} → ${m.no}`).toBe(true);
    const idaOf = (code: string) => ida.get(IDA_MAPPINGS.find((m) => m.code === code)!.no!)!.toLowerCase();
    expect(idaOf("MA_LH")).toContain("loại hình");
    expect(idaOf("SO_VD")).toContain("vận đơn");
    expect(idaOf("CANG_DO")).toContain("dỡ hàng");
    expect(idaOf("CANG_XEP")).toContain("xếp hàng");
    expect(idaOf("KHO")).toContain("lưu kho");
    expect(idaOf("PHI_VC")).toContain("vận chuyển");
    expect(idaOf("NNK_MST")).toMatch(/nhập khẩu/);
    expect(idaOf("VBPQ")).toContain("văn bản pháp quy");
    const edaOf = (code: string) => eda.get(EDA_MAPPINGS.find((m) => m.code === code)!.no!)!.toLowerCase();
    expect(edaOf("NXK_MST")).toMatch(/xuất khẩu/);
    expect(edaOf("NNK_TEN")).toMatch(/nhập khẩu/);
    expect(edaOf("CANG_XEP")).toContain("xếp hàng");
    expect(edaOf("SO_QLNB")).toMatch(/quản lý.*nội bộ/);
    // Không trùng code trong một mẫu.
    expect(new Set(IDA_MAPPINGS.map((m) => m.code)).size).toBe(IDA_MAPPINGS.length);
    expect(new Set(EDA_MAPPINGS.map((m) => m.code)).size).toBe(EDA_MAPPINGS.length);
  });
});
