// Bản in tờ khai theo ngôn ngữ giao diện: phần quanh trang giấy (thanh công cụ, khung chỉ tiêu bắt buộc) dịch; chữ/số trên trang giấy giữ kiểu Việt Nam.
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UiLocaleProvider, type UiLocale } from "@kb/ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setFormatLocale } from "@/lib/format";
import { PrintToolbar } from "./print-toolbar";
import { RequiredGapsAlert } from "./required-gaps-alert";
import { NOT_ISSUED, printValue } from "./print-state";

// vitest của apps/web chạy môi trường node, JSX biên dịch kiểu cổ điển (React.createElement) → cấp React toàn cục.
vi.stubGlobal("React", React);

const render = <P extends object>(locale: UiLocale, node: (props: P) => React.ReactNode, props: P) =>
  renderToStaticMarkup(createElement(UiLocaleProvider, { locale, children: createElement(node, props) }));

const toolbar = { pages: 2, otherFieldsId: "print-chi-tieu-khac", attentionCount: 3, onNextAttention: () => {} };

describe("PrintToolbar theo ngôn ngữ", () => {
  it("zh: nút in, ô cần xử lý, chỉ tiêu khác đã dịch", () => {
    const html = render("zh", PrintToolbar, toolbar);
    expect(html).toContain("打印 / 保存 PDF");
    expect(html).toContain("仅看待处理项（3）");
    expect(html).toContain("其他申报项");
    expect(html).toContain('aria-label="报关单打印稿"');
    expect(html).not.toContain("In / Lưu PDF");
  });
  it("en: không còn ô cần xử lý", () => {
    const html = render("en", PrintToolbar, { ...toolbar, attentionCount: 0 });
    expect(html).toContain("No fields need action");
    expect(html).toContain("Print / Save PDF");
  });
  it("vi giữ nguyên chữ cũ", () => expect(render("vi", PrintToolbar, toolbar)).toContain("Chỉ ô cần xử lý (3)"));
});

describe("RequiredGapsAlert theo ngôn ngữ", () => {
  it("en: tiêu đề và dòng hàng dịch, tên chỉ tiêu (Phụ lục II) giữ nguyên", () => {
    const gaps = [{ key: "HAG_CMD", no: "1.74", label: "Mã số hàng hóa", line: 0 }, { key: "TK_IMC", no: "1.13", label: "Mã người nhập khẩu" }];
    const html = render("en", RequiredGapsAlert, { gaps, lineNos: [1], children: "x", actionLabel: "Go", onAction: () => {} });
    expect(html).toContain("2 required fields not filled in");
    expect(html).toContain("Goods line 1: ");
    expect(html).toContain("Mã số hàng hóa");
  });
});

describe("Trang giấy luôn theo kiểu Việt Nam", () => {
  afterEach(() => setFormatLocale("vi"));
  it("ngày / số / số tờ khai chưa cấp không đổi khi giao diện tiếng Trung", () => {
    setFormatLocale("zh");
    expect(printValue({ key: "TK_A09", input: "date" }, "2026-10-12")).toBe("12/10/2026");
    expect(printValue({ key: "TK_X", input: "number" }, "20850.5")).toBe("20.850,5");
    expect(printValue({ key: "TK_ICN", input: "text" }, "")).toBe(NOT_ISSUED);
  });
});
