import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Sidebar, SidebarFooterButton, SidebarMobileTrigger, SidebarUser, type NavItem } from "./sidebar.js";

const ITEMS: NavItem[] = [
  { id: "overview", label: "Tổng quan", href: "/", icon: <svg /> },
  {
    id: "dossiers",
    label: "Hồ sơ khai báo",
    icon: <svg />,
    children: [
      { id: "import", label: "Nhập khẩu", href: "/ho-so/nhap" },
      { id: "export", label: "Xuất khẩu", href: "/ho-so/xuat" },
    ],
  },
  { id: "settings", label: "Thiết lập", href: "/thiet-lap", icon: <svg />, hasSubmenu: true },
];

// jsdom không điều hướng được: gọi onClick TRƯỚC rồi mới chặn mặc định – đúng thứ tự của <Link> Next.js
// (chặn trước thì Radix coi như sự kiện đã bị hủy và bỏ qua onSelect của mục menu).
function TestLink({ onClick, ...p }: ComponentProps<"a">) {
  return <a {...p} onClick={(e) => { onClick?.(e); e.preventDefault(); }} />;
}

function Harness({ initialCollapsed = false, activeId = "import", onNavigate = vi.fn() }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  return (
    <Sidebar
      brand={{ logo: "K", name: "KhaiBáo AI" }}
      items={ITEMS}
      activeId={activeId}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      onNavigate={onNavigate}
      linkAs={TestLink}
      footer={
        <>
          <SidebarFooterButton icon={<svg />} label="Giao diện" />
          <SidebarUser name="Lê Minh Châu" role="Quản trị" />
        </>
      }
    />
  );
}

