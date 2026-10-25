import { describe, expect, it } from "vitest";
import { awaitingContent, dossierCustomsSummary, lockedSheetCount, recallExempt, sheetApproved, sheetCountChanged, sheetOrderWait } from "./customs-summary.js";

describe("dossierCustomsSummary – trạng thái hồ sơ gộp từ các tờ khai nhánh", () => {
  it("3 nhánh [CLEARED, REJECTED, DECLARED] → 1/3 thông quan, tờ 2 bị từ chối, chưa xong", () => {
    expect(dossierCustomsSummary([
      { stage: "CLEARED", state: "CLEARED" },
      { stage: "REJECTED", state: "REJECTED" },
      { stage: "DECLARED", state: "DECLARED" },
    ])).toEqual({ of: 3, cleared: 1, problems: [{ no: 2, kind: "REJECTED" }], allCleared: false });
  });

  it("mọi nhánh thông quan (kể cả đang sửa sau thông quan) → allCleared", () => {
    expect(dossierCustomsSummary([{ stage: "CLEARED", state: "CLEARED" }, { stage: "POST_EDITING", state: "CLEARED" }])).toEqual({ of: 2, cleared: 2, problems: [], allCleared: true });
  });

  it("lỗi gửi (SEND_FAILED) nêu số tờ; lô một tờ chưa thông quan; không có nhánh → chưa xong", () => {
    expect(dossierCustomsSummary([{ stage: "PRE_DECLARED", state: "PRE_DECLARED" }, { stage: "NOT_SENT", state: "SEND_FAILED" }])).toEqual({ of: 2, cleared: 0, problems: [{ no: 2, kind: "SEND_FAILED" }], allCleared: false });
    expect(dossierCustomsSummary([{ stage: "DECLARED", state: "DECLARED" }])).toEqual({ of: 1, cleared: 0, problems: [], allCleared: false });
    expect(dossierCustomsSummary([{ stage: "CLEARED", state: "CLEARED" }])).toMatchObject({ of: 1, cleared: 1, allCleared: true });
    expect(dossierCustomsSummary([])).toEqual({ of: 0, cleared: 0, problems: [], allCleared: false });
  });
});

describe("lockedSheetCount – số tờ đã khai (khóa) khi có tờ đã được cấp số", () => {
  it("chưa tờ nào có số → 0; có ít nhất một tờ có số → số tờ đã lập kết quả (nhánh lớn nhất), kể cả tờ chưa gửi / bị từ chối", () => {
    expect(lockedSheetCount([])).toBe(0);
    expect(lockedSheetCount([{ branch: 1, declarationNo: null }, { branch: 2, declarationNo: null }])).toBe(0);
    // 120 dòng: tờ 1 có số, tờ 2 bị từ chối chưa có số, tờ 3 chưa gửi → đã khai 3 tờ (không phải 1).
    expect(lockedSheetCount([{ branch: 1, declarationNo: "104000000001" }, { branch: 2, declarationNo: null }, { branch: 3, declarationNo: null }])).toBe(3);
    expect(lockedSheetCount([{ branch: 2, declarationNo: null }, { branch: 1, declarationNo: "104000000001" }])).toBe(2);
    expect(lockedSheetCount([{ branch: 1, declarationNo: "104000000001" }])).toBe(1);
  });
});

describe("sheetCountChanged – số tờ đổi sau khi đã có số tờ khai", () => {
  it("chỉ khi đã khóa (> 0) và số tờ hiện tại khác", () => {
    expect(sheetCountChanged(0, 3)).toBe(false);
    expect(sheetCountChanged(3, 3)).toBe(false);
    expect(sheetCountChanged(1, 2)).toBe(true);
    expect(sheetCountChanged(3, 2)).toBe(true);
  });
});

describe("recallExempt – tờ không cần gọi về trước khi truyền lại (R7)", () => {
  it("đã thông quan, sửa sau thông quan, bị từ chối → miễn; các giai đoạn còn nhận nội dung → không", () => {
    for (const st of ["CLEARED", "POST_EDITING", "POST_PRE_DECLARED", "POST_RECALLED", "REJECTED"] as const) expect(recallExempt(st)).toBe(true);
    for (const st of ["NOT_SENT", "PRE_DECLARED", "DECLARED", "RECALLED", "AMEND_RECALLED", "AMEND_PRE_DECLARED"] as const) expect(recallExempt(st)).toBe(false);
  });
});

