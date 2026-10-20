import type { PostAmendment, PostAmendmentLine } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import {
  amaChangeSummary, amaDeadline, amaPrimaryAction, approveBlockers, changedKeys, defaultSubStep, otherSlotsInUse, postStepVisible, resolveSubStep,
  subStepEditable,
} from "./ama-wizard";

const line = (values: Record<string, string>, id = "l1", ran = 1): PostAmendmentLine => ({ id, ran, values, manual: [] });
const pa = (p: Partial<PostAmendment> = {}): PostAmendment => ({
  id: "pa1", dossierId: "dos_018", seq: 1, status: "DRAFT", header: {}, lines: [],
  createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z", ...p,
});
const oneLine = [line({ HAG_MKR: "5", HAG_AKR: "5" })];

describe("postStepVisible", () => {
  it.each(["CLEARED", "POST_EDITING", "POST_PRE_DECLARED", "POST_RECALLED"] as const)("%s → hiện bước 7", (s) => expect(postStepVisible(s)).toBe(true));
  it.each(["DECLARED", "NOT_SENT", undefined] as const)("%s → ẩn", (s) => expect(postStepVisible(s)).toBe(false));
});

describe("defaultSubStep", () => {
  it("Nháp chưa có dòng → chọn dòng", () => expect(defaultSubStep(pa())).toBe("pick"));
  it("Nháp có dòng → sửa nội dung", () => expect(defaultSubStep(pa({ lines: oneLine }))).toBe("edit"));
  it("Gọi về → sửa nội dung", () => expect(defaultSubStep(pa({ status: "RECALLED", lines: oneLine }))).toBe("edit"));
  it.each(["APPROVED", "PRE_DECLARED", "REGISTERED"] as const)("%s → khai Hải quan", (status) => expect(defaultSubStep(pa({ status, lines: oneLine }))).toBe("declare"));
});

describe("resolveSubStep", () => {
  const draft = pa({ lines: oneLine });
  it("không cho nhảy tới bước sau bước mặc định", () => expect(resolveSubStep(draft, "declare")).toBe("edit"));
  it("cho xem bước trước", () => expect(resolveSubStep(draft, "pick")).toBe("pick"));
  it("đã duyệt vẫn xem lại được bước sửa", () => expect(resolveSubStep(pa({ status: "APPROVED", lines: oneLine }), "edit")).toBe("edit"));
  it("giá trị lạ hoặc trống → mặc định", () => {
    expect(resolveSubStep(draft, "rac")).toBe("edit");
    expect(resolveSubStep(draft, null)).toBe("edit");
  });
});

describe("subStepEditable", () => {
  it("đã duyệt vẫn sửa được (phải duyệt lại)", () => expect(subStepEditable(pa({ status: "APPROVED" }), "edit", true)).toBe(true));
  it("đã khai tạm → chỉ xem", () => expect(subStepEditable(pa({ status: "PRE_DECLARED" }), "edit", true)).toBe(false));
  it("không có quyền sửa → chỉ xem", () => expect(subStepEditable(pa(), "pick", false)).toBe(false));
  it("bước khai Hải quan không phải bước sửa", () => expect(subStepEditable(pa(), "declare", true)).toBe(false));
});

describe("changedKeys", () => {
  it("thuế suất Sau khác Trước → đã đổi", () => expect(changedKeys(line({ HAG_MKR: "5", HAG_AKR: "3" }))).toContain("HAG_AKR"));
  it("số bằng nhau khác cách viết → không đổi", () => expect(changedKeys(line({ HAG_MKB: "120000", HAG_AKB: "120000.00" }))).not.toContain("HAG_AKB"));
  it("mô tả và xuất xứ Sau đổi → đã đổi", () => {
    const k = changedKeys(line({ HAG_CMB: "Vòng bi", HAG_CMA: "Vòng bi tuyến tính", HAG_ORB: "KR", HAG_ORA: "KR" }));
    expect(k).toContain("HAG_CMA");
    expect(k).not.toContain("HAG_ORA");
  });
  it("thu khác slot 2 đổi thuế suất → đã đổi", () => expect(changedKeys(line({ HAG_MR2: "10", HAG_AR2: "8" }))).toContain("HAG_AR2"));
});

