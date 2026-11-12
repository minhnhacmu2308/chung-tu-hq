import type { DocumentSources } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import type { DocKind, DossierDocument } from "@/mocks/types";
import { addableKinds, buildSlots, missingRequired, suggestedKinds } from "./upload-slots";

const doc = (id: string, kind: DocKind): DossierDocument => ({
  id, dossierId: "d1", kind, fileName: `${id}.pdf`, sizeBytes: 1000, pages: 1, status: "DONE", uploadedAt: "2026-10-14T00:00:00Z",
});
const seaFob = suggestedKinds({ transportMode: "SEA_CONTAINER", incoterm: "FOB", direction: "NK" });

describe("suggestedKinds – hồ sơ không khai điều kiện giao hàng", () => {
  it("nhập khẩu: hóa đơn cước là ô tùy lô (thiếu cước thì luật đối chiếu ở bước OCR báo)", () => {
    const s = suggestedKinds({ transportMode: "SEA_CONTAINER", incoterm: "", direction: "NK" });
    expect(s.find((k) => k.kind === "FREIGHT_INVOICE")).toMatchObject({ optional: true });
  });
  it("xuất khẩu: không gợi ý hóa đơn cước", () => {
    expect(suggestedKinds({ transportMode: "SEA_CONTAINER", incoterm: "", direction: "XK" }).some((k) => k.kind === "FREIGHT_INVOICE")).toBe(false);
  });
});

describe("buildSlots", () => {
  it("hồ sơ chưa có file: hiện đủ ô gợi ý theo thứ tự, chưa có ô Khác", () => {
    const slots = buildSlots(seaFob, []);
    expect(slots.map((s) => [s.kind, s.need])).toEqual([
      ["INVOICE", "required"],
      ["PACKING_LIST", "optional"],
      ["BILL_OF_LADING", "required"],
      ["FREIGHT_INVOICE", "required"],
      ["CERT_OF_ORIGIN", "optional"],
    ]);
    expect(missingRequired(slots).map((s) => s.kind)).toEqual(["INVOICE", "BILL_OF_LADING", "FREIGHT_INVOICE"]);
  });

  it("xếp file vào đúng ô; loại ngoài gợi ý thành ô thêm; file chưa nhận ra loại vào ô Khác ở cuối", () => {
    const slots = buildSlots(seaFob, [doc("a", "INVOICE"), doc("b", "INVOICE"), doc("c", "SALES_CONTRACT"), doc("d", "OTHER")]);
    expect(slots.find((s) => s.kind === "INVOICE")?.docs.map((d) => d.id)).toEqual(["a", "b"]);
    expect(slots.at(-2)).toMatchObject({ kind: "SALES_CONTRACT", need: "extra" });
    expect(slots.at(-1)).toMatchObject({ kind: "OTHER", need: "other" });
    expect(slots.at(-1)?.docs.map((d) => d.id)).toEqual(["d"]);
  });

  it("đã upload vận đơn hàng không cho hồ sơ đường biển: ô vận đơn đổi theo, không còn báo thiếu", () => {
    const slots = buildSlots(seaFob, [doc("a", "AIR_WAYBILL")]);
    expect(slots[2]).toMatchObject({ kind: "AIR_WAYBILL", need: "required" });
    expect(slots.filter((s) => s.kind === "AIR_WAYBILL")).toHaveLength(1);
    expect(missingRequired(slots).map((s) => s.kind)).not.toContain("BILL_OF_LADING");
  });

  it("người dùng thêm ô loại khác: hiện ô trống, không còn trong danh sách thêm được", () => {
    const slots = buildSlots(seaFob, [], ["ARRIVAL_NOTICE"]);
    expect(slots.at(-1)).toMatchObject({ kind: "ARRIVAL_NOTICE", need: "extra", docs: [] });
    expect(addableKinds(slots)).not.toContain("ARRIVAL_NOTICE");
    expect(addableKinds(slots)).toContain("OTHER");
  });
});

