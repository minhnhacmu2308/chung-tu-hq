import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "./dialog.js";
import { Button } from "./button.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./overlay.js";

describe("Tabs", () => {
  const ui = (
    <Tabs defaultValue="inv">
      <TabsList aria-label="Chứng từ">
        <TabsTrigger value="inv">Invoice</TabsTrigger>
        <TabsTrigger value="bl">B/L</TabsTrigger>
      </TabsList>
      <TabsContent value="inv">Nội dung invoice</TabsContent>
      <TabsContent value="bl">Nội dung B/L</TabsContent>
    </Tabs>
  );

  it("chuyển tab bằng click", async () => {
    render(ui);
    await userEvent.click(screen.getByRole("tab", { name: "B/L" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Nội dung B/L");
  });

  it("chuyển tab bằng phím mũi tên", async () => {
    render(ui);
    screen.getByRole("tab", { name: "Invoice" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "B/L" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("Dialog", () => {
  function setup(props: Partial<Parameters<typeof DialogContent>[0]> = {}, root: Partial<Parameters<typeof Dialog>[0]> = {}) {
    render(
      <Dialog {...root}>
        <DialogTrigger asChild><Button>Thêm mới</Button></DialogTrigger>
        <DialogContent title="Thêm mới báo cáo" {...props}>
          <p>Nội dung</p>
          <DialogFooter><Button>Lưu</Button></DialogFooter>
        </DialogContent>
      </Dialog>,
    );
  }

  it("mở bằng trigger, có tiêu đề, đóng bằng nút Đóng và Escape", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Thêm mới" }));
    const dialog = screen.getByRole("dialog", { name: "Thêm mới báo cáo" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Đóng" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Thêm mới" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("chuyển cửa sổ ↔ panel bên phải, báo ra ngoài để lưu lựa chọn", async () => {
    const onPresentationChange = vi.fn();
    setup({}, { onPresentationChange });
    await userEvent.click(screen.getByRole("button", { name: "Thêm mới" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-presentation", "modal");
    expect(within(dialog).getByRole("button", { name: "Hiển thị dạng cửa sổ" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(within(dialog).getByRole("button", { name: "Hiển thị dạng panel bên phải" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("data-presentation", "panel");
    expect(onPresentationChange).toHaveBeenCalledWith("panel");
  });

  it("đổi cửa sổ ↔ panel KHÔNG làm mất dữ liệu đang nhập", async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent title="Form">
          <input aria-label="Ghi chú" />
        </DialogContent>
      </Dialog>,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Ghi chú" }), "đang gõ dở");
    await userEvent.click(screen.getByRole("button", { name: "Hiển thị dạng panel bên phải" }));
    expect(screen.getByRole("textbox", { name: "Ghi chú" })).toHaveValue("đang gõ dở");
    await userEvent.click(screen.getByRole("button", { name: "Hiển thị dạng cửa sổ" }));
    expect(screen.getByRole("textbox", { name: "Ghi chú" })).toHaveValue("đang gõ dở");
  });

  it("dạng cửa sổ: aria-modal, giữ focus trong dialog (Tab không thoát ra ngoài)", async () => {
    render(
      <>
        <button type="button">Ngoài</button>
        <Dialog defaultOpen>
          <DialogContent title="Giữ focus"><input aria-label="Ô 1" /></DialogContent>
        </Dialog>
      </>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    for (let i = 0; i < 6; i++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("chỉ khóa cuộn trang khi cửa sổ ĐANG MỞ; dialog đóng hoặc dạng panel thì trang vẫn cuộn được", async () => {
    setup();
    expect(document.body.style.overflow).toBe("");
    await userEvent.click(screen.getByRole("button", { name: "Thêm mới" }));
    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.click(screen.getByRole("button", { name: "Hiển thị dạng panel bên phải" }));
    expect(document.body.style.overflow).toBe("");
    await userEvent.click(screen.getByRole("button", { name: "Hiển thị dạng cửa sổ" }));
    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("");
  });

  it("cửa sổ lồng nhau: đóng cửa sổ con vẫn khóa cuộn, đóng hết mới trả lại cuộn trang", async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent title="Cha">
          <Dialog>
            <DialogTrigger asChild><Button>Mở con</Button></DialogTrigger>
            <DialogContent title="Con">con</DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.click(screen.getByRole("button", { name: "Mở con" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Con" })).getByRole("button", { name: "Đóng" }));
    expect(screen.getByRole("dialog", { name: "Cha" })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.click(within(screen.getByRole("dialog", { name: "Cha" })).getByRole("button", { name: "Đóng" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  it("dạng panel không chặn trang: không phủ nền, bấm được nút phía sau, panel vẫn mở", async () => {
    const onOutside = vi.fn();
    render(
      <>
        <Button onClick={onOutside}>Nút trên trang</Button>
        <Dialog defaultPresentation="panel">
          <DialogTrigger asChild><Button>Mở panel</Button></DialogTrigger>
          <DialogContent title="Panel">x</DialogContent>
        </Dialog>
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Mở panel" }));
    expect(screen.getByRole("dialog", { name: "Panel" })).toHaveAttribute("data-presentation", "panel");
    expect(document.querySelector("[data-slot=dialog-overlay]")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Nút trên trang" }));
    expect(onOutside).toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Panel" })).toBeInTheDocument();
  });

  it("dạng panel là drawer đè lên trang: không đẩy trang chính (không chừa lề phải)", async () => {
    render(
      <Dialog defaultPresentation="panel">
        <DialogTrigger asChild><Button>Mở panel</Button></DialogTrigger>
        <DialogContent title="Panel">x</DialogContent>
      </Dialog>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Mở panel" }));
    expect(screen.getByRole("dialog", { name: "Panel" })).toHaveClass("inset-y-0", "right-0");
    expect(document.documentElement.style.getPropertyValue("--kb-dialog-dock")).toBe("");
    expect(document.body.style.paddingInlineEnd).toBe("");
  });

  it("drawer kéo co giãn được: phím ← rộng ra, nhớ độ rộng, nhấp đúp về mặc định; dạng cửa sổ không có tay nắm", async () => {
    window.localStorage.removeItem("kb-drawer-width:md");
    const { unmount } = render(
      <Dialog defaultOpen defaultPresentation="panel">
        <DialogContent title="Panel">x</DialogContent>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Panel" });
    const handle = within(dialog).getByRole("separator", { name: /Kéo để đổi độ rộng/ });
    await expectNoA11yViolations(dialog);
    handle.focus();
    await userEvent.keyboard("{Home}");
    expect(dialog.style.width).toBe("320px");
    await userEvent.keyboard("{ArrowLeft}");
    expect(dialog.style.width).toBe("352px");
    expect(window.localStorage.getItem("kb-drawer-width:md")).toBe("352");
    await userEvent.dblClick(handle);
    expect(dialog.style.width).toBe("");
    expect(window.localStorage.getItem("kb-drawer-width:md")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Hiển thị dạng cửa sổ" }));
    expect(within(dialog).queryByRole("separator")).toBeNull();
    unmount();
  });

  it("dạng cửa sổ: phủ nền, bấm lớp phủ thì đóng", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Thêm mới" }));
    const overlay = document.querySelector("[data-slot=dialog-overlay]")!;
    expect(overlay).not.toBeNull();
    await userEvent.click(overlay);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ẩn được nút chuyển kiểu hiển thị", async () => {
    setup({ allowPresentationToggle: false });
    await userEvent.click(screen.getByRole("button", { name: "Thêm mới" }));
    expect(screen.queryByRole("button", { name: "Hiển thị dạng cửa sổ" })).not.toBeInTheDocument();
  });

  it("không vi phạm a11y khi mở", async () => {
    setup({ description: "Nhập thông tin báo cáo" });
    await userEvent.click(screen.getByRole("button", { name: "Thêm mới" }));
    await expectNoA11yViolations(screen.getByRole("dialog"));
  });
});

describe("Dialog – dạng panel dùng hết chiều cao", () => {
  it("form trong dialog là cột giãn hết chỗ để DialogFooter nằm sát đáy panel", () => {
    render(
      <Dialog defaultOpen defaultPresentation="panel">
        <DialogContent title="Thêm trường">
          <form>
            <input aria-label="Mã trường" />
            <DialogFooter><Button>Thêm</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>,
    );
    const form = screen.getByRole("textbox", { name: "Mã trường" }).closest("form")!;
    const body = form.parentElement!;
    expect(body).toHaveClass("flex-1", "overflow-y-auto", "[&>form]:flex-1", "[&>form]:flex-col");
    expect(screen.getByRole("button", { name: "Thêm" }).parentElement).toHaveClass("mt-auto", "sticky", "-bottom-4");
    expect(screen.getByRole("dialog")).toHaveAttribute("data-presentation", "panel");
  });
});
