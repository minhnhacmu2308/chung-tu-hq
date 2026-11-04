// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DossierDraft } from "@kb/contracts";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { QuickFillCard } from "./quick-fill-card";

const T = { timeout: 8000 };
beforeEach(() => resetDb());

describe("Điền nhanh – Tạo hồ sơ", () => {
  it("sao chép từ hồ sơ cũ: chọn hồ sơ → gửi gợi ý thông tin form, báo số ô đã điền; không vi phạm a11y", async () => {
    const dossiers = getDb().dossiers;
    const old = dossiers[0]!;
    const onApply = vi.fn((_d: DossierDraft) => 6);
    const { container } = renderWithProviders(<QuickFillCard dossiers={dossiers} loading={false} onApply={onApply} />);
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("button", { name: "Sao chép từ hồ sơ cũ" }));
    const dialog = await screen.findByRole("dialog", undefined, T);
    expect(within(dialog).getByRole("button", { name: "Sao chép" })).toHaveProperty("disabled", true);
    await userEvent.click(within(dialog).getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: new RegExp(old.code) }, T));
    await userEvent.click(within(dialog).getByRole("button", { name: "Sao chép" }));
    expect(onApply.mock.calls[0]![0]).toMatchObject({ direction: old.direction, partner: old.partner, typeCode: old.typeCode, fromDossier: { id: old.id, code: old.code } });
    expect(await screen.findByText(`Đã điền 6 ô theo hồ sơ ${old.code}`, undefined, T)).toBeTruthy();
  });

  it("nhờ AI điền: Enter gửi yêu cầu, nhận ra mã hồ sơ cũ + phương thức vận tải; không nhận ra gì → nhắc viết rõ hơn", async () => {
    const old = getDb().dossiers[0]!;
    const onApply = vi.fn((d: DossierDraft) => Object.keys(d).filter((k) => k !== "fromDossier").length);
    renderWithProviders(<QuickFillCard dossiers={getDb().dossiers} loading={false} onApply={onApply} />);
    const box = screen.getByRole("textbox", { name: "Yêu cầu cho AI" });
    await userEvent.type(box, `giống ${old.code} nhưng đi máy bay{Enter}`);
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1), T);
    expect(onApply.mock.calls[0]![0]).toMatchObject({ transportMode: "AIR", partner: old.partner, fromDossier: { code: old.code } });
    expect(await screen.findByText(new RegExp(`theo hồ sơ ${old.code}`), undefined, T)).toBeTruthy();

    await userEvent.clear(box);
    await userEvent.type(box, "abc{Enter}");
    expect(await screen.findByText("AI chưa nhận ra thông tin nào", undefined, T)).toBeTruthy();
  });
  it("danh sách hồ sơ tải lỗi → hộp sao chép báo lỗi kèm nút Thử lại (tải lại thật)", async () => {
    const onRetry = vi.fn();
    renderWithProviders(<QuickFillCard dossiers={undefined} loading={false} failed onRetry={onRetry} onApply={() => 0} />);
    await userEvent.click(screen.getByRole("button", { name: "Sao chép từ hồ sơ cũ" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("combobox")).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Thử lại" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
