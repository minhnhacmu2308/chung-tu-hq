import type { LayoutBlock, PostAmendment, PostAmendmentLine } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import {
  amaChangeSummary, amaDeadline, amaPrimaryAction, amaRejection, applyEdits, lineSaves, reviewTarget, approveBlockers, changedKeys, defaultSubStep, maxSubStep, missingOther, otherSlotsInUse, postStepVisible, reasonLayout, resolveSubStep,
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
    expect(amaChangeSummary(a)).toEqual({ lines: 2, changed: 3, taxBefore: "6000110.5", taxAfter: "3600110.75", taxDelta: "-2399999.75" });
  });
  it("không có dòng → 0", () => expect(amaChangeSummary(pa())).toEqual({ lines: 0, changed: 0, taxBefore: "0", taxAfter: "0", taxDelta: "0" }));
});

describe("approveBlockers", () => {
  it("thiếu dòng và mã lý do → hai lý do, đúng thứ tự", () =>
    expect(approveBlockers(pa(), { pendingEdits: 0, fourEyes: false }, "vi")).toEqual(["Chưa có dòng hàng", "Chưa nhập mã lý do khai bổ sung"]));
  it("đủ điều kiện → không chặn", () => expect(approveBlockers(pa({ lines: oneLine, header: { TK_REC: "1" } }), { pendingEdits: 0, fourEyes: false }, "vi")).toEqual([]));
  it("còn thay đổi chưa lưu và 4 mắt", () =>
    expect(approveBlockers(pa({ lines: oneLine, header: { TK_REC: "1" } }), { pendingEdits: 2, fourEyes: true }, "vi")).toEqual([
      "Còn thay đổi chưa lưu",
      "Nguyên tắc 4 mắt: nhờ Người duyệt khác phê duyệt",
    ]));
});

describe("amaPrimaryAction", () => {
  it("đã duyệt → khai tạm AMA", () =>
    expect(amaPrimaryAction(pa({ status: "APPROVED" }), { stage: "POST_EDITING", sending: false }, "vi")).toEqual({ op: "AMA", label: "Ký số & khai tạm AMA" }));
  it("gọi về đã duyệt lại → khai tạm AMA", () => expect(amaPrimaryAction(pa({ status: "APPROVED" }), { stage: "POST_RECALLED", sending: false }, "vi")?.op).toBe("AMA"));
  it("đã khai tạm → khai chính thức AMC", () =>
    expect(amaPrimaryAction(pa({ status: "PRE_DECLARED" }), { stage: "POST_PRE_DECLARED", sending: false }, "vi")).toEqual({ op: "AMC", label: "Khai chính thức AMC" }));
  it("đang chờ Hải quan → không có nút chính", () => expect(amaPrimaryAction(pa({ status: "PRE_DECLARED" }), { stage: "POST_PRE_DECLARED", sending: true }, "vi")).toBeNull());
  it.each(["DRAFT", "RECALLED", "REGISTERED"] as const)("%s → không có nút chính", (status) =>
    expect(amaPrimaryAction(pa({ status }), { stage: "POST_EDITING", sending: false }, "vi")).toBeNull());
});

describe("applyEdits", () => {
  const saved = line({ HAG_MKB: "120000000", HAG_MKR: "5", HAG_MKA: "6000000", HAG_AKB: "120000000", HAG_AKR: "5", HAG_AKA: "6000000" });
  it("không có thay đổi → giữ nguyên dòng đã lưu", () => expect(applyEdits(saved, {})).toEqual(saved));
  it("đổi thuế suất Sau → tiền thuế Sau tự tính lại", () => {
    const d = applyEdits(saved, { HAG_AKR: "3" });
    expect(d.values["HAG_AKR"]).toBe("3");
    expect(Number(d.values["HAG_AKA"])).toBe(3600000);
    expect(changedKeys(d)).toEqual(expect.arrayContaining(["HAG_AKR", "HAG_AKA"]));
  });
  it("sửa tay tiền thuế → đánh dấu sửa tay, không tính đè", () => {
    const d = applyEdits(saved, { HAG_AKA: "5000000", HAG_AKR: "3" });
    expect(d.manual).toContain("HAG_AKA");
    expect(d.values["HAG_AKA"]).toBe("5000000");
  });
});

