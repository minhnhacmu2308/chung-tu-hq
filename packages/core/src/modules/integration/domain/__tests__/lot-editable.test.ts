import { describe, expect, it } from "vitest";
import { isLotEditable } from "../lot-editable.js";

const base = { declarationStatus: "DRAFT" as const, stages: [] as never[], contentPending: false };

describe("isLotEditable", () => {
  it("chưa gửi tờ nào (DRAFT) → còn sửa được", () => expect(isLotEditable(base)).toBe(true));
  it("đã gọi về tất cả tờ (APPROVED) → còn sửa được", () => expect(isLotEditable({ ...base, declarationStatus: "APPROVED", stages: ["NOT_SENT", "RECALLED"] })).toBe(true));
  it("gọi về một phần → khóa", () => expect(isLotEditable({ ...base, stages: ["PRE_DECLARED", "RECALLED"] })).toBe(false));
  it("tờ khai SUBMITTED → khóa", () => expect(isLotEditable({ ...base, declarationStatus: "SUBMITTED" })).toBe(false));
  it("chưa có tờ khai → khóa", () => expect(isLotEditable({ ...base, declarationStatus: null })).toBe(false));
  it("còn outbox nội dung đang chờ → khóa", () => expect(isLotEditable({ ...base, contentPending: true })).toBe(false));
});
