// @vitest-environment jsdom
// Thẻ HYS (gợi ý A02 + nút "Khai HYS"), form HYS (vượt 2 MB → Progress danger, khóa nút Gửi), hộp xác nhận khai IDA khi còn gợi ý; a11y; 3 ngôn ngữ.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HysOverview, HysSubmissionView } from "@kb/contracts";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { HysCard } from "./hys-card";
import { HysForm } from "./hys-form";
import { HysSuggestDialog } from "./hys-suggest-dialog";

const api = vi.hoisted(() => ({ overview: null as HysOverview | null, create: vi.fn(), remove: vi.fn(), update: vi.fn(), send: vi.fn() }));
vi.mock("@/api/hys", async (orig) => {
  const real = await orig<typeof import("@/api/hys")>();
  return {
    ...real, getHysOverview: async () => api.overview!, createHys: (...a: unknown[]) => api.create(...a), deleteHys: (...a: unknown[]) => api.remove(...a),
    updateHys: (...a: unknown[]) => api.update(...a), sendHys: (...a: unknown[]) => api.send(...a),
  };
});
vi.mock("@/api/customs", async (orig) => {
  const real = await orig<typeof import("@/api/customs")>();
  return { ...real, listCertificates: async () => [{ id: "cert_1", subject: "CTY AN PHAT", issuer: "VNPT-CA", validTo: "2099-12-31", isDefault: true }] };
});
vi.mock("@/api/dossiers", async (orig) => {
  const real = await orig<typeof import("@/api/dossiers")>();
  return { ...real, listDocuments: async () => [] };
});

const T = { timeout: 5000 };

const submission = (over: Partial<HysSubmissionView> = {}): HysSubmissionView => ({
  id: "hys_1", seq: 1, procedureCode: "A02", customsOffice: "02CI", processingUnit: "00", phone: "", internalRef: "HS-0001", note: null,
  purpose: null, status: "DRAFT", attempt: 0, receiptNo: null, registeredOn: null, reject: null, fill: null, files: [], issues: [], sentAt: null,
  ...over,
});

const overview = (over: Partial<HysOverview> = {}): HysOverview => ({
  submissions: [],
  suggestions: [{ code: "A02", rule: "G1", fieldNo: "1.35" }],
  lotEditable: true,
  supplementHint: false,
  attachmentSlots: [],
  defaults: { customsOffice: "02CI", processingUnit: "00", internalRef: "HS-0001" },
  ...over,
});

beforeEach(() => {
  api.overview = overview();
  api.create.mockReset().mockResolvedValue(submission());
  api.remove.mockReset().mockResolvedValue(undefined);
  api.update.mockReset().mockResolvedValue(submission());
  api.send.mockReset().mockResolvedValue(submission({ status: "SENDING" }));
});