describe("reasonLayout", () => {
  const keysOf = (blocks: LayoutBlock[]) =>
    blocks.flatMap((b) => b.items.flatMap((i) => (i.kind === "field" ? [i.key] : i.fields.map((f) => f.key))));
  const { main, other } = reasonLayout("vi");
  it("hiện sẵn chỉ mã lý do và ghi chú sau", () => expect(keysOf([main])).toEqual(["TK_REC", "TK_NTA"]));
  it("thông tin khác: ô sửa được còn lại, kể cả ô bắt buộc đã điền sẵn", () => expect(keysOf(other)).toEqual(expect.arrayContaining(["TK_CHB", "TK_TTC", "TK_BRC", "TK_CDA", "TK_RTA"])));
  it("không có ô khóa theo tờ khai gốc, không lặp ô hiện sẵn", () => {
    const k = keysOf(other);
    for (const x of ["TK_ICN", "TK_IPD", "TK_NTB", "TK_CDB", "TK_RTB", "TK_SYN", "TK_REC", "TK_NTA"]) expect(k).not.toContain(x);
  });
  it("bỏ nhóm/khối rỗng sau khi lọc", () => expect(other.every((b) => b.items.length > 0 && b.items.every((i) => i.kind === "field" || i.fields.length > 0))).toBe(true));
});

describe("missingOther", () => {
  it("liệt kê ô bắt buộc còn trống trong thông tin khác", () => expect(missingOther({ TK_TTC: "VND", TK_CHB: "" }).map((f) => f.key)).toContain("TK_CHB"));
  it("đủ thì rỗng", () => expect(missingOther({ TK_TTC: "VND", TK_CHB: "00" })).toEqual([]));
});

describe("maxSubStep – bước xa nhất được tới", () => {
  it("Nháp chưa có dòng → chỉ chọn dòng", () => expect(maxSubStep(pa())).toBe("pick"));
  it("Nháp / gọi về có dòng → tới lý do & phê duyệt", () => {
    expect(maxSubStep(pa({ lines: oneLine }))).toBe("reason");
    expect(maxSubStep(pa({ status: "RECALLED", lines: oneLine }))).toBe("reason");
  });
  it("đã duyệt trở đi → tới khai Hải quan", () => expect(maxSubStep(pa({ status: "APPROVED", lines: oneLine }))).toBe("declare"));
  it("resolveSubStep: Nháp có dòng mở được bước lý do, chưa tới khai Hải quan", () => {
    expect(resolveSubStep(pa({ lines: oneLine }), "reason")).toBe("reason");
    expect(resolveSubStep(pa({ lines: oneLine }), "declare")).toBe("edit");
  });
});

describe("amaRejection – lỗi Hải quan của bản khai đang xem", () => {
  const rej = (operation: "AMA" | "AMB" | "AMC" | "IDA", at: string) => ({ operation, at, errors: [{ code: "E1", message: "Sai" }] });
  const cur = pa({ status: "PRE_DECLARED", createdAt: "2026-10-20T01:00:00.000Z" });
  it("AMC bị từ chối khi đã khai tạm vẫn hiện, không gợi ý sửa lại", () =>
    expect(amaRejection(cur, rej("AMC", "2026-10-20T02:00:00.000Z"), true)).toMatchObject({ rejection: { operation: "AMC" }, fixable: false }));
  it("AMA bị từ chối → gợi ý sửa lại", () => expect(amaRejection(pa({ createdAt: "2026-10-20T01:00:00.000Z" }), rej("AMA", "2026-10-20T02:00:00.000Z"), true)?.fixable).toBe(true));
  it("lỗi từ trước khi lập bản khai này (bản trước) → không hiện", () => expect(amaRejection(cur, rej("AMB", "2026-10-19T02:00:00.000Z"), true)).toBeNull());
  it("lỗi của nghiệp vụ tờ khai gốc → không hiện", () => expect(amaRejection(cur, rej("IDA", "2026-10-20T02:00:00.000Z"), true)).toBeNull());
  it("bản đã khai chính thức (lịch sử) → không hiện", () => expect(amaRejection(cur, rej("AMC", "2026-10-20T02:00:00.000Z"), false)).toBeNull());
});

describe("lineSaves – gửi đúng giá trị người khai nhập", () => {
  it("Tự tính lại gửi chuỗi rỗng để máy chủ bỏ đánh dấu sửa tay", () =>
    expect(lineSaves({ l1: { HAG_AKA: "", HAG_AKR: "3" } }, ["l1"])).toEqual([
      { lineId: "l1", key: "HAG_AKA", value: "" },
      { lineId: "l1", key: "HAG_AKR", value: "3" },
    ]));
  it("bỏ qua thay đổi của dòng không còn trong bản khai", () => expect(lineSaves({ gone: { HAG_AKR: "3" } }, ["l1"])).toEqual([]));
});

describe("reviewTarget – nút xem lại ở bước khai Hải quan", () => {
  it("đã duyệt → về lý do & phê duyệt", () => expect(reviewTarget(pa({ status: "APPROVED", lines: oneLine }))).toBe("reason"));
  it("đã khai tạm / chính thức → xem nội dung sửa", () => {
    expect(reviewTarget(pa({ status: "PRE_DECLARED", lines: oneLine }))).toBe("edit");
    expect(reviewTarget(pa({ status: "REGISTERED", lines: oneLine }))).toBe("edit");
  });
});
