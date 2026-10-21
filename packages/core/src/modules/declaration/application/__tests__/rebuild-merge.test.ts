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

  it("ô bổ sung theo tình huống (1.40 TK_IV2): bỏ khi 1.39 sau khi gộp không còn là D; giữ khi người khai đã sửa 1.39 thành D", () => {
    const iv2: StoredField = { no: "1.40", label: "Số tiếp nhận hóa đơn điện tử", section: "VALUE", value: "100000012345", source: "USER" };
    const fresh: Record<string, StoredField> = { HD_PL: { no: "1.39", label: "Phân loại hình thức hóa đơn", section: "VALUE", value: "A – Hóa đơn thương mại", source: "INVOICE" } };
    expect(mergeUserEdits(fresh, { TK_IV2: iv2 }, [], "IDA")["TK_IV2"]).toBeUndefined();
    const userD: StoredField = { ...fresh["HD_PL"]!, value: "D", source: "USER" };
    expect(mergeUserEdits(fresh, { HD_PL: userD, TK_IV2: iv2 }, [], "IDA")["TK_IV2"]).toMatchObject({ value: "100000012345", source: "USER" });
    // Không truyền kind (dữ liệu cũ) → giữ như trước.
    expect(mergeUserEdits(fresh, { TK_IV2: iv2 }, [])["TK_IV2"]).toBeDefined();
  });

  it("ô bổ sung không theo tình huống (bảo lãnh, ủy thác, 1.58) giữ nguyên khi dựng lại", () => {
    const f = (no: string, value: string): StoredField => ({ no, label: no, section: "GENERAL", value, source: "USER" });
    const out = mergeUserEdits({}, { TK_SBC: f("1.59", "79202001"), TK_NMC: f("1.17", "0101234567"), TK_ENC: f("1.58", "C") }, [], "IDA");
    expect(Object.keys(out).sort()).toEqual(["TK_ENC", "TK_NMC", "TK_SBC"]);
  });
});
