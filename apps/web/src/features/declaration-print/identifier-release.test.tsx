// @vitest-environment jsdom
// Ô số vận đơn: chọn số định danh có sẵn (đã giữ cho hồ sơ) rồi bấm Hủy trước khi Lưu → số được trả lại kho (AVAILABLE);
// trả lại lỗi → cảnh báo số vẫn đang giữ.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { getSubmission } from "@/api/customs";
import { listIdentifiers, pollIdentifierRow, requestIdentifierBatch } from "@/api/customs-ops";
import { getDeclarationView } from "@/api/declaration";
import { getDb, resetDb, saveDb } from "@/mocks/db";
import { renderWithProviders } from "@/test/dom";
import { PrintDeclaration } from "./print-declaration";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers/dos_023",
  useSearchParams: () => new URLSearchParams(),
}));

const T = { timeout: 30_000 };

beforeEach(() => resetDb());

/** Chọn số có sẵn trong panel ô số vận đơn; trả về số đã chọn (đang giữ cho dos_023, chưa Lưu). */
async function pickPooled() {
  const b = await requestIdentifierBatch({ clientKey: "33333333-3333-4333-8333-333333333333", count: 1, request: { objectType: "1", goodsType: "1", customsOffice: "03CE", taxCode: "0316789012", companyName: "AN PHÁT" } });
  await pollIdentifierRow(b.ids[0]!);
  const no = (await listIdentifiers({ status: "AVAILABLE" })).items[0]!.identifierNo!;
  const view = await getDeclarationView("dos_023");
  const submission = await getSubmission("dos_023");
  renderWithProviders(<PrintDeclaration dossierId="dos_023" decl={view.declaration!} items={view.items} branches={view.branches} mode="FULL" canEdit submission={submission} />);
  await userEvent.click(document.querySelector<HTMLElement>(`[data-print-cell=":VD_BL1"]`)!);
  const panel = await screen.findByRole("dialog", undefined, T);
  await userEvent.click(within(panel).getByRole("button", { name: "Khai báo định danh" }));
  const dialog = await screen.findByRole("dialog", { name: "Khai báo định danh hàng hóa" }, T);
  const pool = await within(dialog).findByRole("region", { name: "Chọn số có sẵn" }, T);
  await userEvent.click(await within(pool).findByRole("button", { name: `Chọn số ${no}` }, T));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Khai báo định danh hàng hóa" })).toBeNull(), T);
  expect(screen.getAllByDisplayValue(no).length).toBeGreaterThan(0);
  expect((await listIdentifiers({ status: "USED" })).total).toBe(1);
  return no;
}

it("chọn số có sẵn → điền ô số vận đơn; Hủy trước khi Lưu → trả lại số", async () => {
  await pickPooled();
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hủy" }));
  await waitFor(async () => expect((await listIdentifiers({ status: "AVAILABLE" })).total).toBe(1), T);
}, 60_000);

it("trả lại số lỗi → cảnh báo số vẫn đang giữ, trả lại ở màn Nghiệp vụ khác", async () => {
  const no = await pickPooled();
  // Giả lập máy chủ từ chối trả lại (hồ sơ này không còn giữ số).
  getDb().identifiers!.find((r) => r.identifierNo === no)!.usedByDossierId = "dos_019";
  saveDb();
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hủy" }));
  expect(await screen.findByText(`Chưa trả lại được số định danh ${no} – số vẫn đang giữ cho hồ sơ này, trả lại ở màn Nghiệp vụ khác`, undefined, T)).toBeTruthy();
}, 60_000);
