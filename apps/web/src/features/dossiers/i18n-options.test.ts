import { loadCodeList } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { buildFlow } from "@/features/dossier-detail/workflow-flow";
import type { Dossier } from "@/mocks/types";
import { officeOptions, suggestedDocuments, typeCodesIn, typeGroupOf, typeGroupOptions, TYPE_GROUPS } from "./create-dossier-options";
import { dossierStatusDisplay, transportLabels, transportOptions, TRANSPORT_LABELS } from "./dossier-display";

describe("i18n – danh mục tạo hồ sơ / hiển thị hồ sơ", () => {
  it("bản vi giữ nguyên chữ cũ (mặc định)", () => {
    expect(TYPE_GROUPS.map((g) => g.label)).toEqual(["Kinh doanh", "Sản xuất xuất khẩu", "Gia công", "Chế xuất"]);
    expect(TRANSPORT_LABELS.AIR).toBe("Đường hàng không");
    expect(transportOptions()[0]!.label).toBe("1 – Đường hàng không");
    expect(dossierStatusDisplay().CLEARED.label).toBe("Đã thông quan");
  });

  it("en / zh: mã giữ nguyên, nhãn dịch", () => {
    expect(typeGroupOptions("zh")[2]!.label).toBe("加工");
    expect(transportLabels("zh").SEA_CONTAINER).toBe("海运（集装箱）");
    const docs = suggestedDocuments("NK", "AIR", "en");
    expect(docs.map((d) => d.name)).toContain("International freight invoice");
    expect(docs.find((d) => d.kind === "INVOICE")!.note).toBe("Value, delivery terms, seller/buyer");
  });

  it("mã loại hình lấy từ danh mục VNACCS TYPE_CODE (QĐ 1357): đủ mã theo chiều, đúng nhóm, tên pháp lý", async () => {
    const list = await loadCodeList("TYPE_CODE");
    const kd = typeCodesIn(list, "NK", "KD");
    expect(kd[0]).toEqual({ value: "A11", label: "A11 – Nhập kinh doanh tiêu dùng" });
    // Mã trước đây thiếu ở danh sách viết cứng.
    expect(kd.map((o) => o.value)).toEqual(expect.arrayContaining(["A42", "A43", "A44", "C11", "C21", "G14", "G51", "H11"]));
    expect(typeCodesIn(list, "NK", "CX").map((o) => o.value)).toEqual(["E11", "E13", "E15"]);
    expect(typeCodesIn(list, "NK", "GC").map((o) => o.value)).toEqual(["E21", "E23", "E41"]);
    expect(typeCodesIn(list, "XK", "GC").map((o) => o.value)).toEqual(["E52", "E54", "E82"]);
    expect(typeCodesIn(list, "XK", "SXXK").map((o) => o.value)).toEqual(["E62"]);
    // Mọi mã của danh mục đều thuộc đúng một nhóm của chiều mình – không mã nào bị rơi.
    for (const dir of ["NK", "XK"] as const) {
      const all = TYPE_GROUPS.flatMap((g) => typeCodesIn(list, dir, g.value).map((o) => o.value));
      expect(all.sort()).toEqual(list.filter((e) => e.parent === dir && !e.inactive).map((e) => e.code).sort());
    }
    expect(typeGroupOf("E42")).toBe("CX");
    // Chi cục theo A038 (mã sau sắp xếp 2025), nhãn "mã – tên" gửi backend.
    const offices = officeOptions(await loadCodeList("A038"));
    expect(offices.find((o) => o.value === "03CE")?.label).toMatch(/^03CE – /);
    expect(offices.some((o) => o.value === "02B1")).toBe(false);
    expect(typeGroupOf(null)).toBe("KD");
  });

  it("cây quy trình theo ngôn ngữ", () => {
    const d = { step: "ocr", status: "PROCESSING", suspectFields: 2, channel: null, direction: "NK", typeCode: "A11", partner: "X" } as unknown as Dossier;
    const zh = buildFlow(d, "zh");
    expect(zh.nodes.find((n) => n.id === "fix")!.description).toBe("2 个存疑字段");
    expect(zh.nodes.find((n) => n.id === "submit")!.description).toBe("IDA → IDC → HYS 经 Customs Hub");
    expect(buildFlow(d).nodes.find((n) => n.id === "end")!.title).toBe("Thông quan");
  });
});
