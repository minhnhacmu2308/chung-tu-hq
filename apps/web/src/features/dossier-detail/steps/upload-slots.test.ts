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
