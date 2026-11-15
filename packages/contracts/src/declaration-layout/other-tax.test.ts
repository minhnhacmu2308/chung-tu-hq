import { describe, expect, it } from "vitest";
import { compactOtherTaxes, mergeOtherTaxes, normalizationEdits, normalizeOtherTaxes, otherTaxGroupOf, otherTaxIssues, otherTaxKeys } from "./other-tax.js";

describe("other-tax", () => {
  it("group_of_trims_and_uppercases", () => {
    expect(otherTaxGroupOf(" vb901 ")).toBe(5);
    expect(otherTaxGroupOf("V")).toBe(5);
    expect(otherTaxGroupOf("G0123")).toBe(1);
    expect(otherTaxGroupOf("B001")).toBe(1);
    expect(otherTaxGroupOf("C")).toBe(1);
    expect(otherTaxGroupOf("P")).toBe(2);
    expect(otherTaxGroupOf("T")).toBe(3);
    expect(otherTaxGroupOf("MB010")).toBe(4);
    expect(otherTaxGroupOf("X12")).toBeNull();
    expect(otherTaxGroupOf("")).toBeNull();
    expect(otherTaxGroupOf(null)).toBeNull();
  });

  it("keys", () => {
    expect(otherTaxKeys(3)).toEqual({ tx: "HAG_TX3", tr: "HAG_TR3", tg: "HAG_TG3" });
  });

  it("merge_user_wins_over_auto", () => {
    expect(mergeOtherTaxes({ HAG_TX5: "VB901" }, { HAG_TX1: "VB205" })).toEqual({ HAG_TX1: "VB205" });
    expect(mergeOtherTaxes({ HAG_TX5: "V", HAG_TR5: "VK010" }, { HAG_TX3: "TB020" })).toEqual({ HAG_TX5: "V", HAG_TR5: "VK010", HAG_TX3: "TB020" });
    // Người khai xóa trống mã GTGT tự điền → bỏ cả bộ ba tự điền (TR5 VK… không còn sót lại).
    expect(mergeOtherTaxes({ HAG_TX5: "V", HAG_TR5: "VK010", HAG_TG5: "1" }, { HAG_TX5: "" })).toEqual({ HAG_TX5: "" });
    expect(mergeOtherTaxes({ HAG_TX5: "V", HAG_TR5: "VK010" }, { HAG_TX5: " ", HAG_TR5: "VK020" })).toEqual({ HAG_TX5: " ", HAG_TR5: "VK020" });
  });

  it("normalize_moves_legacy_slot", () => {
    expect(normalizeOtherTaxes({ HAG_TX1: " vb901 ", HAG_TR1: "VK110", HAG_TG1: "5", HAG_CMD: "1234" })).toEqual({
      HAG_TX5: "VB901", HAG_TR5: "VK110", HAG_TG5: "5", HAG_CMD: "1234",
    });
  });

  it("normalize_conflict_keeps_both", () => {
    const out = normalizeOtherTaxes({ HAG_TX5: "VB901", HAG_TX2: "VB205" });
    expect(out.HAG_TX5).toBe("VB901");
    expect(out.HAG_TX2).toBe("VB205");
  });

  it("compact_variants", () => {
    const a = compactOtherTaxes({ HAG_TX5: "VB901" });
    expect(a.values).toEqual({ HAG_TX1: "VB901" });
    expect(a.slotToGroup).toEqual([5]);
    const b = compactOtherTaxes({ HAG_TX3: "TB020", HAG_TR3: "TK060", HAG_TX5: "V", HAG_TR5: "VK110" });
    expect(b.values).toEqual({ HAG_TX1: "TB020", HAG_TR1: "TK060", HAG_TX2: "V", HAG_TR2: "VK110" });
    expect(b.slotToGroup).toEqual([3, 5]);
    const full = { HAG_TX1: "B", HAG_TX2: "P", HAG_TX3: "T", HAG_TX4: "M", HAG_TX5: "V" };
    expect(compactOtherTaxes(full)).toEqual({ values: full, slotToGroup: [1, 2, 3, 4, 5] });
    expect(compactOtherTaxes({})).toEqual({ values: {}, slotToGroup: [] });
  });

  it("compact_keeps_orphan_exempt", () => {
    const r = compactOtherTaxes({ HAG_TR2: "PK" });
    expect(r.values).toEqual({ HAG_TR1: "PK" });
    expect(r.slotToGroup).toEqual([2]);
  });

  it("normalization_edits", () => {
    expect(normalizationEdits({ HAG_TX1: "VB901" })).toEqual([{ key: "HAG_TX1", value: "" }, { key: "HAG_TX5", value: "VB901" }]);
    expect(normalizationEdits({ HAG_TX5: "VB901" })).toEqual([]);
  });

  it("merge_own_tx_drops_whole_auto_triple_of_slot", () => {
    const r = mergeOtherTaxes({ HAG_TX1: "B001", HAG_TR1: "BK" }, { HAG_TX1: "VB901" });
    expect(r.HAG_TX1).toBe("VB901");
    expect(r.HAG_TR1).toBeUndefined();
  });

  it("normalize_swaps_misplaced", () => {
    expect(normalizeOtherTaxes({ HAG_TX1: "P", HAG_TX2: "B001" })).toEqual({ HAG_TX2: "P", HAG_TX1: "B001" });
  });

  it("compact_preserves_non_slot_keys", () => {
    expect(compactOtherTaxes({ HAG_CMD: "1234", HAG_TX5: "V" }).values).toEqual({ HAG_CMD: "1234", HAG_TX1: "V" });
  });

  it("issues_unknown_prefix", () => {
    expect(otherTaxIssues({ HAG_TX2: "X12" })).toEqual([{ group: 2, key: "HAG_TX2", reason: "OTHER_TAX_WRONG_GROUP" }]);
  });
  it("issues_duplicate_group", () => {
    expect(otherTaxIssues({ HAG_TX5: "VB901", HAG_TX2: "VB205" })).toEqual([{ group: 2, key: "HAG_TX2", reason: "OTHER_TAX_DUPLICATE_GROUP" }]);
  });
  it("issues_misplaced_without_other_code_is_wrong_group", () => {
    expect(otherTaxIssues({ HAG_TX3: "BB01" })).toEqual([{ group: 3, key: "HAG_TX3", reason: "OTHER_TAX_WRONG_GROUP" }]);
  });
  it("issues_exempt_mismatch", () => {
    expect(otherTaxIssues({ HAG_TX5: "VB901", HAG_TR5: "TK060" })).toEqual([{ group: 5, key: "HAG_TR5", reason: "OTHER_TAX_EXEMPT_MISMATCH" }]);
  });
  it("issues_exempt_without_code", () => {
    expect(otherTaxIssues({ HAG_TR4: "MK010" })).toEqual([{ group: 4, key: "HAG_TR4", reason: "OTHER_TAX_EXEMPT_WITHOUT_CODE" }]);
  });
  it("issues_tg_only", () => {
    expect(otherTaxIssues({ HAG_TG3: "5" })).toEqual([{ group: 3, key: "HAG_TG3", reason: "OTHER_TAX_EXEMPT_WITHOUT_CODE" }]);
  });
  it("issues_valid_row", () => {
    expect(otherTaxIssues({ HAG_TX1: "G0123", HAG_TR1: "GK" })).toEqual([]);
  });
});
