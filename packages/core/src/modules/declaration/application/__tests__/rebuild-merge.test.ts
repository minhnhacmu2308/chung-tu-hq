import { describe, expect, it } from "vitest";
import { mergeUserEdits } from "../_rebuild.js";
import type { StoredField } from "../ports.js";

describe("mergeUserEdits", () => {
  it("chỉ tiêu người dùng đã sửa: giữ giá trị, bỏ nguồn gốc/ghi chú của lần dựng mới (không hiện 'giá trị cố định doanh nghiệp' cho ô đã sửa tay)", () => {
    const fresh: Record<string, StoredField> = {
      KHO: { no: "1.29", label: "Mã địa điểm lưu kho", section: "GENERAL", value: "02CIS01", source: "ACCOUNT", note: "Giá trị cố định theo cấu hình doanh nghiệp", provenance: { rule: "KHO", via: "fixed" } },
    };
    const old: Record<string, StoredField> = { KHO: { no: "1.29", label: "Mã địa điểm lưu kho", section: "GENERAL", value: "03CCS01", source: "USER" } };
    const out = mergeUserEdits(fresh, old)["KHO"]!;
    expect(out).toMatchObject({ value: "03CCS01", source: "USER" });
    expect(out.provenance).toBeUndefined();
    expect(out.note).toBeUndefined();
  });
});
