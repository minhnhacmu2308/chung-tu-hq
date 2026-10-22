"use client";
// Khung chung mọi màn sau đăng nhập: menu trái, trợ lý AI, cấu hình giao diện, thông báo.
import {
  AppearancePanel, AssistantLauncher, AssistantPanel, Badge, BrandDot, BrandMark, Dialog, DialogContent, DropdownMenu,
  DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Sidebar, SidebarFooterButton,
  SidebarMobileTrigger, SidebarUser, toast, useMessages, type AssistantMode, type NavItem,
} from "@kb/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, FolderOpen, LayoutDashboard, LogOut, Package, RotateCcw, Send, Settings2, Sparkles, SunMoon, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { adminKeys, getAdminSession } from "@/api/admin";
import { dossierKeys, listDossiers } from "@/api/dossiers";
import { getSession, listNotifications, logout, resetMockData, sessionKeys } from "@/api/session";
import { APP_TITLES } from "@/app/app-titles.messages";
import { LanguageMenuSub } from "@/features/appearance/language-switcher";
import { InstallAppMenuItem } from "@/features/pwa/install-app";
import { useAppearance } from "@/features/appearance/use-appearance";
import { useAssistantChat } from "@/features/assistant/use-assistant-chat";
import { NotificationsPanel } from "./notifications-panel";
import { SHELL_MESSAGES } from "./shell.messages";
import { usePageTitle } from "./use-page-title";
import { ROLE_LABELS } from "@/mocks/types";

const COLLAPSE_KEY = "kb-sidebar-collapsed";
const BRAND = APP_TITLES.vi.brand;

function useNav(): { items: NavItem[]; activeId: string | undefined } {
  const t = useMessages(SHELL_MESSAGES);
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: dossiers } = useQuery({ queryKey: dossierKeys.list({}), queryFn: () => listDossiers() });
  const needsReview = (dir: "NK" | "XK") => dossiers?.filter((d) => d.direction === dir && d.status === "NEEDS_REVIEW").length ?? 0;
  const badge = (n: number) => (n > 0 ? <Badge tone="warning">{n}</Badge> : undefined);
  const nk = badge(needsReview("NK"));
  const xk = badge(needsReview("XK"));

  const items: NavItem[] = [
    { id: "overview", label: t.navOverview, icon: <LayoutDashboard />, href: "/" },
    {
      id: "dossiers",
      label: t.navDossiers,
      icon: <FolderOpen />,
      children: [
        { id: "dossiers-NK", label: t.navImport, href: "/dossiers?direction=NK", ...(nk ? { badge: nk } : {}) },
        { id: "dossiers-XK", label: t.navExport, href: "/dossiers?direction=XK", ...(xk ? { badge: xk } : {}) },
        { id: "dossiers-all", label: t.navAll, href: "/dossiers" },
      ],
    },
    { id: "customs", label: t.navCustoms, icon: <Send />, href: "/customs" },
    { id: "products", label: t.navProducts, icon: <Package />, href: "/products" },
    { id: "skills", label: t.navSkills, icon: <Sparkles />, href: "/skills" },
    { id: "settings", label: t.navSettings, icon: <Settings2 />, href: "/settings" },
  ];

  let activeId: string | undefined;
  if (pathname === "/") activeId = "overview";
  else if (pathname.startsWith("/dossiers")) {
    // Trang chi tiết: lấy chiều NK/XK từ chính hồ sơ để menu sáng đúng mục.
    const detailId = pathname.split("/")[2];
    const dir = params.get("direction") ?? dossiers?.find((d) => d.id === detailId)?.direction;
    activeId = dir === "NK" || dir === "XK" ? `dossiers-${dir}` : "dossiers-all";
  } else activeId = items.find((i) => i.href && i.href !== "/" && pathname.startsWith(i.href))?.id;
  return { items, activeId };
}

