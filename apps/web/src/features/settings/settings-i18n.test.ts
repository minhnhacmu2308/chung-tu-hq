// Các tab Cài đặt hiển thị đúng ngôn ngữ (vi/en/zh). Dựng tĩnh bằng react-dom/server (môi trường test là node).
import { UiLocaleProvider, type UiLocale } from "@kb/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { billingKeys } from "@/api/billing";
import { sessionKeys } from "@/api/session";
import { settingsKeys } from "@/api/settings";
import type { JoinRequest } from "@kb/contracts";
import type { Member, Organization } from "@/mocks/types";
import { profileFieldsFor, validateProfileForm } from "./declaration-profile-form";
import { MembersTab } from "./members-tab";
import { OrgTab } from "./org-tab";
import { PlanTab } from "./plan-tab";
import { validateVnaccsForm } from "./vnaccs-account-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams("tab=plan"),
}));

// tsconfig để jsx "preserve" nên vitest biên dịch JSX kiểu cổ điển (React.createElement) – cần React toàn cục.
(globalThis as { React?: typeof React }).React = React;

const ORG: Organization = {
  id: "org_1",
  name: "CÔNG TY TNHH MẪU",
  taxCode: "0316789012",
  address: "Hải Phòng",
  phone: "0225 3 888 123",
  postalCode: "180000",
  plan: { code: "PAYG", name: "Theo lượt", kind: "PAYG", pagesPerDossier: 40, pricePerDeclarationVnd: "25000" },
  billing: { balance: 12, reserved: 1, available: 11, contract: null, declarationsThisMonth: 4 },
  usage: { dossiersThisMonth: 37, pagesThisMonth: 412 },
  suspectThreshold: "BALANCED",
  fourEyes: false,
  invoiceSettings: { numbering: { pattern: "INV{YY}{MM}-{NNN}", reset: "MONTH" }, signatoryName: null, signatoryTitle: null, sellerName: null },
};
const MEMBERS: Member[] = [
  { id: "u1", name: "Lê Minh Châu", email: "chau@example.com", role: "ADMIN", status: "ACTIVE", lastActiveAt: "2026-10-20T00:00:00.000Z" },
  { id: "u2", name: "Đỗ Khánh Linh", email: "linh@example.com", role: "DECLARANT", status: "INVITED" },
];

const JOIN_REQUESTS: JoinRequest[] = [{ id: "jr_1", userId: "u9", name: "Mẫn Đức Thịnh", email: "thinh@example.com", requestedAt: "2026-10-20T00:00:00.000Z" }];

function render(locale: UiLocale, Comp: ComponentType, me: Member = MEMBERS[0]!) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  qc.setQueryData(settingsKeys.org, ORG);
  qc.setQueryData(settingsKeys.members, MEMBERS);
  qc.setQueryData(settingsKeys.joinRequests, JOIN_REQUESTS);
  qc.setQueryData(sessionKeys.me, { user: me, org: ORG });
  qc.setQueryData(billingKeys.overview, { plan: ORG.plan, billing: ORG.billing, ledger: [], payments: [] });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, createElement(UiLocaleProvider, { locale, children: createElement(Comp) })));
}

describe("Cài đặt – đa ngôn ngữ", () => {
  it("zh: tab Doanh nghiệp và Gói dịch vụ đã dịch, không còn chữ tiếng Việt của giao diện", () => {
    const org = render("zh", OrgTab);
    expect(org).toContain("企业信息");
    expect(org).toContain("保存更改");
    expect(org).toContain("邮政编码");
    expect(org).not.toContain("Lưu thay đổi");
    const plan = render("zh", PlanTab);
    expect(plan).toContain("剩余 11 次");
    expect(plan).toContain("两种套餐");
    expect(plan).toContain("购买次数");
    expect(plan).not.toContain("Hai loại gói");
    // Giá vốn AI/HSCodePro/Customs Hub là số nội bộ – không hiện cho khách (ADR 0011).
    expect(plan).not.toContain("HSCodePro");
  });
  it("en: tab Thành viên dùng nhãn vai trò, quyền, trạng thái tiếng Anh", () => {
    const html = render("en", MembersTab);
    expect(html).toContain("What each role can do");
    expect(html).toContain("Approve declarations, submit to Customs");
    expect(html).toContain("Declarant");
    expect(html).not.toContain("Vai trò làm được gì");
  });
  it("Yêu cầu tham gia: Quản trị thấy nút Duyệt / Từ chối theo ngôn ngữ; vai trò khác không thấy", () => {
    const vi = render("vi", MembersTab);
    expect(vi).toContain("Yêu cầu tham gia");
    expect(vi).toContain("Mẫn Đức Thịnh");
    expect(vi).toContain('aria-label="Từ chối Mẫn Đức Thịnh"');
    expect(vi).toContain('aria-label="Duyệt Mẫn Đức Thịnh"');
    const zh = render("zh", MembersTab);
    expect(zh).toContain("加入申请");
    expect(zh).toContain("拒绝");
    expect(zh).not.toContain("Từ chối");
    const declarant: Member = { id: "u3", name: "Nguyễn Thu Hà", email: "ha@example.com", role: "DECLARANT", status: "ACTIVE" };
    expect(render("vi", MembersTab, declarant)).not.toContain("Yêu cầu tham gia");
  });
  it("vi: giữ nguyên chữ cũ", () => {
    expect(render("vi", OrgTab)).toContain("Thông tin doanh nghiệp");
    expect(render("vi", OrgTab)).toContain("Mã bưu chính");
    expect(render("en", OrgTab)).toContain("Postal code");
    expect(render("vi", PlanTab)).toContain("Hai loại gói");
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
