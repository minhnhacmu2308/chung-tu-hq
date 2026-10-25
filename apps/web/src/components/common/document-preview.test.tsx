// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { DocumentPreview } from "./document-preview";

const docNamed = (fileName: string) => {
  resetDb();
  return { ...getDb().documents[0]!, fileName };
};

describe("DocumentPreview", () => {
  it("có file gốc (backend): hiện đúng file PDF đã upload thay cho bản dựng lại; không vi phạm a11y", async () => {
    const doc = docNamed("AWB_7704.pdf");
    const { container } = renderWithProviders(<DocumentPreview document={doc} file={{ status: "ready", url: "https://files.test/awb.pdf?sig=1" }} fields={[]} />);
    const region = screen.getByRole("region", { name: /AWB_7704\.pdf/ });
    const frame = region.querySelector("iframe")!;
    expect(frame.getAttribute("src")).toBe("https://files.test/awb.pdf?sig=1#navpanes=0&view=FitH");
    expect(within(region).getByRole("link", { name: "Mở ở tab mới" }).getAttribute("href")).toBe("https://files.test/awb.pdf?sig=1");
    expect(screen.queryByText(/CARRIER/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("file ảnh: hiện ảnh vừa khung", () => {
    const doc = docNamed("scan.png");
    renderWithProviders(<DocumentPreview document={doc} file={{ status: "ready", url: "https://files.test/scan.png" }} fields={[]} />);
    expect(screen.getByRole("img", { name: /scan\.png/ }).getAttribute("src")).toBe("https://files.test/scan.png");
  });

  it("file không còn trong kho: báo rõ thay vì link chết", () => {
    renderWithProviders(<DocumentPreview document={docNamed("INV.pdf")} file={{ status: "missing" }} fields={[]} />);
    expect(screen.getByText("File gốc không còn trong kho lưu trữ")).toBeTruthy();
  });

  it("lỗi tải link: có nút Thử lại", async () => {
    const retry = vi.fn();
    renderWithProviders(<DocumentPreview document={docNamed("INV.pdf")} file={{ status: "error", retry }} fields={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(retry).toHaveBeenCalled();
  });
});