describe("sheetApproved – 'đã duyệt' của một tờ (dùng chung view và thực hiện nghiệp vụ)", () => {
  it("trước thông quan: tờ khai APPROVED; lô nhiều tờ còn nhận SUBMITTED (đang truyền lần lượt); lô một tờ SUBMITTED → chưa", () => {
    expect(sheetApproved({ stage: "RECALLED", of: 3, declarationStatus: "APPROVED" })).toBe(true);
    expect(sheetApproved({ stage: "RECALLED", of: 3, declarationStatus: "SUBMITTED" })).toBe(true);
    expect(sheetApproved({ stage: "RECALLED", of: 1, declarationStatus: "SUBMITTED" })).toBe(false);
    expect(sheetApproved({ stage: "NOT_SENT", of: 3, declarationStatus: "DRAFT" })).toBe(false);
    expect(sheetApproved({ stage: "NOT_SENT", of: 3, declarationStatus: null })).toBe(false);
  });
  it("sau thông quan (POST_*): theo bản khai bổ sung AMA đang mở của tờ", () => {
    expect(sheetApproved({ stage: "POST_EDITING", of: 3, declarationStatus: "SUBMITTED", amendmentStatus: "APPROVED" })).toBe(true);
    expect(sheetApproved({ stage: "POST_EDITING", of: 1, declarationStatus: "APPROVED", amendmentStatus: "DRAFT" })).toBe(false);
    expect(sheetApproved({ stage: "POST_EDITING", of: 1, declarationStatus: "APPROVED" })).toBe(false);
  });
});

describe("sheetOrderWait – thứ tự gửi nội dung tờ khai nhánh (truyền theo thứ tự tờ, spec §6.2/§6.4)", () => {
  const s = (...stages: Parameters<typeof awaitingContent>[0][]) => stages.map((stage, i) => ({ no: i + 1, stage }));
  it("còn chờ gửi nội dung: NOT_SENT, RECALLED, AMEND_RECALLED", () => {
    for (const st of ["NOT_SENT", "RECALLED", "AMEND_RECALLED"] as const) expect(awaitingContent(st)).toBe(true);
    for (const st of ["PRE_DECLARED", "AMEND_PRE_DECLARED", "DECLARED", "CLEARED", "REJECTED", "POST_EDITING"] as const) expect(awaitingContent(st)).toBe(false);
  });
  it("tờ 1 / lô một tờ không chờ; tờ k chờ tờ trước gần nhất còn chờ gửi nội dung", () => {
    expect(sheetOrderWait(s("RECALLED"), 1)).toBeNull();
    expect(sheetOrderWait(s("RECALLED", "RECALLED", "RECALLED"), 1)).toBeNull();
    expect(sheetOrderWait(s("RECALLED", "RECALLED", "RECALLED"), 2)).toBe(1);
    expect(sheetOrderWait(s("RECALLED", "RECALLED", "RECALLED"), 3)).toBe(2);
    expect(sheetOrderWait(s("AMEND_RECALLED", "PRE_DECLARED", "RECALLED"), 3)).toBe(1);
    expect(sheetOrderWait(s("PRE_DECLARED", "NOT_SENT", "NOT_SENT"), 3)).toBe(2);
    expect(sheetOrderWait(s("AMEND_PRE_DECLARED", "PRE_DECLARED", "RECALLED"), 3)).toBeNull();
  });
  it("R7: tờ trước đã thông quan / sửa sau thông quan / bị từ chối không chờ", () => {
    expect(sheetOrderWait(s("CLEARED", "AMEND_RECALLED", "AMEND_RECALLED"), 2)).toBeNull();
    expect(sheetOrderWait(s("CLEARED", "AMEND_RECALLED", "AMEND_RECALLED"), 3)).toBe(2);
    expect(sheetOrderWait(s("RECALLED", "CLEARED", "POST_EDITING", "REJECTED", "RECALLED"), 5)).toBe(1);
    expect(sheetOrderWait(s("PRE_DECLARED", "CLEARED", "POST_EDITING", "REJECTED", "RECALLED"), 5)).toBeNull();
  });
  it("thứ tự mảng không quan trọng (theo số tờ)", () => {
    expect(sheetOrderWait([{ no: 3, stage: "RECALLED" }, { no: 1, stage: "RECALLED" }, { no: 2, stage: "PRE_DECLARED" }], 3)).toBe(1);
  });
});
