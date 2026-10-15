import { describe, expect, it } from "vitest";
import { editableWeeks } from "./weeks";

describe("editableWeeks (hộp nhập tay)", () => {
  it("lần lấy thứ Năm lỗi, mở trang sáng thứ Sáu: vẫn có tuần sau (19/10) và tuần này (12/10), không nhảy sang 26/10", () => {
    expect(editableWeeks(new Date("2026-10-16T02:00:00Z"), [])).toEqual(["2026-10-19", "2026-10-12"]);
  });
  it("gộp với các tuần đã có, mới nhất trước, không trùng; bỏ ngày không phải thứ Hai", () => {
    expect(editableWeeks(new Date("2026-10-16T02:00:00Z"), ["2026-10-12", "2026-10-05", "2026-10-14"])).toEqual(["2026-10-19", "2026-10-12", "2026-10-05"]);
  });
  it("Chủ nhật 23:30 giờ VN vẫn là tuần cũ", () => {
    expect(editableWeeks(new Date("2026-10-18T16:30:00Z"), [])).toEqual(["2026-10-19", "2026-10-12"]);
  });
});
