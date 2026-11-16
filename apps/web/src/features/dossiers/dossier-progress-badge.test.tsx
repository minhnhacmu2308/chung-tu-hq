// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SheetBrief } from "@kb/contracts";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { DossierProgressBadge } from "./dossier-progress-badge";

const sheet = (no: number, over: Partial<SheetBrief>): SheetBrief => ({ no, stage: "NOT_SENT", state: "APPROVED", channel: null, amendments: 0, postAmendments: 0, ...over });
const customs = (sheets: SheetBrief[]) => ({ cleared: 0, of: sheets.length, problems: [], sheets });

describe("DossierProgressBadge", () => {
  it("hồ sơ chưa có tờ khai: Chưa khai báo + dòng phụ theo trạng thái hồ sơ; không vi phạm a11y", async () => {
    const { container } = renderWithProviders(<DossierProgressBadge dossier={{ status: "NEEDS_REVIEW" }} />);
    expect(screen.getByText("Chưa khai báo")).toBeTruthy();
    expect(screen.getByText("Cần kiểm tra")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("khai chính thức có luồng đỏ", async () => {
    const { container } = renderWithProviders(<DossierProgressBadge dossier={{ status: "SUBMITTED", customs: customs([sheet(1, { stage: "DECLARED", state: "APPROVED", channel: "RED" })]) }} />);
    expect(screen.getByText("Đã khai chính thức")).toBeTruthy();
    expect(screen.getByText("Luồng đỏ")).toBeTruthy();
    expect(screen.queryByText(/\d\/\d/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("lô lệch mức: nhãn chậm nhất + mức xa nhất k/N; cùng mức không hiện k/N", () => {
    const { unmount } = renderWithProviders(<DossierProgressBadge dossier={{ status: "SUBMITTED", customs: customs([sheet(1, { stage: "CLEARED" }), sheet(2, { stage: "DECLARED" }), sheet(3, { stage: "CLEARED" })]) }} />);
    expect(screen.getByText("Đã khai chính thức · Đã thông quan 2/3")).toBeTruthy();
    unmount();
    renderWithProviders(<DossierProgressBadge dossier={{ status: "SUBMITTED", customs: customs([sheet(1, { stage: "CLEARED" }), sheet(2, { stage: "CLEARED" })]) }} />);
    expect(screen.getByText("Đã thông quan")).toBeTruthy();
  });

  it("hồ sơ hủy không hiện k/N", () => {
    const sheets = [sheet(1, { stage: "CLEARED" }), sheet(2, { stage: "CLEARED" }), sheet(3, { stage: "CLEARED" })];
    renderWithProviders(<DossierProgressBadge dossier={{ status: "CANCELLED", customs: customs(sheets) }} />);
    expect(screen.getByText("Đã hủy")).toBeTruthy();
  });

  it("3 ngôn ngữ", () => {
    renderWithProviders(<DossierProgressBadge dossier={{ status: "DRAFT" }} />, "en");
    expect(screen.getByText("Not declared")).toBeTruthy();
  });
  it("tờ khai đều đã hủy (Hải quan hủy) – zh dùng 已作废; hồ sơ do người dùng hủy – zh 已取消", () => {
    const { unmount } = renderWithProviders(<DossierProgressBadge dossier={{ status: "SUBMITTED", customs: customs([sheet(1, { stage: "CANCELLED" })]) }} />, "zh");
    expect(screen.getByText("已作废")).toBeTruthy();
    unmount();
    renderWithProviders(<DossierProgressBadge dossier={{ status: "CANCELLED" }} />, "zh");
    expect(screen.getByText("已取消")).toBeTruthy();
  });

  it("cờ truyền lỗi dùng trạng thái riêng của tiến độ hồ sơ", () => {
    renderWithProviders(<DossierProgressBadge dossier={{ status: "SUBMITTED", customs: customs([sheet(1, { stage: "CLEARED" }), sheet(2, { stage: "DECLARED", state: "SEND_FAILED" })]) }} />, "en");
    expect(screen.getByText("Send failed")).toBeTruthy();
  });
});