describe("HysCard", () => {
  it("hiện gợi ý A02 kèm lý do và nút 'Khai HYS'; bấm → tạo bộ với mã A02 rồi mở form; a11y", async () => {
    const { container } = renderWithProviders(<HysCard dossierId="dos_001" kind="IDA" />);
    const btn = await screen.findByRole("button", { name: "Khai HYS A02" }, T);
    expect(screen.getByText("Danh sách container chất lên tàu")).toBeTruthy();
    expect(screen.getByText("Hàng đi container – ô 1.35")).toBeTruthy();
    await expectNoA11yViolations(container);
    await userEvent.click(btn);
    expect(api.create).toHaveBeenCalledWith("dos_001", { procedureCode: "A02" });
    expect(await screen.findByRole("dialog", { name: "Bộ HYS 1" }, T)).toBeTruthy();
  }, 20_000);

  it("bộ đã nhận: số tiếp nhận, kết quả điền 1.63 kèm '(điền sau khi duyệt)'; bộ bị từ chối nêu mã lỗi", async () => {
    api.overview = overview({
      suggestions: [],
      submissions: [
        submission({ status: "ACCEPTED", receiptNo: "123456789012", registeredOn: "2026-10-26", fill: { outcome: "FILLED", slot: 1, afterApproval: true } }),
        submission({ id: "hys_2", seq: 2, status: "REJECTED", reject: [{ code: "E001", message: "Thiếu file", solution: "Bổ sung file" }] }),
      ],
    });
    const { container } = renderWithProviders(<HysCard dossierId="dos_001" kind="IDA" />);
    expect(await screen.findByText(/Số tiếp nhận 123456789012/, {}, T)).toBeTruthy();
    expect(screen.getByText(/Đã điền vào ô 1\.63, cặp 1/).textContent).toContain("(điền sau khi duyệt)");
    expect(screen.getByText("Hải quan từ chối bộ HYS 2")).toBeTruthy();
    expect(screen.getByText("E001")).toBeTruthy();
    await expectNoA11yViolations(container);
  }, 20_000);

  it("LOCKED: nhắc gọi về tất cả tờ rồi tự nhập số tiếp nhận vào ô 1.63 (hệ thống không tự điền)", async () => {
    api.overview = overview({ suggestions: [], submissions: [submission({ status: "ACCEPTED", receiptNo: "123456789012", registeredOn: "2026-10-26", fill: { outcome: "LOCKED" } })] });
    renderWithProviders(<HysCard dossierId="dos_001" kind="IDA" />);
    expect(await screen.findByText(/Gọi về tất cả tờ, rồi tự nhập số tiếp nhận 123456789012 vào ô 1.63/, {}, T)).toBeTruthy();
  }, 20_000);

  it("en / zh: tiêu đề, tên thủ tục và lý do gợi ý đã dịch", async () => {
    const en = renderWithProviders(<HysCard dossierId="dos_001" kind="EDA" />, "en");
    expect(await screen.findByText("List of containers loaded on the vessel", {}, T)).toBeTruthy();
    expect(screen.getByText("Attachment dossier (HYS)")).toBeTruthy();
    expect(screen.getByText("Containerised cargo - box 1.35")).toBeTruthy();
    expect(screen.getByRole("button", { name: "File HYS A02" })).toBeTruthy();
    en.unmount();
    renderWithProviders(<HysCard dossierId="dos_001" kind="IDA" />, "zh");
    expect(await screen.findByText("装船集装箱清单", {}, T)).toBeTruthy();
    expect(screen.getByText("电子附件档案（HYS）")).toBeTruthy();
  }, 20_000);
});

describe("HysForm", () => {
  it("tổng file vượt 2 MB → Progress tone danger, báo lỗi dung lượng, nút 'Gửi HYS' bị khóa; a11y", async () => {
    const big = submission({
      files: [{ id: "f1", documentId: null, fileName: "container-list.xlsx", mime: "application/vnd.ms-excel", sizeBytes: 3 * 1024 * 1024, source: "UPLOAD" }],
    });
    renderWithProviders(<HysForm dossierId="dos_001" kind="IDA" submission={big} documents={[]} open onOpenChange={vi.fn()} lotEditable attachmentSlots={[]} />);
    const dialog = await screen.findByRole("dialog", { name: "Bộ HYS 1" }, T);
    const bar = within(dialog).getByRole("progressbar");
    expect(bar.querySelector(".bg-danger")).toBeTruthy();
    expect(within(dialog).getByText(/vượt giới hạn/)).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Gửi HYS" }) as HTMLButtonElement).disabled).toBe(true);
    await expectNoA11yViolations(dialog);
  }, 20_000);

  it("bộ hợp lệ dưới 2 MB → Progress tone primary, nút Gửi bấm được", async () => {
    const ok = submission({ files: [{ id: "f1", documentId: null, fileName: "list.pdf", mime: "application/pdf", sizeBytes: 100_000, source: "UPLOAD" }] });
    renderWithProviders(<HysForm dossierId="dos_001" kind="IDA" submission={ok} documents={[]} open onOpenChange={vi.fn()} lotEditable attachmentSlots={[]} />);
    const dialog = await screen.findByRole("dialog", { name: "Bộ HYS 1" }, T);
    expect(within(dialog).getByRole("progressbar").querySelector(".bg-primary")).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Gửi HYS" }) as HTMLButtonElement).disabled).toBe(false);
  }, 20_000);
});

