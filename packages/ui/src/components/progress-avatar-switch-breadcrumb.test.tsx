import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { UiLocaleProvider } from "../lib/i18n.js";
import { Avatar, AvatarGroup, initialsOf } from "./avatar.js";
import { Breadcrumb } from "./breadcrumb.js";
import { Field } from "./field.js";
import { Progress } from "./progress.js";
import { Switch } from "./switch.js";

describe("Progress", () => {
  it("có giá trị, nhãn và chữ phần trăm", () => {
    render(<Progress value={45} label="Đang đọc chứng từ" showValue />);
    const bar = screen.getByRole("progressbar", { name: "Đang đọc chứng từ" });
    expect(bar).toHaveAttribute("aria-valuenow", "45");
    expect(screen.getByText("45%")).toBeInTheDocument();
  });

  it("giới hạn giá trị trong [0, max]", () => {
    render(<Progress value={150} max={100} aria-label="X" />);
    expect(screen.getByRole("progressbar", { name: "X" })).toHaveAttribute("aria-valuenow", "100");
  });

  it("không xác định: không có aria-valuenow, chữ 'Đang xử lý'", () => {
    render(<Progress value={null} label="Tải lên" showValue />);
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByText("Đang xử lý")).toBeInTheDocument();
  });

  it.each(["primary", "success", "warning", "danger"] as const)("tone %s dùng token", (tone) => {
    const { container } = render(<Progress value={10} tone={tone} aria-label="X" />);
    expect(container.querySelector(`.bg-${tone}`)).not.toBeNull();
  });

  it("tiếng Anh", () => {
    render(<UiLocaleProvider locale="en"><Progress value={null} showValue label="Upload" /></UiLocaleProvider>);
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });
});

describe("Avatar", () => {
  it("lấy 2 chữ đầu của 2 từ cuối; tên đọc được", () => {
    expect(initialsOf("Lê Minh Châu")).toBe("MC");
    render(<Avatar name="Lê Minh Châu" />);
    expect(screen.getByRole("img", { name: "Lê Minh Châu" })).toHaveTextContent("MC");
  });

  it("AvatarGroup gộp phần dư thành +N có nhãn", () => {
    render(<AvatarGroup max={2} people={[{ name: "An Nguyễn" }, { name: "Bình Trần" }, { name: "Cường Lê" }, { name: "Dung Phạm" }]} />);
    const group = screen.getByRole("group");
    expect(within(group).getAllByRole("img")).toHaveLength(3);
    expect(within(group).getByRole("img", { name: "và 2 người khác" })).toHaveTextContent("+2");
  });

  it("tiếng Anh", () => {
    render(<UiLocaleProvider locale="en"><AvatarGroup max={1} people={[{ name: "A B" }, { name: "C D" }]} /></UiLocaleProvider>);
    expect(screen.getByRole("img", { name: "and 1 more" })).toBeInTheDocument();
  });
});

describe("Switch", () => {
  function Harness({ onSpy = vi.fn() }) {
    const [on, setOn] = useState(false);
    return <Switch label="Tự gửi tờ khai" description="Khi không còn lỗi BLOCKER" checked={on} onCheckedChange={(v) => { setOn(v); onSpy(v); }} />;
  }

  it("là switch có nhãn + mô tả; bật bằng click và phím Space", async () => {
    const spy = vi.fn();
    render(<Harness onSpy={spy} />);
    const sw = screen.getByRole("switch", { name: "Tự gửi tờ khai" });
    expect(sw).toHaveAccessibleDescription("Khi không còn lỗi BLOCKER");
    await userEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    sw.focus();
    await userEvent.keyboard(" ");
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("bấm vào nhãn cũng bật", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText("Tự gửi tờ khai"));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("disabled: không đổi", async () => {
    const spy = vi.fn();
    render(<Switch label="Khóa" disabled onCheckedChange={spy} />);
    await userEvent.click(screen.getByRole("switch", { name: "Khóa" }));
    expect(spy).not.toHaveBeenCalled();
  });

  it("nằm trong Field: lấy nhãn và gợi ý từ Field", () => {
    render(<Field label="Thông báo email" hint="Gửi khi có kết quả phân luồng"><Switch /></Field>);
    expect(screen.getByRole("switch", { name: "Thông báo email" })).toHaveAccessibleDescription("Gửi khi có kết quả phân luồng");
  });
});

describe("Breadcrumb", () => {
  it("mục cuối là trang hiện tại, không phải link; dấu phân cách ẩn với trình đọc", () => {
    render(<Breadcrumb items={[{ label: "Hồ sơ khai báo", href: "/ho-so" }, { label: "HS-NK-2609-021" }]} />);
    const nav = screen.getByRole("navigation", { name: "Đường dẫn" });
    expect(within(nav).getByRole("link", { name: "Hồ sơ khai báo" })).toHaveAttribute("href", "/ho-so");
    expect(within(nav).getByText("HS-NK-2609-021")).toHaveAttribute("aria-current", "page");
    expect(within(nav).queryByRole("link", { name: "HS-NK-2609-021" })).not.toBeInTheDocument();
  });

  it("nhiều mục: thu gọn phần giữa thành …, vẫn đọc được mục ẩn", () => {
    const items = ["A", "B", "C", "D", "E", "F"].map((l) => ({ label: l, href: `/${l}` }));
    render(<Breadcrumb items={items} maxItems={3} />);
    const nav = screen.getByRole("navigation");
    expect(within(nav).getAllByRole("listitem")).toHaveLength(4);
    expect(within(nav).getByText("Các mục bị ẩn: B / C / D")).toBeInTheDocument();
    expect(within(nav).getByText("F")).toHaveAttribute("aria-current", "page");
  });

  it("linkAs dùng component link riêng", () => {
    const MyLink = (p: { href: string; className?: string; children?: React.ReactNode }) => <a data-mylink {...p} />;
    render(<Breadcrumb linkAs={MyLink} items={[{ label: "Gốc", href: "/" }, { label: "Con" }]} />);
    expect(screen.getByRole("link", { name: "Gốc" })).toHaveAttribute("data-mylink");
  });

  it("tiếng Anh", () => {
    render(<UiLocaleProvider locale="en"><Breadcrumb items={[{ label: "Home", href: "/" }, { label: "X" }]} /></UiLocaleProvider>);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
  });
});

describe("a11y", () => {
  it("không vi phạm a11y", async () => {
    const { container } = render(
      <main>
        <Progress value={30} label="Tiến độ" showValue />
        <Progress value={null} aria-label="Đang chờ" />
        <Avatar name="Lê Minh Châu" />
        <AvatarGroup max={1} people={[{ name: "A B" }, { name: "C D" }]} />
        <Switch label="Bật" description="Mô tả" />
        <Breadcrumb items={[{ label: "A", href: "/a" }, { label: "B", href: "/b" }, { label: "C" }]} />
      </main>,
    );
    await expectNoA11yViolations(container);
  });
});
