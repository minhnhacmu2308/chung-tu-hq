import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Alert, Badge, EmptyState, Skeleton, STATUS_META, StatusBadge, type Status } from "./feedback.js";
import { Card, CardContent, CardHeader, CardTitle, Grid, PageHeader, Stack } from "./layout.js";

describe("Grid / Stack", () => {
  it("Grid tạo class cột tĩnh cho từng breakpoint", () => {
    const { container } = render(<Grid cols={{ base: 1, md: 2, lg: 4 }} gap="lg" />);
    expect(container.firstChild).toHaveClass("grid", "grid-cols-1", "cq-md:grid-cols-2", "cq-lg:grid-cols-4", "gap-6");
  });

  it("Stack hướng ngang, căn giữa, giãn hai đầu", () => {
    const { container } = render(<Stack direction="row" align="center" justify="between" gap="sm" />);
    expect(container.firstChild).toHaveClass("flex", "flex-row", "items-center", "justify-between", "gap-2");
  });
});

describe("Card / PageHeader", () => {
  it("Card có tiêu đề dạng heading", () => {
    render(<Card><CardHeader><CardTitle>Hóa đơn</CardTitle></CardHeader><CardContent>…</CardContent></Card>);
    expect(screen.getByRole("heading", { name: "Hóa đơn", level: 2 })).toBeInTheDocument();
  });

  it("PageHeader đánh dấu mô tả để ẩn được theo tùy chọn người dùng", () => {
    render(<PageHeader title="Hồ sơ" description="Danh sách hồ sơ" />);
    expect(screen.getByRole("heading", { level: 1, name: "Hồ sơ" })).toBeInTheDocument();
    expect(screen.getByText("Danh sách hồ sơ")).toHaveAttribute("data-slot", "page-description");
  });

  it("PageHeader: nhóm nút được co và xuống dòng – không đẩy trang tràn ngang trên màn hẹp", () => {
    render(<PageHeader title="Tờ khai" actions={<button type="button">Lọc</button>} />);
    const actions = screen.getByRole("button", { name: "Lọc" }).parentElement!;
    expect(actions).toHaveClass("flex-wrap", "max-w-full", "min-w-0");
    expect(actions).not.toHaveClass("shrink-0");
  });
});

describe("Badge / StatusBadge", () => {
  it("Badge dùng màu theo tone", () => {
    render(<Badge tone="danger">Lỗi</Badge>);
    expect(screen.getByText("Lỗi")).toHaveClass("bg-danger-subtle", "text-danger-subtle-fg");
  });

  it.each(Object.keys(STATUS_META) as Status[])("StatusBadge %s luôn có chữ (không chỉ dựa vào màu)", (status) => {
    render(<StatusBadge status={status} />);
    const el = document.querySelector(`[data-status="${status}"]`);
    expect(el).toHaveTextContent(STATUS_META[status].label);
  });
});

describe("Alert / EmptyState / Skeleton", () => {
  it("Alert lỗi dùng role=alert, thông tin dùng role=status", () => {
    render(<><Alert tone="danger" title="Thiếu cước" /><Alert tone="info" title="Đang xử lý" /></>);
    expect(screen.getByRole("alert")).toHaveTextContent("Thiếu cước");
    expect(screen.getByRole("status")).toHaveTextContent("Đang xử lý");
  });

  it("Skeleton ẩn với trình đọc màn hình", () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("không vi phạm a11y", async () => {
    const { container } = render(
      <main>
        <PageHeader title="Tổng quan" description="Mô tả" />
        <Card><CardHeader><CardTitle>Thẻ</CardTitle></CardHeader></Card>
        <StatusBadge status="CONFLICT" />
        <Alert tone="warning" title="Lưu ý">Còn 3 trường nghi ngờ</Alert>
        <EmptyState title="Chưa có hồ sơ" description="Tạo hồ sơ đầu tiên" />
      </main>,
    );
    await expectNoA11yViolations(container);
  });
});

describe("Badge – cỡ, chấm, icon; trạng thái dùng chung", () => {
  it("ba cỡ; dot và icon chỉ để trang trí", () => {
    const { container } = render(
      <>
        <Badge size="sm">Nhỏ</Badge>
        <Badge>Vừa</Badge>
        <Badge size="lg" dot icon={<svg />}>Lớn</Badge>
      </>,
    );
    expect(screen.getByText("Nhỏ")).toHaveClass("text-[0.6875rem]");
    expect(screen.getByText("Vừa")).toHaveClass("text-xs");
    const lg = screen.getByText("Lớn");
    expect(lg).toHaveClass("text-sm");
    expect(lg.querySelectorAll("[aria-hidden=true]")).toHaveLength(2);
    expect(container.querySelector("svg")!.parentElement).toHaveAttribute("aria-hidden", "true");
  });

  it("trạng thái hồ sơ và tờ khai nằm chung trong StatusBadge, đủ nhãn VI + EN", () => {
    const keys = Object.keys(STATUS_META) as Status[];
    for (const k of ["DOSSIER_DRAFT", "DOSSIER_APPROVED", "DOSSIER_CLEARED", "CUSTOMS_READY", "CUSTOMS_INSPECTING"] as const) expect(keys).toContain(k);
    render(<StatusBadge status="DOSSIER_APPROVED" />);
    expect(screen.getByText("Đã duyệt, chờ truyền")).toHaveAttribute("data-status", "DOSSIER_APPROVED");
  });
});

describe("StatusBadge – trạng thái chứng từ + icon", () => {
  it("DOC_READING/DOC_DONE có nhãn tiếng Việt; icon thay chấm màu khi truyền vào", () => {
    const { container } = render(
      <>
        <StatusBadge status="DOC_READING" icon={<svg data-testid="spin" />} />
        <StatusBadge status="DOC_DONE" />
      </>,
    );
    expect(screen.getByText("AI đang đọc")).toBeInTheDocument();
    expect(screen.getByText("Đã đọc")).toBeInTheDocument();
    expect(screen.getByTestId("spin")).toBeInTheDocument();
    expect(container.querySelector('[data-status="DOC_READING"]')).toBeTruthy();
  });
});
