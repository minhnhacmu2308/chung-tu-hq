// Màn Gói dịch vụ hiển thị đúng ngôn ngữ (vi/en/zh). Dựng tĩnh bằng react-dom/server (môi trường test là node).
import type { AdminPlan, AdminSession } from "@kb/contracts";
import { UiLocaleProvider, type UiLocale } from "@kb/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { adminKeys } from "@/api/admin";
import { PlanListPage } from "./plan-list-page";

// tsconfig để jsx "preserve" nên vitest biên dịch JSX kiểu cổ điển (React.createElement) – cần React toàn cục.
(globalThis as { React?: typeof React }).React = React;

const PLANS: AdminPlan[] = [
  { code: "TRIAL", name: "Trial", dossiersPerMonth: 10, pagesPerDossier: 20, priceVnd: "0", customPricing: false, orgCount: 3 },
  { code: "ENTERPRISE", name: "Enterprise", dossiersPerMonth: 2000, pagesPerDossier: 200, priceVnd: "20000000", customPricing: true, orgCount: 1 },
];
const SESSION: AdminSession = { staff: { id: "s1", name: "Nguyễn Văn A", email: "a@example.com", role: "SUPER_ADMIN", status: "ACTIVE" } };

function render(locale: UiLocale) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  qc.setQueryData(adminKeys.plans, PLANS);
  qc.setQueryData(adminKeys.session, SESSION);
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client: qc, children: createElement(UiLocaleProvider, { locale, children: createElement(PlanListPage) }) }),
  );
}

describe("PlanListPage – đa ngôn ngữ", () => {
  it("zh: tiêu đề, nhãn thẻ và nút đã dịch, không còn chữ tiếng Việt", () => {
    const html = render("zh");
    expect(html).toContain("套餐");
    expect(html).toContain("免费");
    expect(html).toContain("按合同");
    expect(html).toContain("每月档案数");
    expect(html).toContain("编辑套餐");
    expect(html).not.toContain("Gói dịch vụ");
    expect(html).not.toContain("Sửa gói");
  });
  it("en: nhãn tiếng Anh", () => {
    const html = render("en");
    expect(html).toContain("Plans");
    expect(html).toContain("Organizations on plan");
    expect(html).toContain("Edit plan");
  });
  it("vi: giữ nguyên chữ cũ", () => {
    const html = render("vi");
    expect(html).toContain("Gói dịch vụ");
    expect(html).toContain("Miễn phí");
    expect(html).toContain("Sửa gói");
  });
});
