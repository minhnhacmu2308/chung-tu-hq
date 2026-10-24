// Màn Skill AI dịch theo ngôn ngữ giao diện: render bảng trường ở zh / en / vi và kiểm vài nhãn.
import { TooltipProvider, UiLocaleProvider, type UiLocale } from "@kb/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Skill } from "@/mocks/types";
import { SkillFieldsTable } from "./skill-fields-table";

const skill: Skill = {
  id: "s1",
  code: "INV-STD",
  name: "Hóa đơn thương mại",
  kind: "DOCUMENT",
  docKind: "INVOICE",
  language: "EN",
  version: 3,
  labeledSamples: 12,
  updatedAt: "2026-10-01T00:00:00.000Z",
  enabled: true,
  fields: [
    // Trường bổ sung do doanh nghiệp tự đặt: tên là dữ liệu, không dịch.
    { key: "so_lc_rieng", label: "Số L/C riêng", type: "code", required: true, aliases: ["L/C No."], extract: true, display: true },
  ],
};

function render(locale: UiLocale) {
  const client = new QueryClient();
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(UiLocaleProvider, { locale, children: createElement(TooltipProvider, { children: createElement(SkillFieldsTable, { skill }) }) }),
    ),
  );
}

describe("SkillFieldsTable theo ngôn ngữ", () => {
  // vitest của app chạy môi trường node, JSX biên dịch kiểu cổ điển → cần React toàn cục.
  beforeAll(() => vi.stubGlobal("React", React));

  it("zh: nhãn tiếng Trung, tên trường của doanh nghiệp giữ nguyên", () => {
    const html = render("zh");
    expect(html).toContain("添加补充字段");
    expect(html).toContain("字段代码");
    expect(html).toContain("代码 / 编号");
    expect(html).toContain("Số L/C riêng");
    expect(html).not.toContain("Thêm trường bổ sung");
  });

  it("en: nhãn tiếng Anh", () => {
    const html = render("en");
    expect(html).toContain("Add custom field");
    expect(html).toContain("Custom field");
  });

  it("vi: giữ nguyên chữ cũ", () => {
    const html = render("vi");
    expect(html).toContain("Thêm trường bổ sung");
    expect(html).toContain("Mã trường");
  });
});
