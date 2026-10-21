// Các tab Cài đặt hiển thị đúng ngôn ngữ (vi/en/zh). Dựng tĩnh bằng react-dom/server (môi trường test là node).
import { UiLocaleProvider, type UiLocale } from "@kb/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { settingsKeys } from "@/api/settings";
import type { Member, Organization } from "@/mocks/types";
import { profileFieldsFor, validateProfileForm } from "./declaration-profile-form";
import { MembersTab } from "./members-tab";
import { OrgTab } from "./org-tab";
import { PlanTab } from "./plan-tab";
import { validateVnaccsForm } from "./vnaccs-account-form";

// tsconfig để jsx "preserve" nên vitest biên dịch JSX kiểu cổ điển (React.createElement) – cần React toàn cục.
(globalThis as { React?: typeof React }).React = React;

const ORG: Organization = {
  id: "org_1",
  name: "CÔNG TY TNHH MẪU",
  taxCode: "0316789012",
  address: "Hải Phòng",
  phone: "0225 3 888 123",
  plan: { code: "PRO", name: "Chuyên nghiệp", dossiersPerMonth: 150, pagesPerDossier: 40, renewsAt: "2026-11-30" },
  usage: { dossiersThisMonth: 37, pagesThisMonth: 412, aiCostVnd: "69500", hsCostVnd: "19300", customsCostVnd: "7700" },
  suspectThreshold: "BALANCED",
  fourEyes: false,
};
const MEMBERS: Member[] = [
  { id: "u1", name: "Lê Minh Châu", email: "chau@example.com", role: "ADMIN", status: "ACTIVE", lastActiveAt: "2026-10-20T00:00:00.000Z" },
  { id: "u2", name: "Đỗ Khánh Linh", email: "linh@example.com", role: "DECLARANT", status: "INVITED" },
];

function render(locale: UiLocale, Comp: ComponentType) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  qc.setQueryData(settingsKeys.org, ORG);
  qc.setQueryData(settingsKeys.members, MEMBERS);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, createElement(UiLocaleProvider, { locale, children: createElement(Comp) })));
}

describe("Cài đặt – đa ngôn ngữ", () => {
  it("zh: tab Doanh nghiệp và Gói dịch vụ đã dịch, không còn chữ tiếng Việt của giao diện", () => {
    const org = render("zh", OrgTab);
    expect(org).toContain("企业信息");
    expect(org).toContain("保存更改");
    expect(org).not.toContain("Lưu thay đổi");
    const plan = render("zh", PlanTab);
    expect(plan).toContain("套餐对比");
    expect(plan).toContain("切换到此套餐");
    expect(plan).not.toContain("So sánh gói");
    // Chi phí tháng tách theo nhà cung cấp.
    expect(plan).toContain("本月服务费用");
    expect(plan).toContain("HS 编码建议（HSCodePro）");
    expect(plan).toContain("海关申报传输（Customs Hub）");
  });
  it("en: tab Thành viên dùng nhãn vai trò, quyền, trạng thái tiếng Anh", () => {
    const html = render("en", MembersTab);
    expect(html).toContain("What each role can do");
    expect(html).toContain("Approve declarations, submit to Customs");
    expect(html).toContain("Declarant");
    expect(html).not.toContain("Vai trò làm được gì");
  });
  it("vi: giữ nguyên chữ cũ", () => {
    expect(render("vi", OrgTab)).toContain("Thông tin doanh nghiệp");
    expect(render("vi", PlanTab)).toContain("So sánh gói");
  });
  it("lỗi form và nhãn chỉ tiêu theo ngôn ngữ; giá trị mẫu dạng tờ khai giữ tiếng Việt", () => {
    expect(validateVnaccsForm({ userId: "", password: "x", terminalId: "Z", terminalAccessKey: "K" }, "en")).toEqual({ ok: false, errors: { userId: "Enter VNACCS User ID" } });
    expect(validateVnaccsForm({ userId: "U", password: "x", terminalId: "x".repeat(51), terminalAccessKey: "K" }, "zh")).toEqual({ ok: false, errors: { terminalId: "最多 50 个字符" } });
    expect(validateProfileForm("NK", { KHO: "QUA_DAI_12345" }, "en")).toEqual({ KHO: "Warehouse code is at most 7 characters" });
    const kho = profileFieldsFor("NK", "zh").find((f) => f.code === "KHO")!;
    expect(kho.label).toBe("默认仓储地点代码");
    expect(kho.placeholder).toBe("03CCS01 – Kho CFS Tân Vũ");
  });
});
