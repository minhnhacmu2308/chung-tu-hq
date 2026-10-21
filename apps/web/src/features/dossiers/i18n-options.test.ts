import { describe, expect, it } from "vitest";
import { buildFlow } from "@/features/dossier-detail/workflow-flow";
import type { Dossier } from "@/mocks/types";
import { suggestedDocuments, typeCodesIn, typeGroupOptions, TYPE_GROUPS } from "./create-dossier-options";
import { dossierStatusDisplay, transportLabels, transportOptions, TRANSPORT_LABELS } from "./dossier-display";

describe("i18n – danh mục tạo hồ sơ / hiển thị hồ sơ", () => {
  it("bản vi giữ nguyên chữ cũ (mặc định)", () => {
    expect(typeCodesIn("NK", "KD")[0]).toEqual({ value: "A11", label: "A11 – Nhập kinh doanh tiêu dùng", description: "Hàng hóa nhập khẩu kinh doanh tại chi cục cửa khẩu" });
    expect(TYPE_GROUPS.map((g) => g.label)).toEqual(["Kinh doanh", "Sản xuất xuất khẩu", "Gia công", "Chế xuất"]);
    expect(TRANSPORT_LABELS.AIR).toBe("Đường hàng không");
    expect(transportOptions()[0]!.label).toBe("1 – Đường hàng không");
    expect(dossierStatusDisplay().CLEARED.label).toBe("Đã thông quan");
  });

  it("en / zh: mã giữ nguyên, nhãn dịch", () => {
    expect(typeCodesIn("XK", "KD", "en")[0]!.label).toBe("B11 – Export trading");
    expect(typeGroupOptions("zh")[2]!.label).toBe("加工");
    expect(transportLabels("zh").SEA_CONTAINER).toBe("海运（集装箱）");
    const docs = suggestedDocuments("NK", "AIR", "en");
    expect(docs.map((d) => d.name)).toContain("International freight invoice");
    expect(docs.find((d) => d.kind === "INVOICE")!.note).toBe("Value, delivery terms, seller/buyer");
  });

  it("cây quy trình theo ngôn ngữ", () => {
    const d = { step: "ocr", status: "PROCESSING", suspectFields: 2, channel: null, direction: "NK", typeCode: "A11", partner: "X" } as unknown as Dossier;
    const zh = buildFlow(d, "zh");
    expect(zh.nodes.find((n) => n.id === "fix")!.description).toBe("2 个存疑字段");
    expect(zh.nodes.find((n) => n.id === "submit")!.description).toBe("IDA → IDC → HYS 经 Customs Hub");
    expect(buildFlow(d).nodes.find((n) => n.id === "end")!.title).toBe("Thông quan");
  });
});
