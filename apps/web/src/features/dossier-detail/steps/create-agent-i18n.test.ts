// Bước 1 (thông tin hồ sơ) và ô gợi ý HS (bước 4) dịch theo ngôn ngữ giao diện; dữ liệu (mã, cảnh báo HSCodePro) giữ nguyên.
import { UiLocaleProvider, type UiLocale } from "@kb/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Dossier, LineItem } from "@/mocks/types";
import { CreateSummaryStep } from "./create-step";
import { HsSuggestionCell } from "./hs/hs-cell";

const dossier = {
  id: "d1",
  code: "HS-0001",
  direction: "NK",
  typeCode: "A11",
  partner: "Ningbo Bearing Co.",
  customsOffice: "03CE",
  incoterm: "FOB",
  transportMode: "SEA_CONTAINER",
  billNo: "",
  skillSetId: "default",
  dueDate: "2026-10-30",
  createdAt: "2026-10-20T03:00:00.000Z",
  note: "",
} as unknown as Dossier;

const needInfo = { id: "l1", lineNo: 2, description: "Ổ bi", hs: { status: "need_info", warnings: [] } } as unknown as LineItem;
const suggested = {
  id: "l2",
  lineNo: 3,
  description: "Ổ bi",
  hsSuggested: "8482.10.00",
  hsConfidence: 0.92,
  hs: { status: "completed", warnings: ["Hàng thuộc diện kiểm tra chuyên ngành"] },
} as unknown as LineItem;

function render(locale: UiLocale, node: ReactElement) {
  const client = new QueryClient();
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(UiLocaleProvider, { locale, children: node })));
}
const step = () => createElement(CreateSummaryStep, { dossier, goTo: () => {} });
const cell = (item: LineItem) => createElement(HsSuggestionCell, { item, onAnswer: () => {}, onReclassify: () => {} });

describe("Bước 1 và ô gợi ý HS theo ngôn ngữ", () => {
  // vitest của app chạy môi trường node, JSX biên dịch kiểu cổ điển → cần React toàn cục.
  beforeAll(() => vi.stubGlobal("React", React));

  it("zh: bước 1 hiện nhãn tiếng Trung, mã nghiệp vụ giữ nguyên", () => {
    const html = render("zh", step());
    expect(html).toContain("档案信息");
    expect(html).toContain("进口");
    expect(html).toContain("企业默认");
    expect(html).toContain("上传单证");
    expect(html).toContain("A11");
    expect(html).not.toContain("Thông tin hồ sơ");
  });

  it("en: bước 1 hiện nhãn tiếng Anh", () => {
    const html = render("en", step());
    expect(html).toContain("Dossier information");
    expect(html).toContain("Save note");
  });

  it("vi: giữ nguyên chữ cũ", () => {
    const html = render("vi", step());
    expect(html).toContain("Thông tin hồ sơ");
    expect(html).toContain("Lưu ghi chú");
  });

  it("zh: ô gợi ý HS dịch nhãn, cảnh báo từ HSCodePro giữ nguyên", () => {
    expect(render("zh", cell(needInfo))).toContain("回答 AI");
    const html = render("zh", cell(suggested));
    expect(html).toContain("置信度 92%");
    expect(html).toContain("Hàng thuộc diện kiểm tra chuyên ngành");
  });
});