describe("suggestedKinds – nhãn theo ngôn ngữ", () => {
  it("mặc định tiếng Việt; locale en/zh trả lý do đã dịch, thứ tự ô không đổi", () => {
    const d = { transportMode: "SEA_CONTAINER", incoterm: "FOB", direction: "NK" } as const;
    expect(suggestedKinds(d)[0]?.reason).toBe("Trị giá, người bán/mua, dòng hàng");
    expect(suggestedKinds(d, "en").find((k) => k.kind === "FREIGHT_INVOICE")?.reason).toContain("Incoterm FOB");
    expect(suggestedKinds(d, "zh")[0]?.reason).toBe("金额、买卖方、货物行");
    expect(suggestedKinds(d, "zh").map((k) => k.kind)).toEqual(suggestedKinds(d).map((k) => k.kind));
  });
});

describe("chứng từ có sau khi khai (ADR 0013)", () => {
  const xk = suggestedKinds({ transportMode: "SEA_CONTAINER", incoterm: "FOB", direction: "XK" });
  const plan = (sources: DocumentSources) => ({ direction: "XK" as const, sources });

  it("B/L đánh dấu sau khai, chưa có file → ô 'pending', không tính là thiếu", () => {
    const slots = buildSlots(xk, [doc("a", "INVOICE")], [], plan({ BILL_OF_LADING: "PENDING_AFTER_DECLARATION" }));
    const bl = slots.find((s) => s.kind === "BILL_OF_LADING")!;
    expect(bl).toMatchObject({ need: "pending", canPend: true });
    expect(missingRequired(slots).map((s) => s.kind)).not.toContain("BILL_OF_LADING");
  });
  it("đã tải B/L lên thì ô trở lại bình thường dù còn đánh dấu", () => {
    const slots = buildSlots(xk, [doc("a", "BILL_OF_LADING")], [], plan({ BILL_OF_LADING: "PENDING_AFTER_DECLARATION" }));
    expect(slots.find((s) => s.kind === "BILL_OF_LADING")!.need).toBe("required");
  });
  it("C/O đánh dấu sau khai hiện ô riêng dù không gợi ý", () => {
    const slots = buildSlots(xk, [], [], plan({ CERT_OF_ORIGIN: "PENDING_AFTER_DECLARATION" }));
    expect(slots.find((s) => s.kind === "CERT_OF_ORIGIN")).toMatchObject({ need: "pending", canPend: true });
  });
  it("hồ sơ NK: không ô nào chuyển được sang sau khai", () => {
    const slots = buildSlots(seaFob, [], [], { direction: "NK", sources: {} });
    expect(slots.every((s) => !s.canPend)).toBe(true);
  });
  it("XK: chỉ vận đơn / AWB / C/O chuyển được, invoice thì không", () => {
    const slots = buildSlots(xk, [], ["CERT_OF_ORIGIN"], plan({}));
    expect(slots.filter((s) => s.canPend).map((s) => s.kind)).toEqual(["BILL_OF_LADING", "CERT_OF_ORIGIN"]);
  });
});

describe("chứng từ hệ thống phát hành – khai trước (ADR 0013 GĐ2b)", () => {
  const xk = suggestedKinds({ transportMode: "SEA_CONTAINER", incoterm: "FOB", direction: "XK" });
  const plan = (sources: DocumentSources) => ({ direction: "XK" as const, sources });

  it("Invoice + PL nguồn ISSUED, chưa có file → ô 'issued', không tính là thiếu; chỉ Invoice/PL hồ sơ XK chuyển được", () => {
    const slots = buildSlots(xk, [], [], plan({ INVOICE: "ISSUED", PACKING_LIST: "ISSUED" }));
    expect(slots.find((s) => s.kind === "INVOICE")).toMatchObject({ need: "issued", canIssue: true });
    expect(slots.find((s) => s.kind === "PACKING_LIST")).toMatchObject({ need: "issued", canIssue: true });
    expect(missingRequired(slots).map((s) => s.kind)).not.toContain("INVOICE");
    expect(slots.filter((s) => s.canIssue).map((s) => s.kind)).toEqual(["INVOICE", "PACKING_LIST"]);
    expect(buildSlots(seaFob, [], [], { direction: "NK", sources: {} }).every((s) => !s.canIssue)).toBe(true);
  });
  it("vẫn tải invoice lên dù đặt ISSUED → ô trở lại bình thường", () => {
    const slots = buildSlots(xk, [doc("a", "INVOICE")], [], plan({ INVOICE: "ISSUED" }));
    expect(slots.find((s) => s.kind === "INVOICE")!.need).toBe("required");
  });
});
