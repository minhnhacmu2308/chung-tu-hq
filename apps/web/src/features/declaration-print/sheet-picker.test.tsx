// @vitest-environment jsdom
// Thanh chọn tờ khai nhánh (lô > 50 dòng) + ghi chú chỉ tiêu chung; bản in đổi dòng hàng theo tờ đang chọn.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/mocks/db";
import { getDeclarationView } from "@/api/declaration";
import { getSubmission } from "@/api/customs";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { PrintDeclaration } from "./print-declaration";
import { SharedFieldsNote, SheetPicker } from "./sheet-picker";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers/dos_028",
  useSearchParams: () => new URLSearchParams(),
}));

const SHEETS = [
  { no: 1, of: 3, lineFrom: 1, lineTo: 50 },
  { no: 2, of: 3, lineFrom: 51, lineTo: 100 },
  { no: 3, of: 3, lineFrom: 101, lineTo: 120 },
];

beforeEach(() => resetDb());

describe("SheetPicker", () => {
  it("lô 1 tờ: không hiện thanh chọn tờ, không ghi chú", () => {
    const { container } = renderWithProviders(
      <>
        <SheetPicker sheets={[{ no: 1, of: 1, lineFrom: 1, lineTo: 12 }]} value={1} onChange={() => {}} />
        <SharedFieldsNote of={1} />
      </>,
    );
    expect(screen.queryByRole("radio")).toBeNull();
    expect(container.querySelector("main")!.textContent).toBe("");
  });

  it("lô 3 tờ: 3 lựa chọn \"Tờ k/3 · dòng a–b\", bấm đổi tờ; không vi phạm a11y", async () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(
      <>
        <SheetPicker sheets={SHEETS} value={1} onChange={onChange} />
        <SharedFieldsNote of={3} />
      </>,
    );
    const group = screen.getByRole("group", { name: "Chọn tờ khai" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.closest("label")!.textContent)).toEqual(["Tờ 1/3 · dòng 1–50", "Tờ 2/3 · dòng 51–100", "Tờ 3/3 · dòng 101–120"]);
    expect((radios[0] as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByRole("radio", { name: "Tờ 3/3 · dòng 101–120" }));
    expect(onChange).toHaveBeenLastCalledWith(3);
    expect(screen.getByText("Áp dụng cho cả 3 tờ khai")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it.each([
    ["en", "Sheet 2/3 · lines 51–100", "Applies to all 3 declarations"],
    ["zh", "第 2/3 份 · 第 51–100 行", "适用于全部 3 份报关单"],
  ] as const)("%s: nhãn đã dịch", (locale, option, note) => {
    renderWithProviders(
      <>
        <SheetPicker sheets={SHEETS} value={2} onChange={() => {}} />
        <SharedFieldsNote of={3} />
      </>,
      locale,
    );
    expect((screen.getByRole("radio", { name: option }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(note)).toBeTruthy();
  });
});

describe("PrintDeclaration theo tờ (hồ sơ 120 dòng dos_028)", () => {
  it("đổi tờ → đổi bảng dòng hàng (tờ 3 = dòng 101–120, in < 01 >…), ô 1.2 theo tờ, ghi chú chỉ tiêu chung", async () => {
    const view = await getDeclarationView("dos_028");
    const submission = await getSubmission("dos_028");
    const items = [...view.items].sort((a, b) => a.lineNo - b.lineNo);
    renderWithProviders(
      <PrintDeclaration dossierId="dos_028" decl={view.declaration!} items={view.items} branches={view.branches} mode="FULL" canEdit submission={submission} />,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(screen.getByText("Áp dụng cho cả 3 tờ khai")).toBeTruthy();
    const blocks = () => document.querySelectorAll("[data-paper-item]");
    const firstDesc = () => document.querySelector("[data-print-cell=\"0:HAG_CMN\"]")!.textContent;
    expect(blocks()).toHaveLength(50);
    expect(firstDesc()).toContain(items[0]!.description);
    expect(document.querySelector("[data-print-cell=\":TK_FIC\"]")!.textContent).toMatch(/ F$/);

    await userEvent.click(screen.getByRole("radio", { name: "Tờ 3/3 · dòng 101–120" }));
    expect(blocks()).toHaveLength(20);
    // VNACCS đánh số dòng lại 1..50 trên từng tờ; dòng đầu tờ 3 là dòng 101 của lô.
    expect(blocks()[0]!.textContent).toBe("< 01 >");
    expect(firstDesc()).toContain(items[100]!.description);
    // Ô 1.2 tờ 3: số nhánh 3, tổng số 3.
    expect(document.querySelector("[data-print-cell=\":TK_BNO\"]")!.textContent).toMatch(/ 3$/);
    expect(document.querySelector("[data-print-cell=\":TK_DNO\"]")!.textContent).toMatch(/ 3$/);
    // Tờ sau: số tờ khai của tờ 1 (hồ sơ mẫu chưa truyền → "—").
    expect(document.querySelector("[data-print-cell=\":TK_FIC\"]")!.textContent).toMatch(/ —$/);
  }, 60_000);
});

describe("Việc cần xử lý theo tờ", () => {
  it("thanh chọn tờ: tờ có việc hiện huy hiệu số kèm chữ cho trình đọc màn hình; không vi phạm a11y", async () => {
    const { container } = renderWithProviders(<SheetPicker sheets={SHEETS} value={1} onChange={() => {}} issues={[0, 2, 0]} />);
    expect(screen.getByRole("radio", { name: "Tờ 2/3 · dòng 51–100 2 việc cần xử lý" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Tờ 1/3 · dòng 1–50" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("en / zh: chữ của huy hiệu đã dịch", () => {
    renderWithProviders(<SheetPicker sheets={SHEETS} value={1} onChange={() => {}} issues={[0, 2, 0]} />, "en");
    expect(screen.getByRole("radio", { name: "Sheet 2/3 · lines 51–100 2 items need attention" })).toBeTruthy();
  });

  it("lỗi Hải quan của tờ 2 (dòng 3 theo tờ): panel tờ 2 dòng 3 hiện lỗi, tờ 1 dòng 3 không; huy hiệu trên tờ 2", async () => {
    const view = await getDeclarationView("dos_028");
    const lot = await getSubmission("dos_028");
    const rejection = { operation: "IDA" as const, at: "2026-10-24T03:00:00.000Z", errors: [{ code: "E1004", field: "CMD", line: 3, message: "Mã HS tờ hai không tồn tại", solution: "Sửa mã HS" }] };
    const submission = { ...lot, branches: [1, 2, 3].map((no) => ({ ...(lot.branches[no - 1] ?? lot.branches[0]!), no, of: 3, rejection: no === 2 ? rejection : null })) };
    renderWithProviders(
      <PrintDeclaration dossierId="dos_028" decl={view.declaration!} items={view.items} branches={view.branches} mode="FULL" canEdit submission={submission} />,
    );
    expect(screen.getByRole("radio", { name: /^Tờ 2\/3 · dòng 51–100 \d+ việc cần xử lý$/ })).toBeTruthy();

    await userEvent.click(document.querySelector<HTMLElement>('[data-print-cell="2:HAG_CMD"]')!);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.queryByText(/Mã HS tờ hai không tồn tại/)).toBeNull();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("radio", { name: /^Tờ 2\/3/ }));
    await userEvent.click(document.querySelector<HTMLElement>('[data-print-cell="2:HAG_CMD"]')!);
    expect(await screen.findByText(/Mã HS tờ hai không tồn tại/, { selector: "[role=dialog] *" })).toBeTruthy();
  }, 60_000);
});
