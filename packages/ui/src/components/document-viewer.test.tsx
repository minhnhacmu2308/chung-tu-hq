import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { DocumentViewer, type DocumentRegion } from "./document-viewer.js";

const PAGES = [<p key="1">COMMERCIAL INVOICE trang một</p>, <p key="2">Trang hai: tổng cộng</p>];
const REGIONS: DocumentRegion[] = [
  { id: "invoice_no", page: 1, x: 60, y: 10, w: 30, h: 4, label: "Số hóa đơn" },
  { id: "total", page: 2, x: 50, y: 80, w: 40, h: 5, label: "Tổng tiền" },
];

describe("DocumentViewer", () => {
  it("hiển thị trang 1 và chuyển trang bằng nút trước/sau", async () => {
    const onPageChange = vi.fn();
    render(<DocumentViewer label="Chứng từ gốc" pages={PAGES} onPageChange={onPageChange} />);
    expect(screen.getByRole("region", { name: "Chứng từ gốc" })).toBeInTheDocument();
    expect(screen.getByText("COMMERCIAL INVOICE trang một")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trang trước" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Trang sau" }));

    expect(screen.getByText("Trang hai: tổng cộng")).toBeInTheDocument();
    expect(screen.getByText("Trang 2/2")).toBeInTheDocument();
    expect(onPageChange).toHaveBeenCalledWith(2);
    expect(screen.getByRole("button", { name: "Trang sau" })).toBeDisabled();
  });

  it("phóng to/thu nhỏ theo bước 25%, nút Vừa khung bật lại chế độ tự vừa", async () => {
    render(<DocumentViewer label="Chứng từ gốc" pages={PAGES} />);
    const fit = screen.getByRole("button", { name: "Vừa khung" });
    expect(fit).toHaveAttribute("aria-pressed", "true");
    // jsdom không có bề rộng → mức vừa khung = 100%
    expect(screen.getByLabelText("Mức phóng 100%")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Phóng to" }));
    expect(screen.getByLabelText("Mức phóng 125%")).toBeInTheDocument();
    expect(fit).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: "Thu nhỏ" }));
    await userEvent.click(screen.getByRole("button", { name: "Thu nhỏ" }));
    expect(screen.getByLabelText("Mức phóng 75%")).toBeInTheDocument();

    await userEvent.click(fit);
    expect(screen.getByLabelText("Mức phóng 100%")).toBeInTheDocument();
  });

  it("highlightId: tô vùng và tự chuyển tới trang chứa vùng; vị trí truyền qua biến CSS", () => {
    const { container, rerender } = render(<DocumentViewer label="Chứng từ gốc" pages={PAGES} regions={REGIONS} highlightId="invoice_no" />);
    const r1 = container.querySelector('[data-region="invoice_no"]') as HTMLElement;
    expect(r1).toHaveAttribute("data-active", "true");
    expect(r1.style.getPropertyValue("--rx")).toBe("60%");
    expect(container.querySelector('[data-region="total"]')).toBeNull(); // vùng trang 2 chưa hiện

    rerender(<DocumentViewer label="Chứng từ gốc" pages={PAGES} regions={REGIONS} highlightId="total" />);
    expect(screen.getByText("Trang 2/2")).toBeInTheDocument();
    expect(container.querySelector('[data-region="total"]')).toHaveAttribute("data-active", "true");
  });

  it("onRegionClick: vùng thành nút bấm được bằng chuột và bàn phím", async () => {
    const onRegionClick = vi.fn();
    render(<DocumentViewer label="Chứng từ gốc" pages={PAGES} regions={REGIONS} onRegionClick={onRegionClick} />);
    const btn = screen.getByRole("button", { name: "Số hóa đơn" });
    await userEvent.click(btn);
    expect(onRegionClick).toHaveBeenCalledWith("invoice_no");
    btn.focus();
    await userEvent.keyboard("{Enter}");
    expect(onRegionClick).toHaveBeenCalledTimes(2);
  });

  it("page điều khiển từ ngoài", () => {
    render(<DocumentViewer label="Chứng từ gốc" pages={PAGES} page={2} />);
    expect(screen.getByText("Trang hai: tổng cộng")).toBeInTheDocument();
  });

  it("className gộp được", () => {
    render(<DocumentViewer label="Chứng từ gốc" pages={PAGES} className="h-96" />);
    expect(screen.getByRole("region", { name: "Chứng từ gốc" })).toHaveClass("h-96", "rounded-lg");
  });

  it("không vi phạm a11y", async () => {
    const { container } = render(<DocumentViewer label="Chứng từ gốc" pages={PAGES} regions={REGIONS} highlightId="invoice_no" onRegionClick={() => {}} />);
    await expectNoA11yViolations(container);
  });
});

describe("DocumentViewer – dựng lại trang từ dữ liệu", () => {
  it("content: chữ in trong vùng đọc được; vùng có label vẫn là nút khi có onRegionClick", () => {
    render(
      <DocumentViewer
        label="Chứng từ gốc"
        pages={[null]}
        regions={[
          { id: "title", page: 1, x: 10, y: 5, w: 80, h: 5, content: "COMMERCIAL INVOICE" },
          { id: "invoice_no", page: 1, x: 60, y: 12, w: 30, h: 4, label: "Số hóa đơn", content: "HPS-2610-078" },
        ]}
        onRegionClick={() => {}}
      />,
    );
    expect(screen.getByText("COMMERCIAL INVOICE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Số hóa đơn" })).toHaveTextContent("HPS-2610-078");
    expect(screen.queryByRole("button", { name: "title" })).toBeNull();
  });
});
