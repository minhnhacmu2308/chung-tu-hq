// @vitest-environment jsdom
// Bảng "Xác nhận mã HS" × danh mục hàng hóa (ADR 0015): thẻ mã nối + tên của mặt hàng đã gắn; dòng "Mã lạ" → "Chọn mặt hàng"
// (tìm mọi mã / tạo mặt hàng mới) → gắn xong thì badge mất. VIEWER không có thao tác; dòng khóa → báo lỗi trong hộp.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { AgentStep } from "./agent-step";

// Cả bộ web chạy song song trên máy/CI chậm: render bảng + hộp + axe có thể mất > 8 s → hạn rộng, chỉ hết hạn khi thật sự hỏng.
const T = { timeout: 20_000 };

function setup() {
  resetDb();
  const db = getDb();
  const run = db.agentRuns[0]!;
  const dossier = db.dossiers.find((d) => d.id === run.dossierId)!;
  dossier.status = "NEEDS_REVIEW";
  const lines = db.lineItems.filter((i) => i.dossierId === dossier.id);
  const [linked, unknown] = [lines[0]!, lines[1]!];
  linked.catalogItem = { id: "prd_seed_1", itemNo: "MH-000001", name: "Vòng bi cầu 6205-2RS, đường kính trong 25 mm" };
  delete linked.unknownCode;
  delete unknown.catalogItem;
  unknown.unknownCode = true;
  return { dossier, unknown };
}

/** Mở hộp "Chọn mặt hàng": ô bảng dựng lại khi dữ liệu nền (phiên, gợi ý danh mục) tải xong → bấm lại nếu lần bấm rơi vào nút cũ. */
async function openLink(lineNo: number, buttonName = `Chọn mặt hàng cho dòng ${lineNo}`): Promise<HTMLElement> {
  // Nút chỉ có khi phiên (vai trò) đã tải: chờ nút xuất hiện rồi mới bấm; lấy lại nút ngay trước mỗi lần bấm.
  // getByRole rất chậm trên bảng 20 dòng khi máy bận → chờ nút bằng aria-label, dò hộp bằng selector rẻ; chỉ bấm lại khi hộp chưa mở.
  await screen.findByLabelText(buttonName, undefined, T);
  await waitFor(async () => {
    if (!document.querySelector("[role=dialog]")) await userEvent.click(await screen.findByLabelText(buttonName, undefined, T));
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
  }, T);
  return screen.findByRole("dialog", undefined, T);
}

describe("AgentStep – mặt hàng danh mục trên dòng hàng", () => {
  beforeEach(() => vi.useRealTimers());

  it("thẻ mã nối · tên; dòng mã lạ có badge + Chọn mặt hàng → tìm theo mã kho → gắn → badge mất; không vi phạm a11y", async () => {
    const { dossier, unknown } = setup();
    const { container } = renderWithProviders(<AgentStep dossier={dossier} goTo={vi.fn()} />);
    expect(await screen.findByText("MH-000001 · Vòng bi cầu 6205-2RS, đường kính trong 25 mm", undefined, T)).toBeTruthy();
    expect(screen.getAllByText("Mã lạ")).toHaveLength(1);
    await screen.findByRole("button", { name: `Chọn mặt hàng cho dòng ${unknown.lineNo}` }, T);
    await expectNoA11yViolations(container);

    const dialog = await openLink(unknown.lineNo);
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Mặt hàng trong danh mục" }));
    const box = await screen.findByPlaceholderText("Tìm kiếm…", {}, T);
    await userEvent.type(box, "VT0013");
    await userEvent.click(await screen.findByRole("option", { name: /Vòng bi cầu 6308ZZ/ }, T));
    await userEvent.click(within(dialog).getByRole("button", { name: "Gắn mặt hàng" }));

    await waitFor(() => expect(getDb().lineItems.find((i) => i.id === unknown.id)!.catalogItem?.id).toBe("prd_seed_2"), T);
    await waitFor(() => expect(screen.queryByText("Mã lạ")).toBeNull(), T);
    expect(await screen.findByText("MH-000002 · Vòng bi cầu 6308ZZ, đường kính trong 40 mm", undefined, T)).toBeTruthy();
  }, 60_000);

  it("Tạo mặt hàng mới: tên điền sẵn theo dòng → tạo + gắn (Quản trị tạo thẳng)", async () => {
    const { dossier, unknown } = setup();
    renderWithProviders(<AgentStep dossier={dossier} goTo={vi.fn()} />);
    const dialog = await openLink(unknown.lineNo);
    await userEvent.click(within(dialog).getByRole("radio", { name: "Tạo mặt hàng mới" }));
    expect((within(dialog).getByLabelText(/^Tên mặt hàng/) as HTMLInputElement).value).toBe(unknown.description);
    await userEvent.click(within(dialog).getByRole("button", { name: "Tạo và gắn" }));
    await waitFor(() => expect(getDb().lineItems.find((i) => i.id === unknown.id)!.catalogItem?.name).toBe(unknown.description), T);
    await waitFor(() => expect(screen.queryByText("Mã lạ")).toBeNull(), T);
  }, 60_000);

  it("tờ khai đã khóa → lỗi hiện trong hộp, dòng vẫn là mã lạ", async () => {
    const { dossier, unknown } = setup();
    renderWithProviders(<AgentStep dossier={dossier} goTo={vi.fn()} />);
    const dialog = await openLink(unknown.lineNo);
    getDb().dossiers.find((d) => d.id === dossier.id)!.status = "SUBMITTED";
    await userEvent.click(within(dialog).getByRole("radio", { name: "Tạo mặt hàng mới" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Tạo và gắn" }));
    expect(await within(dialog).findByText(/mở lại tờ khai trước khi đổi mặt hàng/, undefined, T)).toBeTruthy();
    expect(getDb().lineItems.find((i) => i.id === unknown.id)!.unknownCode).toBe(true);
  }, 60_000);

  it.each([
    ["en", "Unknown code", "Choose catalog item for line {n}", "Create a new item"],
    ["zh", "未知编码", "为第 {n} 行选择商品", "新建商品"],
  ] as const)("ngôn ngữ %s: badge, nút, hộp chọn đã dịch", async (locale, badge, aria, create) => {
    const { dossier, unknown } = setup();
    renderWithProviders(<AgentStep dossier={dossier} goTo={vi.fn()} />, locale);
    expect(await screen.findByText(badge, undefined, T)).toBeTruthy();
    const name = aria.replace("{n}", String(unknown.lineNo));
    await openLink(unknown.lineNo, name);
    expect(within(screen.getByRole("dialog")).getByRole("radio", { name: create })).toBeTruthy();
  }, 60_000);

  it("VIEWER: thấy badge Mã lạ nhưng không có nút Chọn mặt hàng", async () => {
    const { dossier } = setup();
    getDb().currentUserId = getDb().members.find((m) => m.role === "VIEWER")!.id;
    renderWithProviders(<AgentStep dossier={dossier} goTo={vi.fn()} />);
    expect(await screen.findByText("Mã lạ", undefined, T)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Chọn mặt hàng cho dòng/ })).toBeNull();
  }, 60_000);
});