const FULL_SLOTS: HysOverview["attachmentSlots"] = [
  { slot: 1, code: "A01", receipt: "300000000001" },
  { slot: 2, code: "A02", receipt: "300000000002" },
  { slot: 3, code: "A08", receipt: "300000000003" },
];

describe("HYS – 1.63 đã đủ 3 cặp", () => {
  it("thẻ: cảnh báo đủ 3 cặp; bộ bị thay ghi 'Không còn trong ô 1.63'; bộ thay cặp nêu cặp cũ", async () => {
    api.overview = overview({
      suggestions: [],
      attachmentSlots: [FULL_SLOTS[0]!, { slot: 2, code: "A99", receipt: "300000000009" }, FULL_SLOTS[2]!],
      submissions: [
        submission({ status: "ACCEPTED", receiptNo: "300000000002", fill: { outcome: "FILLED", slot: 2 } }),
        submission({ id: "hys_2", seq: 2, procedureCode: "A99", status: "ACCEPTED", receiptNo: "300000000009", fill: { outcome: "REPLACED", slot: 2, replaced: { code: "A02", receipt: "300000000002" }, afterApproval: true } }),
      ],
    });
    const { container } = renderWithProviders(<HysCard dossierId="dos_001" kind="IDA" />);
    expect(await screen.findByText(/Ô 1\.63 đã đủ 3 số đính kèm – khi gửi bộ mới sẽ phải chọn 1 cặp để thay/, {}, T)).toBeTruthy();
    expect(screen.getAllByText("Không còn trong ô 1.63")).toHaveLength(1);
    expect(screen.getByText(/Đã thay cặp 2 \(A02 \/ 300000000002\) bằng số 300000000009/).textContent).toContain("(điền sau khi duyệt)");
    await expectNoA11yViolations(container);
  }, 20_000);

  it("thẻ: lô không còn sửa được → không cảnh báo đủ cặp", async () => {
    api.overview = overview({ lotEditable: false, attachmentSlots: FULL_SLOTS, suggestions: [] });
    renderWithProviders(<HysCard dossierId="dos_001" kind="IDA" />);
    expect(await screen.findByText("Chưa có bộ HYS nào.", {}, T)).toBeTruthy();
    expect(screen.queryByText(/khi gửi bộ mới sẽ phải chọn 1 cặp/)).toBeNull();
  }, 20_000);

  it("hộp gửi: bắt chọn cặp bị thay mới gửi được; gửi kèm replaceSlot; a11y", async () => {
    const ok = submission({ files: [{ id: "f1", documentId: null, fileName: "list.pdf", mime: "application/pdf", sizeBytes: 100_000, source: "UPLOAD" }] });
    renderWithProviders(<HysForm dossierId="dos_001" kind="IDA" submission={ok} documents={[]} open onOpenChange={vi.fn()} lotEditable attachmentSlots={FULL_SLOTS} />);
    const form = await screen.findByRole("dialog", { name: "Bộ HYS 1" }, T);
    await userEvent.click(within(form).getByRole("button", { name: "Gửi HYS" }));
    const dialog = await screen.findByRole("dialog", { name: "Gửi bộ HYS cho Hải quan" }, T);
    expect(within(dialog).getByText("Ô 1.63 đã đủ 3 số đính kèm")).toBeTruthy();
    const group = within(dialog).getByRole("radiogroup", { name: "Cặp sẽ bị thay" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    const confirm = within(dialog).getByRole("button", { name: "Ký số và gửi" }) as HTMLButtonElement;
    await within(dialog).findAllByText(/CTY AN PHAT/, {}, T);
    expect(confirm.disabled).toBe(true);
    await expectNoA11yViolations(dialog);
    await userEvent.click(within(group).getByRole("radio", { name: /Cặp 2: A02 \/ 300000000002/ }));
    expect(confirm.disabled).toBe(false);
    await userEvent.click(confirm);
    await vi.waitFor(() => expect(api.send).toHaveBeenCalledWith("dos_001", "hys_1", { certificateId: "cert_1", replaceSlot: 2 }));
  }, 20_000);

  it("hộp gửi: còn cặp trống → không hỏi cặp, gửi không kèm replaceSlot", async () => {
    const ok = submission({ files: [{ id: "f1", documentId: null, fileName: "list.pdf", mime: "application/pdf", sizeBytes: 100_000, source: "UPLOAD" }] });
    renderWithProviders(<HysForm dossierId="dos_001" kind="IDA" submission={ok} documents={[]} open onOpenChange={vi.fn()} lotEditable attachmentSlots={FULL_SLOTS.slice(0, 2)} />);
    const form = await screen.findByRole("dialog", { name: "Bộ HYS 1" }, T);
    await userEvent.click(within(form).getByRole("button", { name: "Gửi HYS" }));
    const dialog = await screen.findByRole("dialog", { name: "Gửi bộ HYS cho Hải quan" }, T);
    expect(within(dialog).queryByRole("radiogroup")).toBeNull();
    await within(dialog).findAllByText(/CTY AN PHAT/, {}, T);
    await userEvent.click(within(dialog).getByRole("button", { name: "Ký số và gửi" }));
    await vi.waitFor(() => expect(api.send).toHaveBeenCalledWith("dos_001", "hys_1", { certificateId: "cert_1" }));
  }, 20_000);
});

describe("HysForm – xóa bộ", () => {
  it("'Xóa' mở hộp xác nhận, chưa xóa; 'Hủy' đóng không xóa; 'Xóa bộ HYS' mới xóa; a11y", async () => {
    renderWithProviders(<HysForm dossierId="dos_001" kind="IDA" submission={submission()} documents={[]} open onOpenChange={vi.fn()} lotEditable attachmentSlots={[]} />);
    const dialog = await screen.findByRole("dialog", { name: "Bộ HYS 1" }, T);
    await userEvent.click(within(dialog).getByRole("button", { name: "Xóa" }));
    let confirm = await screen.findByRole("dialog", { name: "Xóa bộ HYS 1?" }, T);
    expect(api.remove).not.toHaveBeenCalled();
    await expectNoA11yViolations(confirm);
    await userEvent.click(within(confirm).getByRole("button", { name: "Hủy" }));
    expect(screen.queryByRole("dialog", { name: "Xóa bộ HYS 1?" })).toBeNull();
    expect(api.remove).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Xóa" }));
    confirm = await screen.findByRole("dialog", { name: "Xóa bộ HYS 1?" }, T);
    await userEvent.click(within(confirm).getByRole("button", { name: "Xóa bộ HYS" }));
    expect(api.remove).toHaveBeenCalledWith("dos_001", "hys_1");
  }, 20_000);
});

describe("HysSuggestDialog", () => {
  it("hai nút gọi đúng callback: 'Khai HYS trước' với mã gợi ý, 'Vẫn khai' → onProceed; a11y", async () => {
    const onDeclareHys = vi.fn();
    const onProceed = vi.fn();
    renderWithProviders(
      <HysSuggestDialog open onOpenChange={vi.fn()} op="IDA" suggestions={[{ code: "A01", rule: "G3", fieldNo: "1.45" }]} onDeclareHys={onDeclareHys} onProceed={onProceed} />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Nên khai HYS trước" }, T);
    expect(within(dialog).getByText("Tờ khai trị giá đính kèm")).toBeTruthy();
    await expectNoA11yViolations(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Khai HYS trước" }));
    expect(onDeclareHys).toHaveBeenCalledWith("A01");
    await userEvent.click(within(dialog).getByRole("button", { name: "Vẫn khai, không cần HYS" }));
    expect(onProceed).toHaveBeenCalledTimes(1);
  }, 20_000);

  it("zh: nút đã dịch", async () => {
    renderWithProviders(<HysSuggestDialog open onOpenChange={vi.fn()} op="EDA" suggestions={[]} onDeclareHys={vi.fn()} onProceed={vi.fn()} />, "zh");
    expect(await screen.findByRole("button", { name: "继续申报，无需 HYS" }, T)).toBeTruthy();
  }, 20_000);
});
