// Bước 7 (AMA) theo ngôn ngữ giao diện: bước ① render ở zh/en, nhãn bước nhỏ / lý do chặn duyệt / nút chính theo locale.
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UiLocaleProvider, type UiLocale } from "@kb/ui";
import type { PostAmendment, PostAmendmentView } from "@kb/contracts";
import { describe, expect, it, vi } from "vitest";
import type { SubmissionView } from "@/api/customs";
import type { AmaStepCtx } from "./ama-context";
import { amaPrimaryAction, amaSubSteps, approveBlockers, importCompareRows, reasonLayout } from "./ama-wizard";
import { PickLines } from "./pick-lines";

vi.stubGlobal("React", React);

const a: PostAmendment = {
  id: "pa1", dossierId: "dos_018", seq: 1, status: "DRAFT", header: {}, lines: [{ id: "l1", ran: 1, values: {}, manual: [] }],
  createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z",
};
const view = {
  current: a, history: [], contracts: [],
  sourceLines: [{ lineNo: 1, hsCode: "84713020", description: "Máy tính xách tay" }, { lineNo: 2, hsCode: "", description: "Chuột" }, { lineNo: 3, hsCode: "85044090", description: "Sạc" }],
} as unknown as PostAmendmentView;
const ctx: AmaStepCtx = {
  dossierId: "dos_018", kind: "IDA", a, view, submission: {} as SubmissionView, editable: true, canEdit: true, fourEyes: false, refresh: () => {}, goSub: () => {},
};

const render = (locale: UiLocale) =>
  renderToStaticMarkup(
    createElement(QueryClientProvider, { client: new QueryClient() }, createElement(UiLocaleProvider, { locale, children: createElement(PickLines, { ctx }) })),
  );

describe("PickLines theo ngôn ngữ", () => {
  it("zh: tiêu đề, chọn tất cả, dòng đã có, nút tiếp đã dịch; mô tả hàng giữ nguyên", () => {
    const html = render("zh");
    expect(html).toContain("选择需修改的货物行");
    expect(html).toContain("全选（2 行未选）");
    expect(html).toContain("第 1 行 · HS 84713020");
    expect(html).toContain(" · 已在补充申报中");
    expect(html).toContain("已选 1 行");
    expect(html).toContain("下一步：修改内容（1 行）");
    expect(html).toContain("Máy tính xách tay");
    expect(html).not.toContain("Chọn dòng hàng cần sửa");
  });
  it("en", () => {
    const html = render("en");
    expect(html).toContain("Select goods lines to change");
    expect(html).toContain("Line 2 · HS —");
  });
});

describe("hàm thuần nhận locale", () => {
  it("bước nhỏ", () => expect(amaSubSteps("en").map((s) => s.label)).toEqual(["Select lines", "Edit content", "Reason & approval", "File with Customs"]));
  it("lý do chặn duyệt", () =>
    expect(approveBlockers({ ...a, lines: [] }, { pendingEdits: 1, fourEyes: true }, "zh")).toEqual(["尚无货物行", "未填写补充申报原因代码", "有未保存的修改", "四眼原则：请其他审批人批准"]));
  it("nút chính giữ mã nghiệp vụ AMA", () =>
    expect(amaPrimaryAction({ ...a, status: "APPROVED" }, { stage: "POST_EDITING", sending: false }, "en")).toEqual({ op: "AMA", label: "Sign & file provisional AMA" }));
  it("nhãn ô tiền thuế dịch, tên chỉ tiêu khác giữ theo @kb/contracts", () => {
    const vi = importCompareRows("vi");
    const zh = importCompareRows("zh");
    expect(zh.find((r) => r.before === "HAG_MKA")?.label).toBe("进出口税额");
    expect(zh.filter((r) => r.before !== "HAG_MKA").map((r) => r.label)).toEqual(vi.filter((r) => r.before !== "HAG_MKA").map((r) => r.label));
  });
  it("tiêu đề khối lý do", () => expect(reasonLayout("en").main.title).toBe("Amendment reason"));
});