describe("Sidebar", () => {
  it("là vùng điều hướng có tên; trang đang mở có aria-current", () => {
    render(<Harness />);
    const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
    expect(within(nav).getByRole("link", { name: "Nhập khẩu" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Tổng quan" })).not.toHaveAttribute("aria-current");
  });

  it("nhóm chứa trang đang mở tự mở sẵn; bấm để đóng/mở", async () => {
    render(<Harness />);
    const group = screen.getByRole("button", { name: "Hồ sơ khai báo" });
    expect(group).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(group);
    expect(group).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Nhập khẩu" })).not.toBeInTheDocument();
  });

  it("thu gọn: nhãn chỉ còn cho trình đọc màn hình, có tooltip; nút mở rộng đổi nhãn", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Thu gọn menu" }));
    const toggle = screen.getByRole("button", { name: "Mở rộng menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const overview = screen.getByRole("link", { name: "Tổng quan" });
    // Tooltip có style (không dùng title của trình duyệt) – hiện khi focus bằng bàn phím
    expect(overview).not.toHaveAttribute("title");
    overview.focus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Tổng quan");
    expect(within(overview).getByText("Tổng quan")).toHaveClass("sr-only");
  });

  it("thu gọn rồi bấm nhóm → mở rộng menu và mở nhóm đó", async () => {
    render(<Harness initialCollapsed activeId="overview" />);
    await userEvent.click(screen.getByRole("button", { name: "Hồ sơ khai báo" }));
    expect(screen.getByRole("button", { name: "Thu gọn menu" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xuất khẩu" })).toBeInTheDocument();
  });

  it("chọn mục gọi onNavigate với mục đó", async () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole("link", { name: "Thiết lập" }));
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: "settings" }));
  });

  it("chân sidebar: người dùng hiện tên + vai trò; thu gọn vẫn đọc được tên", async () => {
    render(<Harness />);
    expect(screen.getByText("Lê Minh Châu")).toBeInTheDocument();
    expect(screen.getByText("MC")).toBeInTheDocument(); // 2 chữ cuối của tên
    await userEvent.click(screen.getByRole("button", { name: "Thu gọn menu" }));
    expect(screen.getByRole("button", { name: "Lê Minh Châu, Quản trị" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Giao diện" })).toBeInTheDocument();
  });

  it.each([false, true])("không vi phạm a11y (thu gọn = %s)", async (collapsed) => {
    const { container } = render(<Harness initialCollapsed={collapsed} />);
    await expectNoA11yViolations(container);
  });
});

describe("Sidebar – màn hình nhỏ (ngăn kéo)", () => {
  function Mobile({ onNavigate = vi.fn() }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <SidebarMobileTrigger onClick={() => setOpen(true)} expanded={open} />
        <Sidebar
          brand={{ logo: "K", name: "KhaiBáo AI" }}
          items={ITEMS}
          activeId="import"
          collapsed={false}
          onCollapsedChange={() => {}}
          onNavigate={onNavigate}
          linkAs={TestLink}
          mobileOpen={open}
          onMobileOpenChange={setOpen}
        />
      </>
    );
  }

  it("nút ☰ mở ngăn kéo có tiêu đề; nút Đóng menu đóng lại", async () => {
    render(<Mobile />);
    await userEvent.click(screen.getByRole("button", { name: "Mở menu" }));
    const drawer = screen.getByRole("dialog", { name: "Điều hướng chính" });
    expect(within(drawer).getByRole("link", { name: "Nhập khẩu" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(within(drawer).getByRole("button", { name: "Đóng menu" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("chọn một mục trong ngăn kéo → điều hướng và tự đóng ngăn kéo", async () => {
    const onNavigate = vi.fn();
    render(<Mobile onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole("button", { name: "Mở menu" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: "Tổng quan" }));
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: "overview" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Escape đóng ngăn kéo; không vi phạm a11y khi mở", async () => {
    render(<Mobile />);
    await userEvent.click(screen.getByRole("button", { name: "Mở menu" }));
    await expectNoA11yViolations(screen.getByRole("dialog"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("SidebarUser làm trigger cho DropdownMenu", () => {
  it("bấm vào người dùng mở menu (props của asChild được chuyển xuống nút)", async () => {
    const { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } = await import("./menu.js");
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarUser name="Lê Minh Châu" role="Quản trị" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Đăng xuất</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const trigger = screen.getByRole("button", { name: /Lê Minh Châu/ });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await userEvent.click(trigger);
    expect(await screen.findByRole("menuitem", { name: "Đăng xuất" })).toBeInTheDocument();
  });
});

describe("Sidebar – vị trí menu", () => {
  function Positioned({ position, onNavigate = vi.fn() }: { position: "left" | "right" | "top"; onNavigate?: (i: NavItem) => void }) {
    const [collapsed, setCollapsed] = useState(false);
    return (
      <Sidebar
        position={position}
        brand={{ logo: <svg />, name: "KhaiBáo AI" }}
        items={ITEMS}
        activeId="import"
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        onNavigate={onNavigate}
        linkAs={TestLink}
        footer={<SidebarFooterButton icon={<svg />} label="Thông báo" />}
      />
    );
  }

  it("bên phải: vẫn là cột có thu gọn, viền quay về phía nội dung và hiển thị sau nội dung", async () => {
    const { container } = render(<Positioned position="right" />);
    const aside = container.querySelector("aside")!;
    expect(aside).toHaveAttribute("data-position", "right");
    expect(aside).toHaveClass("border-l", "order-last");
    await userEvent.click(screen.getByRole("button", { name: "Thu gọn menu" }));
    expect(aside).toHaveAttribute("data-collapsed", "true");
    await expectNoA11yViolations(container);
  });

  it("phía trên: thanh ngang, mục thường là link, nhóm con mở thành menu xổ và chọn được", async () => {
    const onNavigate = vi.fn();
    const { container } = render(<Positioned position="top" onNavigate={onNavigate} />);
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector("header")).toHaveAttribute("data-position", "top");
    const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
    expect(within(nav).getByRole("link", { name: "Tổng quan" })).toBeInTheDocument();
    // Không có nút thu gọn ở thanh ngang.
    expect(screen.queryByRole("button", { name: "Thu gọn menu" })).not.toBeInTheDocument();

    await userEvent.click(within(nav).getByRole("button", { name: "Hồ sơ khai báo" }));
    const item = await screen.findByRole("menuitem", { name: "Nhập khẩu" });
    expect(item).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByRole("menuitem", { name: "Xuất khẩu" }));
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: "export" }));
  });

  it("phía trên: chân menu thành nút icon có tên; không vi phạm a11y", async () => {
    const { container } = render(<Positioned position="top" />);
    expect(screen.getByRole("button", { name: "Thông báo" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