describe("otherSlotsInUse", () => {
  it("chỉ các slot có giá trị Trước hoặc Sau", () => expect(otherSlotsInUse({ HAG_MR1: "10", HAG_AA3: "5" })).toEqual([1, 3]));
});

describe("amaDeadline", () => {
  it("còn hạn: thông quan 17/10, hôm nay 20/10 → hạn 16/12, còn 57 ngày", () =>
    expect(amaDeadline("2026-10-17", "2026-10-20")).toEqual({ due: "2026-12-16", daysLeft: 57, overdue: false }));
  it("đúng ngày hạn → còn 0 ngày, chưa quá hạn", () => expect(amaDeadline("2026-10-17", "2026-12-16")).toEqual({ due: "2026-12-16", daysLeft: 0, overdue: false }));
  it("quá hạn", () => {
    const d = amaDeadline("2026-08-01", "2026-10-20")!;
    expect(d.overdue).toBe(true);
    expect(d.daysLeft).toBeLessThan(0);
  });
  it("ngày trống hoặc sai định dạng → null", () => {
    expect(amaDeadline(undefined, "2026-10-20")).toBeNull();
    expect(amaDeadline("17/10/2026", "2026-10-20")).toBeNull();
    expect(amaDeadline("2026-02-30", "2026-10-20")).toBeNull();
  });
});

describe("amaChangeSummary", () => {
  it("cộng tăng/giảm thuế các dòng bằng số thập phân", () => {
    const a = pa({
      lines: [
        line({ HAG_MKR: "5", HAG_AKR: "3", HAG_MKA: "6000000", HAG_AKA: "3600000" }, "l1", 1),
        line({ HAG_MKA: "100", HAG_AKA: "100", HAG_MA1: "10.5", HAG_AA1: "10.75" }, "l2", 2),
      ],
    });
    expect(amaChangeSummary(a)).toEqual({ lines: 2, changed: 3, taxDelta: "-2399999.75" });
  });
  it("không có dòng → 0", () => expect(amaChangeSummary(pa())).toEqual({ lines: 0, changed: 0, taxDelta: "0" }));
});

describe("approveBlockers", () => {
  it("thiếu dòng và mã lý do → hai lý do, đúng thứ tự", () =>
    expect(approveBlockers(pa(), { pendingEdits: 0, fourEyes: false })).toEqual(["Chưa có dòng hàng", "Chưa nhập mã lý do khai bổ sung"]));
  it("đủ điều kiện → không chặn", () => expect(approveBlockers(pa({ lines: oneLine, header: { TK_REC: "1" } }), { pendingEdits: 0, fourEyes: false })).toEqual([]));
  it("còn thay đổi chưa lưu và 4 mắt", () =>
    expect(approveBlockers(pa({ lines: oneLine, header: { TK_REC: "1" } }), { pendingEdits: 2, fourEyes: true })).toEqual([
      "Còn thay đổi chưa lưu",
      "Nguyên tắc 4 mắt: nhờ Người duyệt khác phê duyệt",
    ]));
});

describe("amaPrimaryAction", () => {
  it("đã duyệt → khai tạm AMA", () =>
    expect(amaPrimaryAction(pa({ status: "APPROVED" }), { stage: "POST_EDITING", sending: false })).toEqual({ op: "AMA", label: "Ký số & khai tạm AMA" }));
  it("gọi về đã duyệt lại → khai tạm AMA", () => expect(amaPrimaryAction(pa({ status: "APPROVED" }), { stage: "POST_RECALLED", sending: false })?.op).toBe("AMA"));
  it("đã khai tạm → khai chính thức AMC", () =>
    expect(amaPrimaryAction(pa({ status: "PRE_DECLARED" }), { stage: "POST_PRE_DECLARED", sending: false })).toEqual({ op: "AMC", label: "Khai chính thức AMC" }));
  it("đang chờ Hải quan → không có nút chính", () => expect(amaPrimaryAction(pa({ status: "PRE_DECLARED" }), { stage: "POST_PRE_DECLARED", sending: true })).toBeNull());
  it.each(["DRAFT", "RECALLED", "REGISTERED"] as const)("%s → không có nút chính", (status) =>
    expect(amaPrimaryAction(pa({ status }), { stage: "POST_EDITING", sending: false })).toBeNull());
});
