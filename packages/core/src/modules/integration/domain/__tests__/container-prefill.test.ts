import { describe, expect, it } from "vitest";
import { prefillContainerRows } from "../container-prefill.js";

describe("prefillContainerRows", () => {
  it("chuẩn hóa số container OCR (chữ thường, khoảng trắng, gạch) trước khi điền", () => {
    const rows = prefillContainerRows([{ id: "d1", kind: "BILL_OF_LADING", billNo: "HBL1", containers: [{ no: "fbiu 580242-9", sealNo: "S1" }] }]);
    expect(rows).toEqual([{ billNo: "HBL1", containerNo: "FBIU5802429", sealNo: "S1", note: "", source: "OCR", sourceDocumentId: "d1" }]);
  });
  it("HBL + MBL cùng container → một dòng, seal khác rỗng đầu tiên, nguồn chứng từ đầu tiên", () => {
    const rows = prefillContainerRows([
      { id: "hbl", kind: "BILL_OF_LADING", billNo: "HBL1", page: 2, containers: [{ no: "FBIU5802429", sealNo: null }] },
      { id: "mbl", kind: "BILL_OF_LADING", billNo: "MBL1", containers: [{ no: "fbiu 5802429", sealNo: "SEAL9" }, { no: "CSQU3054383", sealNo: "" }] },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ containerNo: "FBIU5802429", sealNo: "SEAL9", billNo: "HBL1", sourceDocumentId: "hbl", sourcePage: 2 });
    expect(rows[1]).toMatchObject({ containerNo: "CSQU3054383", sealNo: "", billNo: "MBL1" });
  });
  it("thứ tự nguồn B/L → PL → AN, bỏ loại khác, bỏ số rỗng", () => {
    const rows = prefillContainerRows([
      { id: "an", kind: "ARRIVAL_NOTICE", billNo: "A", containers: [{ no: "AAAU0000001", sealNo: null }] },
      { id: "inv", kind: "INVOICE", billNo: null, containers: [{ no: "ZZZU0000009", sealNo: null }] },
      { id: "bl", kind: "BILL_OF_LADING", billNo: "B", containers: [{ no: null, sealNo: "x" }, { no: " ", sealNo: null }, { no: "BBBU0000002", sealNo: null }] },
    ]);
    expect(rows.map((r) => r.sourceDocumentId)).toEqual(["bl", "an"]);
  });
});
