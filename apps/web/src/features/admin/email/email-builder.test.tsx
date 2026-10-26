// @vitest-environment jsdom
// Trình soạn email: thêm khối, sửa nội dung, chèn biến, xóa khối; xem trước dựng đúng HTML (biến thay theo người nhận mẫu).
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { EmailBuilder, type EmailDraft } from "./email-builder";

function Harness() {
  const [v, setV] = useState<EmailDraft>({ subject: "Chào {{orgName}}", preheader: "", blocks: [] });
  return <EmailBuilder value={v} onChange={setV} signature={[{ id: "s", type: "text", text: "Đội KhaiBáo AI", align: "left" }]} />;
}
const preview = () => screen.getByTitle("Xem trước email").getAttribute("srcdoc") ?? "";

describe("EmailBuilder", () => {
  it("thêm đoạn văn → gõ + chèn biến → xem trước thay biến, có chữ ký; thêm nút; xóa khối", async () => {
    const { container } = renderWithProviders(<Harness />);
    expect(screen.getByText(/Chưa có khối nào/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Đoạn văn" }));
    const area = screen.getByRole("textbox", { name: /Nội dung/ });
    await userEvent.type(area, "Xin chào ");
    await userEvent.click(screen.getByRole("button", { name: "{{name}}" }));
    expect((area as HTMLTextAreaElement).value).toBe("Xin chào {{name}}");
    expect(preview()).toContain("Xin chào Nguyễn Văn An");
    expect(preview()).toContain("Đội KhaiBáo AI");
    await userEvent.click(screen.getByRole("button", { name: "Xong" }));

    await userEvent.click(screen.getByRole("button", { name: "Nút bấm" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Chữ trên nút" }), "Đăng nhập");
    expect(preview()).toContain("Đăng nhập");
    const list = screen.getByRole("list", { name: "Nội dung email" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    await expectNoA11yViolations(container);

    await userEvent.click(screen.getByRole("button", { name: "Xóa khối – Khối 1: Đoạn văn" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(preview()).not.toContain("Xin chào");
  });
});
