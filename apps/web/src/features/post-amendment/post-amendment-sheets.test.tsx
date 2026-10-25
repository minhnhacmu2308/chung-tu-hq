// @vitest-environment jsdom
// Bước 7 theo tờ khai nhánh: AMA của tờ ?branch=k ("Tờ k/N – số tờ khai …"), client gọi đúng tờ; sửa chỉ tiêu chung → cảnh báo
// + nút nhân bản sang các tờ đã thông quan khác, kết quả áp dụng / bỏ qua (lý do dịch).
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@kb/ui";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostAmendment, PostAmendmentView, SubmissionView } from "@kb/contracts";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { branch, submissionOf } from "@/test/branch-submission";
import { PostAmendmentStep } from "./post-amendment-step";

const api = vi.hoisted(() => ({ sub: null as SubmissionView | null, view: vi.fn(), copy: vi.fn(), search: "", toast: vi.fn() }));
vi.mock("@kb/ui", async (orig) => ({ ...(await orig<typeof import("@kb/ui")>()), toast: (...a: unknown[]) => api.toast(...a) }));
vi.mock("@/api/customs", async (orig) => ({ ...(await orig<typeof import("@/api/customs")>()), getSubmission: async () => api.sub! }));
vi.mock("@/api/post-amendment", async (orig) => ({
  ...(await orig<typeof import("@/api/post-amendment")>()),
  getPostAmendmentView: (...a: unknown[]) => api.view(...a),
  copyPostAmendmentHeader: (...a: unknown[]) => api.copy(...a),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers/dos_028",
  useSearchParams: () => new URLSearchParams(api.search),
}));

const T = { timeout: 5000 };
const draft: PostAmendment = {
  id: "pa2", dossierId: "dos_028", seq: 1, status: "DRAFT", header: { TK_IMT: "0909" }, lines: [],
  createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z",
};
const viewOf = (commonEdits: string[]): PostAmendmentView =>
  ({ current: draft, history: [], contracts: [], sourceLines: [{ lineNo: 1, hsCode: "84821000", description: "Vòng bi" }], commonEdits }) as unknown as PostAmendmentView;

beforeEach(() => {
  resetDb();
  api.sub = submissionOf([branch(1, 3, "CLEARED"), branch(2, 3, "POST_EDITING"), branch(3, 3, "PRE_DECLARED")]);
  api.view.mockReset().mockResolvedValue(viewOf(["TK_IMT"]));
  api.copy.mockReset().mockResolvedValue({ applied: [1], skipped: [{ no: 3, reason: "NOT_CLEARED" }] });
  api.search = "step=post&branch=2&sub=pick";
  api.toast.mockReset();
});

const dossier = () => getDb().dossiers.find((d) => d.id === "dos_028")!;

describe("Bước 7 – lô 3 tờ", () => {
  it("AMA của tờ 2: tiêu đề 'Tờ 2/3 – số tờ khai …', xem bản khai tờ 2; cảnh báo chỉ tiêu chung + nhân bản; a11y", async () => {
    const { container } = renderWithProviders(<PostAmendmentStep dossier={dossier()} goTo={vi.fn()} />);
    expect(await screen.findByText("Tờ 2/3 – số tờ khai 107624410322", {}, T)).toBeTruthy();
    expect(api.view).toHaveBeenCalledWith("dos_028", 2);
    expect(screen.getByText("Chỉ tiêu chung – tờ 1, 3 vẫn giữ giá trị cũ")).toBeTruthy();
    expect(screen.getByText(/Số điện thoại/)).toBeTruthy();
    expect(screen.getByText("Tờ 3 chưa thông quan – chưa lập được bản khai bổ sung.")).toBeTruthy();
    await userEvent.click(await screen.findByRole("button", { name: "Tạo AMA cùng nội dung cho các tờ đã thông quan khác" }, T));
    expect(api.copy).toHaveBeenCalledWith("dos_028", { fromBranch: 2, keys: ["TK_IMT"] });
    expect(await screen.findByText("Đã áp dụng cho tờ 1 – mỗi bản vẫn phê duyệt và khai riêng.", {}, T)).toBeTruthy();
    expect(screen.getByText("Tờ 3: chưa thông quan")).toBeTruthy();
    await expectNoA11yViolations(container);
  }, 20_000);

  it("đổi tờ → kết quả nhân bản của tờ trước không còn hiện", async () => {
    api.sub = submissionOf([branch(1, 3, "POST_EDITING"), branch(2, 3, "POST_EDITING"), branch(3, 3, "PRE_DECLARED")]);
    // Đổi ?branch= rồi vẽ lại (router giả không tự vẽ lại): nút phụ của test bật lại khung.
    function Harness() {
      const [, setN] = useState(0);
      return (
        <>
          <Button onClick={() => { api.search = "step=post&branch=1&sub=pick"; setN((n) => n + 1); }}>sheet-1</Button>
          <PostAmendmentStep dossier={dossier()} goTo={vi.fn()} />
        </>
      );
    }
    renderWithProviders(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: "Tạo AMA cùng nội dung cho các tờ đã thông quan khác" }, T));
    expect(await screen.findByText("Đã áp dụng cho tờ 1 – mỗi bản vẫn phê duyệt và khai riêng.", {}, T)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "sheet-1" }));
    await screen.findByText("Tờ 1/3 – số tờ khai 107624410321", {}, T);
    expect(screen.queryByText(/Đã áp dụng cho tờ/)).toBeNull();
  }, 20_000);

  it("nhân bản không áp dụng được tờ nào → thông báo riêng, không báo đã nhân bản", async () => {
    api.copy.mockResolvedValue({ applied: [], skipped: [{ no: 1, reason: "NOT_CLEARED" }, { no: 3, reason: "NOT_CLEARED" }] });
    renderWithProviders(<PostAmendmentStep dossier={dossier()} goTo={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Tạo AMA cùng nội dung cho các tờ đã thông quan khác" }, T));
    await screen.findByText("Chưa áp dụng được cho tờ nào.", {}, T);
    expect(api.toast).toHaveBeenCalledWith({ tone: "warning", title: "Chưa nhân bản được sang tờ nào" });
    expect(api.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Đã nhân bản sửa chỉ tiêu chung" }));
  }, 20_000);

  it("không sửa chỉ tiêu chung → không cảnh báo", async () => {
    api.view.mockResolvedValue(viewOf([]));
    renderWithProviders(<PostAmendmentStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByText("Tờ 2/3 – số tờ khai 107624410322", {}, T);
    expect(screen.queryByText(/Chỉ tiêu chung/)).toBeNull();
  }, 20_000);

  it("vắng ?branch= → mở tờ đang sửa sau thông quan", async () => {
    api.search = "step=post";
    renderWithProviders(<PostAmendmentStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByText("Tờ 2/3 – số tờ khai 107624410322", {}, T);
    expect(api.view).toHaveBeenCalledWith("dos_028", 2);
  }, 20_000);
});

describe("Bước 7 – lô 1 tờ", () => {
  it("không ghi 'Tờ 1/1', xem bản khai tờ 1", async () => {
    api.sub = submissionOf([branch(1, 1, "POST_EDITING")]);
    api.search = "step=post&sub=pick";
    renderWithProviders(<PostAmendmentStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByText("Bản khai bổ sung lần 1", {}, T);
    expect(screen.queryByText(/Tờ 1\/1/)).toBeNull();
    expect(api.view).toHaveBeenCalledWith("dos_028", 1);
  }, 20_000);
});
