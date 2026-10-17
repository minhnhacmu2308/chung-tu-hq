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

  it("chỉ tiêu theo tình huống không còn áp dụng (đổi loại hình) → bỏ giá trị đã sửa; còn áp dụng → giữ cả lý do hiện", () => {
    const old: Record<string, StoredField> = { HAN_TX: { no: "1.10", label: "Thời hạn tái xuất", section: "GENERAL", value: "2027-01-31", source: "USER" } };
    expect(mergeUserEdits({}, old, ["HAN_TX"])["HAN_TX"]).toBeUndefined();
    const fresh: Record<string, StoredField> = { HAN_TX: { no: "1.10", label: "Thời hạn tái xuất", section: "GENERAL", value: "", source: "DOSSIER", condition: "Loại hình tạm nhập" } };
    expect(mergeUserEdits(fresh, old, [])["HAN_TX"]).toMatchObject({ value: "2027-01-31", source: "USER", condition: "Loại hình tạm nhập" });
  });
});
