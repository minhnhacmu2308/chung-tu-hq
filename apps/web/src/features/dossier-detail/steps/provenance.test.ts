import { describe, expect, it } from "vitest";
import { provenanceLabel } from "./provenance";

describe("provenanceLabel", () => {
  it("mặc định hệ thống → không hiện; mặc định khai báo / cố định / nguồn doanh nghiệp chọn → câu giải thích", () => {
    expect(provenanceLabel(undefined, "vi")).toBeNull();
    expect(provenanceLabel({ rule: "KHO", via: "default" }, "vi")).toBeNull();
    expect(provenanceLabel({ rule: "KHO", via: "profile" }, "vi")).toBe("Theo Mặc định khai báo của doanh nghiệp");
    expect(provenanceLabel({ rule: "KHAI_TG", via: "fixed" }, "vi")).toBe("Giá trị cố định doanh nghiệp đặt");
    expect(provenanceLabel({ rule: "KHO", via: "source", sourceId: "an.warehouse" }, "vi")).toBe("Nguồn doanh nghiệp chọn: Kho / CY trên Arrival Notice");
    expect(provenanceLabel({ rule: "X", via: "source", sourceId: "la" }, "vi")).toBe("Nguồn doanh nghiệp chọn: la");
  });
});
