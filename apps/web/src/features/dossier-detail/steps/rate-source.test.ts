import { describe, expect, it } from "vitest";
import { rateSourceHint } from "./rate-source";

describe("rateSourceHint (màn Review)", () => {
  it("Vietcombank: tuần áp dụng + giờ bảng (giờ VN)", () => {
    expect(rateSourceHint({ currency: "USD", rate: "25710", effectiveFrom: "2026-10-19", source: "VCB", snapshotAt: "2026-10-22T15:00:00.000Z" }, "2026-10-20")).toBe("Tuần 19/10 – 25/10 · Vietcombank, bảng lúc 22:00 22/10");
  });
  it("Nhập tay / dữ liệu mẫu / chưa có thông tin nguồn", () => {
    expect(rateSourceHint({ currency: "TWD", rate: "805", effectiveFrom: "2026-10-19", source: "MANUAL", snapshotAt: null }, "2026-10-20")).toBe("Tuần 19/10 – 25/10 · đội vận hành nhập tay");
    expect(rateSourceHint({ currency: "USD", rate: "25400", effectiveFrom: "2026-10-12", source: "SEED", snapshotAt: null }, "2026-10-14")).toBe("Tuần 12/10 – 18/10 · dữ liệu mẫu (chưa phải tỷ giá chính thức)");
    expect(rateSourceHint(null, "2026-10-20")).toBe("Ngày 20/10/2026 · chưa có tỷ giá chính thức cho ngoại tệ này – quản trị nhập tay");
  });
  it("tuần này chưa có tỷ giá → đang dùng tuần trước: cảnh báo rõ", () => {
    expect(rateSourceHint({ currency: "USD", rate: "25600", effectiveFrom: "2026-10-12", source: "VCB", snapshotAt: null }, "2026-10-20")).toBe("Tuần 12/10 – 18/10 · Vietcombank · ⚠ chưa có tỷ giá tuần 19/10 – đang dùng tỷ giá tuần trước, quản trị cần nhập/kiểm tra");
  });
});
