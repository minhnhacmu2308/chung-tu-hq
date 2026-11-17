import { describe, expect, it } from "vitest";
import { mergeExtractions, type FileExtraction } from "../merge.js";
import { projectFields } from "../project-fields.js";

type Cont = { no: string; sealNo: string | null; size: string | null };
const inv = (lotContainers: Cont[]): FileExtraction => ({ documentId: "d_inv", kind: "INVOICE", pages: 1, data: { invoiceNo: "INV-1", items: [], uncertainties: [], lot: {}, lotContainers } });
const bl = (containers: Cont[]): FileExtraction => ({ documentId: "d_bl", kind: "BILL_OF_LADING", pages: 1, data: { billNo: "B1", containers, uncertainties: [] } });
const project = (files: FileExtraction[]) => projectFields(mergeExtractions(files, { version: 1 }), files).filter((f) => f.key === "containers");

describe("projectFields – ô container theo từng chứng từ", () => {
  it("container trên invoice → ô containers của invoice, nhóm Vận tải, một nguồn", () => {
    expect(project([inv([{ no: "fbiu 5659719", sealNo: "34337288", size: null }])])).toEqual([
      expect.objectContaining({ key: "containers", documentId: "d_inv", value: "FBIU5659719 / 34337288", group: "TRANSPORT", status: "SINGLE_SOURCE", shipmentPath: "/transport/containers" }),
    ]);
  });

  it("không seal → chỉ số; nhiều container nối bằng '; '", () => {
    expect(project([inv([{ no: "A1", sealNo: null, size: null }, { no: "B2", sealNo: "S2", size: "40HC" }])])[0]!.value).toBe("A1; B2 / S2");
  });

  it("chứng từ không có container → không có ô", () => {
    expect(project([inv([])])).toEqual([]);
  });

  it("B/L và invoice cùng số, cùng seal → CROSS_CHECKED trên cả hai tab", () => {
    const f = project([bl([{ no: "FBIU5659719", sealNo: "34337288", size: null }]), inv([{ no: "FBIU5659719", sealNo: "34337288", size: null }])]);
    expect(f.map((x) => [x.documentId, x.status])).toEqual([["d_bl", "CROSS_CHECKED"], ["d_inv", "CROSS_CHECKED"]]);
  });

  it("cùng số container, seal khác → CONFLICT kèm ghi chú", () => {
    const f = project([bl([{ no: "FBIU5659719", sealNo: "111", size: null }]), inv([{ no: "FBIU5659719", sealNo: "222", size: null }])]);
    expect(f.map((x) => x.status)).toEqual(["CONFLICT", "CONFLICT"]);
    expect(f[0]!.note).toBe("FBIU5659719: B/L ghi seal 111; Invoice ghi seal 222");
    expect(f.map((x) => x.value)).toEqual(["FBIU5659719 / 111", "FBIU5659719 / 222"]);
  });

  it("một bên không ghi seal → không coi là lệch", () => {
    const f = project([bl([{ no: "FBIU5659719", sealNo: "111", size: null }]), inv([{ no: "FBIU5659719", sealNo: null, size: null }])]);
    expect(f.map((x) => x.status)).toEqual(["CROSS_CHECKED", "CROSS_CHECKED"]);
  });

  it("B/L ghi cùng số ở containers và lotContainers (dữ liệu cũ/lạ) → một container, không tự lệch", () => {
    const b: FileExtraction = { documentId: "d_bl", kind: "BILL_OF_LADING", pages: 1, data: { billNo: "B1", containers: [{ no: "FBIU5659719", sealNo: "111", size: null }], lotContainers: [{ no: "fbiu5659719", sealNo: "222", size: null }], uncertainties: [] } };
    expect(project([b])).toEqual([expect.objectContaining({ value: "FBIU5659719 / 111", status: "SINGLE_SOURCE" })]);
    expect(project([b])[0]!.note).toBeUndefined();
  });

  it("không truyền danh sách chứng từ → không có ô container (gọi cũ)", () => {
    const files = [inv([{ no: "A1", sealNo: null, size: null }])];
    expect(projectFields(mergeExtractions(files, { version: 1 })).some((f) => f.key === "containers")).toBe(false);
  });
});
