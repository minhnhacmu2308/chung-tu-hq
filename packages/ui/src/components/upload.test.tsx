import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { UiLocaleProvider } from "../lib/i18n.js";
import { FileDropzone, FileUploadList, formatBytes, type UploadItem } from "./upload.js";

const pdf = (name = "invoice.pdf", size = 1000) => new File([new Uint8Array(size)], name, { type: "application/pdf" });
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

describe("FileDropzone", () => {
  it("vùng thả là nút truy cập được; bấm/Enter mở hộp chọn tệp", async () => {
    render(<FileDropzone onFiles={() => {}} />);
    const zone = screen.getByRole("button", { name: /Kéo thả tệp vào đây/ });
    const click = vi.spyOn(fileInput(), "click");
    zone.focus();
    await userEvent.keyboard("{Enter}");
    expect(click).toHaveBeenCalled();
  });

  it("chọn tệp hợp lệ → onFiles", async () => {
    const onFiles = vi.fn();
    render(<FileDropzone onFiles={onFiles} accept=".pdf" />);
    const f = pdf();
    await userEvent.upload(fileInput(), f);
    expect(onFiles).toHaveBeenCalledWith([f]);
  });

  it("thả tệp: nhận tệp đúng, loại tệp sai định dạng / quá dung lượng / quá số lượng và báo rõ", () => {
    const onFiles = vi.fn();
    const onReject = vi.fn();
    render(<FileDropzone onFiles={onFiles} onReject={onReject} accept=".pdf" maxSize={2000} maxFiles={1} />);
    const ok = pdf("a.pdf");
    const big = pdf("big.pdf", 5000);
    const wrong = new File(["x"], "note.txt", { type: "text/plain" });
    const extra = pdf("b.pdf");
    fireEvent.drop(screen.getByRole("button", { name: /Kéo thả/ }), { dataTransfer: { files: [ok, big, wrong, extra] } });

    expect(onFiles).toHaveBeenCalledWith([ok]);
    expect(onReject.mock.calls[0]![0].map((r: { reason: string }) => r.reason)).toEqual(["size", "type", "count"]);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("big.pdf: vượt quá");
    expect(alert).toHaveTextContent("note.txt: sai định dạng");
    expect(alert).toHaveTextContent("b.pdf: vượt quá số lượng 1 tệp");
  });

  it("đang kéo vào: đánh dấu trạng thái để highlight", () => {
    render(<FileDropzone onFiles={() => {}} />);
    const zone = screen.getByRole("button", { name: /Kéo thả/ });
    fireEvent.dragEnter(zone);
    expect(zone).toHaveAttribute("data-dragging", "true");
    fireEvent.drop(zone, { dataTransfer: { files: [] } });
    expect(zone).not.toHaveAttribute("data-dragging");
  });

  it("disabled: không nhận tệp", () => {
    const onFiles = vi.fn();
    render(<FileDropzone onFiles={onFiles} disabled />);
    const zone = screen.getByRole("button", { name: /Kéo thả/ });
    expect(zone).toBeDisabled();
    fireEvent.drop(zone, { dataTransfer: { files: [pdf()] } });
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("tiếng Anh dưới UiLocaleProvider", () => {
    render(
      <UiLocaleProvider locale="en">
        <FileDropzone onFiles={() => {}} accept=".pdf" maxSize={1024 * 1024} />
      </UiLocaleProvider>,
    );
    expect(screen.getByRole("button", { name: /Drag and drop files here/ })).toHaveAccessibleDescription(/Formats: \.pdf · Up to 1 MB per file/);
  });

  it("không vi phạm a11y", async () => {
    const { container } = render(<FileDropzone onFiles={() => {}} accept=".pdf" maxSize={10_000_000} />);
    await expectNoA11yViolations(container);
  });
});

describe("FileUploadList", () => {
  const items: UploadItem[] = [
    { id: "1", name: "INV.pdf", size: 1_572_864, status: "done" },
    { id: "2", name: "BL.pdf", size: 2048, status: "uploading", progress: 45 },
    { id: "3", name: "CO.pdf", size: 512, status: "error", error: "Mất kết nối" },
    { id: "4", name: "PL.pdf", size: 100, status: "queued" },
  ];

  it("hiện dung lượng, trạng thái, tiến độ và lỗi", () => {
    render(<FileUploadList items={items} />);
    const list = screen.getByRole("list", { name: "Tệp tải lên" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("1,5 MB");
    expect(rows[0]).toHaveTextContent("Đã tải");
    expect(within(rows[1]!).getByRole("progressbar", { name: "Tiến độ tải BL.pdf" })).toHaveAttribute("aria-valuenow", "45");
    expect(rows[2]).toHaveTextContent("Mất kết nối");
    expect(rows[3]).toHaveTextContent("Chờ tải");
  });

  it("nút Xóa / Thử lại có nhãn kèm tên tệp", async () => {
    const onRemove = vi.fn();
    const onRetry = vi.fn();
    render(<FileUploadList items={items} onRemove={onRemove} onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "Thử lại CO.pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Xóa INV.pdf" }));
    expect(onRetry).toHaveBeenCalledWith("3");
    expect(onRemove).toHaveBeenCalledWith("1");
    expect(screen.queryByRole("button", { name: "Thử lại INV.pdf" })).not.toBeInTheDocument();
  });

  it("formatBytes theo ngôn ngữ", () => {
    expect(formatBytes(1_572_864, "vi")).toBe("1,5 MB");
    expect(formatBytes(1_572_864, "en")).toBe("1.5 MB");
    expect(formatBytes(500, "vi")).toBe("500 B");
  });

  it("không vi phạm a11y", async () => {
    const { container } = render(<FileUploadList items={items} onRemove={() => {}} onRetry={() => {}} />);
    await expectNoA11yViolations(container);
  });
});
