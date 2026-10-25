// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RenderedFile } from "@/lib/pdf-render";
import { getDb, resetDb } from "@/mocks/db";
import type { ExtractedField } from "@/mocks/types";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { DocumentPreview } from "./document-preview";

const render = vi.hoisted(() => ({ pdf: vi.fn(), image: vi.fn() }));
vi.mock("@/lib/pdf-render", () => ({ RenderCancelled: class extends Error {}, renderPdf: render.pdf, renderImage: render.image, MAX_RENDER_PAGES: 30 }));

/** PDF giả 1 trang: lớp chữ có số hóa đơn và tổng tiền. */
const PDF: RenderedFile = {
  pages: [{ url: "blob:page-1", aspect: 0.7, text: { page: 1, boxes: [{ str: "Invoice No.: M-240315", x: 10, y: 12, w: 10.5, h: 2 }, { str: "TOTAL US$608.58", x: 10, y: 70, w: 7.5, h: 2 }] } }],
  totalPages: 1,
  dispose: vi.fn(),
};
const field = (id: string, label: string, value: string, extra: Partial<ExtractedField> = {}): ExtractedField => ({
  id, documentId: "doc", group: "GENERAL", key: id, label, value, originalValue: value, status: "SINGLE_SOURCE", ...extra,
});
const FIELDS = [field("f-no", "Số hóa đơn", "M-240315"), field("f-total", "Tổng trị giá", "608.58"), field("f-buyer", "Người mua", "HANSOL")];

const docNamed = (fileName: string) => {
  resetDb();
  return { ...getDb().documents[0]!, fileName };
};

describe("DocumentPreview – file gốc thật", () => {
  beforeEach(() => {
    render.pdf.mockReset().mockResolvedValue(PDF);
    render.image.mockReset();
  });

  it("PDF chuẩn: dựng trang thật, tô được vùng của trường tìm thấy trong lớp chữ; bấm vùng → nhảy tới trường; không vi phạm a11y", async () => {
    const onFieldClick = vi.fn();
    const { container } = renderWithProviders(
      <DocumentPreview document={docNamed("INV 88.pdf")} file={{ status: "ready", url: "https://files.test/inv.pdf?sig=1" }} fields={FIELDS} highlightFieldId="f-total" onFieldClick={onFieldClick} />,
    );
    const viewer = await screen.findByRole("region", { name: /INV 88\.pdf/ });
    expect(render.pdf).toHaveBeenCalledWith("https://files.test/inv.pdf?sig=1", expect.any(Function));
    expect(viewer.querySelector('img[src="blob:page-1"]')).not.toBeNull();
    // Trường có trên chứng từ → có vùng; không có (HANSOL) → không vùng.
    const total = within(viewer).getByRole("button", { name: "Tổng trị giá" });
    expect(total.getAttribute("aria-pressed")).toBe("true");
    expect(within(viewer).getByRole("button", { name: "Số hóa đơn" })).toBeTruthy();
    expect(within(viewer).queryByRole("button", { name: "Người mua" })).toBeNull();
    await userEvent.click(within(viewer).getByRole("button", { name: "Số hóa đơn" }));
    expect(onFieldClick).toHaveBeenCalledWith("f-no");
    expect(within(viewer).getByRole("link", { name: "Mở ở tab mới" }).getAttribute("href")).toBe("https://files.test/inv.pdf?sig=1");
    await expectNoA11yViolations(container);
  });

  it("ảnh/scan: dùng tọa độ AI trả về của trường", async () => {
    render.image.mockResolvedValue({ ...PDF, pages: [{ ...PDF.pages[0]!, text: { page: 1, boxes: [] } }] });
    renderWithProviders(
      <DocumentPreview document={docNamed("scan.jpg")} file={{ status: "ready", url: "https://files.test/scan.jpg" }} fields={[field("f-no", "Số hóa đơn", "X1", { region: { page: 1, x: 5, y: 5, w: 20, h: 3 } })]} onFieldClick={vi.fn()} />,
    );
    const viewer = await screen.findByRole("region", { name: /scan\.jpg/ });
    expect(render.image).toHaveBeenCalled();
    expect(within(viewer).getByRole("button", { name: "Số hóa đơn" })).toBeTruthy();
  });

  it("không dựng được PDF → dự phòng bằng trình xem PDF của trình duyệt", async () => {
    render.pdf.mockRejectedValue(new Error("bad pdf"));
    renderWithProviders(<DocumentPreview document={docNamed("odd.pdf")} file={{ status: "ready", url: "https://files.test/odd.pdf" }} fields={FIELDS} />);
    await waitFor(() => expect(document.querySelector("iframe")?.getAttribute("src")).toBe("https://files.test/odd.pdf#navpanes=0&view=FitH"));
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
