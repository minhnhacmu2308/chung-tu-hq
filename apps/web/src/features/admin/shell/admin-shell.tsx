"use client";
// Khung khu Quản trị hệ thống (/admin) của đội vận hành. Dùng CHUNG trang đăng nhập với ứng dụng; tài khoản có quyền
// quản trị mới thấy menu này, tài khoản khác bị đưa về ứng dụng. Không có trợ lý AI, không có thông báo hồ sơ.
import {
  Alert, AppearancePanel, Badge, BrandDot, BrandMark, Dialog, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, PageLoading, Sidebar, SidebarFooterButton, SidebarMobileTrigger, SidebarUser, toast, useMessages, type NavItem,
} from "@kb/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Building2, LayoutDashboard, LogOut, Mail, RotateCcw, ShieldCheck, SunMoon, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { adminKeys, getAdminSession, getSystemHealth } from "@/api/admin";
import { ChangePasswordScreen } from "@/components/common/change-password-screen";
import { logout, resetMockData } from "@/api/session";
import { useAppearance } from "@/features/appearance/use-appearance";
import { STAFF_ROLE_LABELS } from "../common/admin-display";
import { ADMIN_SHELL_MESSAGES } from "./admin-shell.messages";
import { MfaGate } from "./mfa-gate";
import { useAdminSession } from "./use-admin-session";

const COLLAPSE_KEY = "kb-admin-sidebar-collapsed";

/** Mục con → đường dẫn. Thứ tự là thứ tự xét "đang ở mục nào" (đường dẫn dài xét trước). */
const LEAVES = [
  { id: "orgs", href: "/admin/orgs" },
  { id: "users", href: "/admin/users" },
  { id: "plans", href: "/admin/plans" },
  { id: "usage", href: "/admin/usage" },
  { id: "integrations", href: "/admin/integrations" },
  { id: "exchange-rates", href: "/admin/exchange-rates" },
  { id: "system", href: "/admin/system" },
  { id: "skill-templates", href: "/admin/skill-templates" },
  { id: "staff", href: "/admin/staff" },
  { id: "audit", href: "/admin/audit" },
  { id: "announcements", href: "/admin/announcements" },
  // Đường dẫn con của /admin/email xét trước "Gửi email" (/admin/email, gồm cả trang Soạn email).
  { id: "email-templates", href: "/admin/email/templates" },
  { id: "email-signatures", href: "/admin/email/signatures" },
  { id: "email-settings", href: "/admin/email/settings" },
  { id: "email-campaigns", href: "/admin/email" },
] as const;

function useNav(enabled: boolean): { items: NavItem[]; activeId: string | undefined } {
  const pathname = usePathname();
  const { data: health } = useQuery({ queryKey: adminKeys.system, queryFn: getSystemHealth, enabled });
  const failed = health?.failedJobs.length ?? 0;
  const t = useMessages(ADMIN_SHELL_MESSAGES);

  const items: NavItem[] = [
    { id: "overview", label: t.overview, icon: <LayoutDashboard />, href: "/admin" },
    {
      id: "customers",
      label: t.customers,
      icon: <Building2 />,
      children: [
        { id: "orgs", label: t.orgs, href: "/admin/orgs" },
        { id: "users", label: t.users, href: "/admin/users" },
      ],
    },
    {
      id: "billing",
      label: t.billing,
      icon: <WalletCards />,
      children: [
        { id: "plans", label: t.plans, href: "/admin/plans" },
        { id: "usage", label: t.usage, href: "/admin/usage" },
      ],
    },
    {
      id: "operations",
      label: t.operations,
      icon: <Activity />,
      children: [
        { id: "integrations", label: t.integrations, href: "/admin/integrations" },
        { id: "exchange-rates", label: t.exchangeRates, href: "/admin/exchange-rates" },
        { id: "system", label: t.system, href: "/admin/system", ...(failed > 0 ? { badge: <Badge tone="warning">{failed}</Badge> } : {}) },
        { id: "skill-templates", label: t.skillTemplates, href: "/admin/skill-templates" },
      ],
    },
    {
      id: "control",
      label: t.control,
      icon: <ShieldCheck />,
      children: [
        { id: "staff", label: t.staff, href: "/admin/staff" },
        { id: "audit", label: t.audit, href: "/admin/audit" },
      ],
    },
    {
      id: "messaging",
      label: t.messaging,
      icon: <Mail />,
      children: [
        { id: "announcements", label: t.announcements, href: "/admin/announcements" },
        { id: "email-campaigns", label: t.emailCampaigns, href: "/admin/email" },
        { id: "email-templates", label: t.emailTemplates, href: "/admin/email/templates" },
        { id: "email-signatures", label: t.emailSignatures, href: "/admin/email/signatures" },
        { id: "email-settings", label: t.mailSettings, href: "/admin/email/settings" },
      ],
    },
  ];
  const activeId = pathname === "/admin" ? "overview" : LEAVES.find((l) => pathname.startsWith(l.href))?.id;
  return { items, activeId };
}

function AdminShellInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const t = useMessages(ADMIN_SHELL_MESSAGES);
  const roleLabels = useMessages(STAFF_ROLE_LABELS);
  const { appearance, setAppearance, adjustments } = useAppearance();
  const { staff, mfa, isSignedOut } = useAdminSession();
  const { items, activeId } = useNav(!!staff && mfa.verified);

  // Không phải tài khoản đội vận hành (hoặc chưa đăng nhập) → không có khu này: về trang đăng nhập chung.
  useEffect(() => {
    if (isSignedOut) router.replace("/login");
  }, [isSignedOut, router]);

  const [collapsed, setCollapsedState] = useState(false);
  useEffect(() => {
    try {
      setCollapsedState(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* bỏ qua */
    }
  }, []);
  const setCollapsed = (c: boolean) => {
    setCollapsedState(c);
    try {
      localStorage.setItem(COLLAPSE_KEY, c ? "1" : "0");
    } catch {
      /* bỏ qua */
    }
  };
  const [mobileNav, setMobileNav] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  useEffect(() => setMobileNav(false), [pathname]);

  const signOut = () => {
    void logout().finally(() => {
      qc.clear();
      router.push("/login");
    });
  };
  const reset = async () => {
    await resetMockData();
    await qc.invalidateQueries();
    toast({ tone: "success", title: t.resetDone, description: t.resetDoneDescription });
  };

  const menu = appearance.menuPosition;
  const menuOnTop = menu === "top";

  return (
    <div className={menuOnTop ? "flex min-h-dvh flex-col" : "flex min-h-dvh"}>
      <Sidebar
        position={menu}
        {...(menuOnTop ? {} : { className: "sticky top-0" })}
        brand={{
          logo: <BrandMark small decorative className="h-6 w-6" />,
          // Nhãn "Quản trị" luôn hiện cạnh tên để không nhầm với ứng dụng của khách.
          name: (
            <span className="flex items-center gap-2">
              {/* kb-allow-raw: tên thương hiệu KhaiBáo AI, không dịch */}
              KhaiBáo AI <Badge tone="warning" size="sm">{t.adminBadge}</Badge>
            </span>
          ),
          href: "/admin",
        }}
        items={items}
        activeId={activeId}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        linkAs={Link}
        mobileOpen={mobileNav}
        onMobileOpenChange={setMobileNav}
        labels={{ nav: t.navLabel }}
        footer={
          <>
            <SidebarFooterButton icon={<SunMoon />} label={t.appearance} trailing={<BrandDot />} onClick={() => setAppearanceOpen(true)} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarUser name={staff?.name ?? "…"} role={staff ? roleLabels[staff.role] : ""} />
              </DropdownMenuTrigger>
              <DropdownMenuContent side={menuOnTop ? "bottom" : menu === "right" ? "left" : "right"} align="end">
                <DropdownMenuItem icon={<RotateCcw className="h-4 w-4" />} onSelect={reset}>
                  {t.resetData}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<LogOut className="h-4 w-4" />} tone="danger" onSelect={signOut}>
                  {t.signOut}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <Dialog open={appearanceOpen} onOpenChange={setAppearanceOpen} defaultPresentation="panel">
        <DialogContent title={t.appearanceTitle} icon={<SunMoon className="h-4 w-4" />} size="sm">
          <AppearancePanel value={appearance} onChange={setAppearance} allowCustomBrand brandAdjustments={adjustments} />
        </DialogContent>
      </Dialog>

      <main className="@container min-w-0 flex-1 px-4 py-6 md:px-8">
        {!menuOnTop && (
          <div className="mb-2 md:hidden">
            <SidebarMobileTrigger onClick={() => setMobileNav(true)} expanded={mobileNav} />
          </div>
        )}
        {/* Chưa biết ai đang đăng nhập thì chưa vẽ màn: tránh lộ khung dữ liệu rồi mới đẩy về trang đăng nhập. */}
        {staff && !mfa.verified ? (
          <MfaGate mfa={mfa} />
        ) : staff ? (
          <div key={pathname} className="motion-safe:animate-slide-up">
            {children}
          </div>
        ) : (
          <PageLoading label={t.checkingAccess} />
        )}
      </main>
    </div>
  );
}

/** Quản trị viên còn mật khẩu tạm → đổi mật khẩu trước (rồi mới tới bước 2FA), chưa dựng khung quản trị. */
export function AdminShell({ children }: { children: ReactNode }) {
  const { data } = useQuery({ queryKey: adminKeys.session, queryFn: getAdminSession });
  return data?.mustChangePassword ? <ChangePasswordScreen /> : <AdminShellInner>{children}</AdminShellInner>;
}
