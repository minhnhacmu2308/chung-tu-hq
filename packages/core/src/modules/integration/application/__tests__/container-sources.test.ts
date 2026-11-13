import { describe, expect, it } from "vitest";
import { prefillDocOf } from "../container-sources.js";

describe("prefillDocOf", () => {
  it("prefillDocOf đọc billNo/containers từ dữ liệu model, dữ liệu sai dạng → rỗng", () => {
    expect(prefillDocOf({ id: "d", kind: "BILL_OF_LADING" }, { billNo: "B1", containers: [{ no: "X", sealNo: null, size: "20GP" }] })).toEqual({ id: "d", kind: "BILL_OF_LADING", billNo: "B1", containers: [{ no: "X", sealNo: null }] });
    expect(prefillDocOf({ id: "d", kind: "BILL_OF_LADING" }, "bad").containers).toEqual([]);
  });
});
