"use client";
// Khung khu Quản trị hệ thống (/admin) của đội vận hành. Dùng CHUNG trang đăng nhập với ứng dụng; tài khoản có quyền
// quản trị mới thấy menu này, tài khoản khác bị đưa về ứng dụng. Không có trợ lý AI, không có thông báo hồ sơ.
import {
  Alert, AppearancePanel, Badge, BrandDot, BrandMark, Dialog, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, PageLoading, Sidebar, SidebarFooterButton, SidebarMobileTrigger, SidebarUser, toast, type NavItem,
} from "@kb/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Building2, LayoutDashboard, LogOut, RotateCcw, ShieldCheck, SunMoon, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { adminKeys, getSystemHealth } from "@/api/admin";
import { logout, resetMockData } from "@/api/session";
import { useAppearance } from "@/features/appearance/use-appearance";
import { STAFF_ROLE_LABELS } from "../common/admin-display";
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
  { id: "system", href: "/admin/system" },
  { id: "skill-templates", href: "/admin/skill-templates" },
  { id: "staff", href: "/admin/staff" },
  { id: "audit", href: "/admin/audit" },
  { id: "announcements", href: "/admin/announcements" },
] as const;

function useNav(enabled: boolean): { items: NavItem[]; activeId: string | undefined } {
  const pathname = usePathname();
  const { data: health } = useQuery({ queryKey: adminKeys.system, queryFn: getSystemHealth, enabled });
  const failed = health?.failedJobs.length ?? 0;

  const items: NavItem[] = [
    { id: "overview", label: "Tổng quan", icon: <LayoutDashboard />, href: "/admin" },
    {
      id: "customers",
      label: "Khách hàng",
      icon: <Building2 />,
      children: [
        { id: "orgs", label: "Doanh nghiệp", href: "/admin/orgs" },
        { id: "users", label: "Người dùng", href: "/admin/users" },
      ],
    },
    {
      id: "billing",
      label: "Gói & chi phí",
      icon: <WalletCards />,
      children: [
        { id: "plans", label: "Gói dịch vụ", href: "/admin/plans" },
        { id: "usage", label: "Sử dụng & chi phí", href: "/admin/usage" },
      ],
    },
    {
      id: "operations",
      label: "Vận hành",
      icon: <Activity />,
      children: [
        { id: "integrations", label: "Tích hợp dùng chung", href: "/admin/integrations" },
        { id: "system", label: "Sức khỏe hệ thống", href: "/admin/system", ...(failed > 0 ? { badge: <Badge tone="warning">{failed}</Badge> } : {}) },
        { id: "skill-templates", label: "Skill mẫu", href: "/admin/skill-templates" },
      ],
    },
    {
      id: "control",
      label: "Kiểm soát",
      icon: <ShieldCheck />,
      children: [
        { id: "staff", label: "Quản trị viên", href: "/admin/staff" },
        { id: "audit", label: "Nhật ký quản trị", href: "/admin/audit" },
        { id: "announcements", label: "Thông báo hệ thống", href: "/admin/announcements" },
      ],
    },
  ];
  const activeId = pathname === "/admin" ? "overview" : LEAVES.find((l) => pathname.startsWith(l.href))?.id;
  return { items, activeId };
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
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
    toast({ tone: "success", title: "Đã khôi phục dữ liệu mẫu", description: "Phiên đăng nhập cũng được đặt lại – đăng nhập lại để tiếp tục." });
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
              KhaiBáo AI <Badge tone="warning" size="sm">Quản trị</Badge>
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
        labels={{ nav: "Điều hướng quản trị" }}
        footer={
          <>
            <SidebarFooterButton icon={<SunMoon />} label="Giao diện" trailing={<BrandDot />} onClick={() => setAppearanceOpen(true)} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarUser name={staff?.name ?? "…"} role={staff ? STAFF_ROLE_LABELS[staff.role] : ""} />
              </DropdownMenuTrigger>
              <DropdownMenuContent side={menuOnTop ? "bottom" : menu === "right" ? "left" : "right"} align="end">
                <DropdownMenuItem icon={<RotateCcw className="h-4 w-4" />} onSelect={reset}>
                  Khôi phục dữ liệu mẫu
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<LogOut className="h-4 w-4" />} tone="danger" onSelect={signOut}>
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <Dialog open={appearanceOpen} onOpenChange={setAppearanceOpen} defaultPresentation="panel">
        <DialogContent title="Cấu hình giao diện" size="sm">
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
          <PageLoading label="Đang kiểm tra quyền quản trị" />
        )}
      </main>
    </div>
  );
}