function ShellInner({ children }: { children: ReactNode }) {
  const t = useMessages(SHELL_MESSAGES);
  const roleLabels = useMessages(ROLE_LABELS);
  usePageTitle();
  const router = useRouter();
  const qc = useQueryClient();
  const { appearance, setAppearance, adjustments } = useAppearance();
  const { items, activeId } = useNav();
  const { data: session } = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const { data: notifications } = useQuery({ queryKey: sessionKeys.notifications, queryFn: listNotifications });
  const unread = notifications?.filter((n) => !n.read).length ?? 0;

  // Tài khoản đội vận hành không thuộc doanh nghiệp nào: không có khu khai báo, chuyển sang khu Quản trị hệ thống.
  const { data: adminSession } = useQuery({ queryKey: adminKeys.session, queryFn: getAdminSession });
  const isOperator = !!adminSession?.staff;
  useEffect(() => {
    if (isOperator) router.replace("/admin");
  }, [isOperator, router]);

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
  const [notifOpen, setNotifOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMode, setAiMode] = useState<AssistantMode>("docked");

  const pathname = usePathname();
  useEffect(() => setMobileNav(false), [pathname]);
  const chat = useAssistantChat();

  const reset = async () => {
    await resetMockData();
    await qc.invalidateQueries();
    toast({ tone: "success", title: t.resetDone });
  };

  // Vị trí menu do người dùng chọn trong "Giao diện": cột trái / cột phải / thanh ngang trên đầu.
  const menu = appearance.menuPosition;
  const menuOnTop = menu === "top";
  const content = (
    <>
      <main className="@container min-w-0 flex-1 px-4 py-6 md:px-8">
        {/* Menu ở trên đã có sẵn nút ☰ trong thanh menu. */}
        {!menuOnTop && (
          <div className="mb-2 md:hidden">
            <SidebarMobileTrigger onClick={() => setMobileNav(true)} expanded={mobileNav} />
          </div>
        )}
        {/* Mỗi lần đổi trang, nội dung trồi nhẹ lên (key theo đường dẫn; đổi ?step= không chạy lại). */}
        <div key={pathname} className="motion-safe:animate-slide-up">
          {isOperator ? null : children}
        </div>
      </main>

      <AssistantPanel
        open={aiOpen}
        onOpenChange={setAiOpen}
        mode={aiMode}
        onModeChange={setAiMode}
        name={t.assistantName}
        tag="AI"
        composer={chat.composer}
      >
        {chat.content}
      </AssistantPanel>
    </>
  );

  return (
    <div className={menuOnTop ? "flex min-h-dvh flex-col" : "flex min-h-dvh"}>
      <Sidebar
        position={menu}
        {...(menuOnTop ? {} : { className: "sticky top-0" })}
        brand={{ logo: <BrandMark small decorative className="h-6 w-6" />, name: BRAND, href: "/" }}
        items={items}
        activeId={activeId}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        linkAs={Link}
        mobileOpen={mobileNav}
        onMobileOpenChange={setMobileNav}
        footer={
          <>
            <SidebarFooterButton
              icon={<Bell />}
              label={t.notifications}
              {...(unread > 0 ? { trailing: <Badge tone="danger" variant="solid">{unread}</Badge> } : {})}
              onClick={() => setNotifOpen(true)}
            />
            <SidebarFooterButton icon={<SunMoon />} label={t.appearance} trailing={<BrandDot />} onClick={() => setAppearanceOpen(true)} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarUser name={session?.user.name ?? "…"} role={session ? roleLabels[session.user.role] : ""} />
              </DropdownMenuTrigger>
              <DropdownMenuContent side={menuOnTop ? "bottom" : menu === "right" ? "left" : "right"} align="end">
                <DropdownMenuItem icon={<UserRound className="h-4 w-4" />} onSelect={() => router.push("/settings")}>
                  {t.navSettings}
                </DropdownMenuItem>
                <DropdownMenuItem icon={<SunMoon className="h-4 w-4" />} onSelect={() => setAppearanceOpen(true)}>
                  {t.appearanceTitle}
                </DropdownMenuItem>
                <LanguageMenuSub />
                <InstallAppMenuItem />
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<RotateCcw className="h-4 w-4" />} onSelect={reset}>
                  {t.resetData}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  icon={<LogOut className="h-4 w-4" />}
                  tone="danger"
                  onSelect={() => {
                    void logout().finally(() => {
                      qc.clear();
                      router.push("/login");
                    });
                  }}
                >
                  {t.logout}
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

      <Dialog open={notifOpen} onOpenChange={setNotifOpen} defaultPresentation="panel">
        <DialogContent title={t.notifications} size="sm" icon={<Bell className="h-4 w-4" />}>
          <NotificationsPanel onNavigate={() => setNotifOpen(false)} />
        </DialogContent>
      </Dialog>

      {menuOnTop ? <div className="flex min-w-0 flex-1">{content}</div> : content}
      {!aiOpen && (
        <AssistantLauncher
          onClick={() => setAiOpen(true)}
          state={chat.busy ? "thinking" : "idle"}
          // Menu bên phải: lùi robot vào trong để không đè lên menu (rộng 16rem, thu gọn 4rem).
          {...(menu === "right" ? { className: collapsed ? "md:right-20" : "md:right-68" } : {})}
        />
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  // useSearchParams cần Suspense khi build tĩnh.
  return (
    <Suspense>
      <ShellInner>{children}</ShellInner>
    </Suspense>
  );
}
