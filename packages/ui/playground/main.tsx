// Playground: xem toàn bộ component @kb/ui và thử cấu hình giao diện. Chạy: pnpm ui:playground
import { FileCheck2, FolderOpen, GitBranch, LayoutDashboard, LogOut, Send, Settings2, Sparkles, SunMoon, UserRound } from "lucide-react";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/styles/index.css";
import {
  Alert, AppearancePanel, AssistantLauncher, CursorEffect, RobotAvatar, AssistantPanel, AssistantWelcome, Badge, Button, Card, CardContent,
  CardDescription, CardFooter, CardHeader, CardTitle, ChatComposer, ChatMessage, Checkbox, Dialog, DialogContent, RadioGroup,
  DialogFooter, DialogTrigger, EmptyState, Field, FieldFrame, Grid, Input, LookupInput, PageHeader, Select, Skeleton, Spinner, Stack,
  StatusBadge, SuggestionChips, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, type AssistantMode,
  BrandDot, Sidebar, SidebarFooterButton, SidebarUser, type NavItem,
  Stepper, WorkflowDiagram, type FlowEdge, type FlowNode,
  Breadcrumb, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  SidebarMobileTrigger, Toaster, toast, UiLocaleProvider,
  BrandMark, AiBackdrop, AiScanCard, CountUp, FormSection, IconTile, StatCard, toastPromise,
  RowActions, Loader, LoadingDots, LoadingOverlay, LoadingState, SkeletonCard, SkeletonForm, SkeletonList, SkeletonStats, SkeletonTable,
} from "../src/index.js";
import { Showcase } from "./showcase.js";

const STEPS = [
  { id: "create", label: "Tạo hồ sơ" },
  { id: "upload", label: "Upload chứng từ" },
  { id: "ocr", label: "OCR & kiểm tra" },
  { id: "agent", label: "AI Agent xử lý" },
  { id: "review", label: "Review tờ khai" },
  { id: "submit", label: "Khai báo Hải quan" },
];

const FLOW_NODES: FlowNode[] = [
  { id: "start", kind: "start", title: "Bắt đầu", status: "done" },
  { id: "create", kind: "step", title: "Tạo hồ sơ", description: "A11 · KOREA BEARING SOLUTION", status: "done" },
  { id: "upload", kind: "step", title: "Upload chứng từ", description: "5 chứng từ · 9 trang", status: "done" },
  { id: "ocr", kind: "step", title: "OCR & kiểm tra", description: "AI đọc + đối chiếu chéo", status: "done" },
  { id: "blocker", kind: "decision", title: "Còn lỗi BLOCKER?", status: "done" },
  { id: "fix", kind: "step", title: "Sửa & xác nhận dữ liệu", description: "16 trường nghi ngờ trên 5 chứng từ", status: "current" },
  { id: "agent", kind: "step", title: "AI Agent xử lý", description: "Tra HS · ánh xạ · số hoá", status: "pending" },
  { id: "review", kind: "step", title: "Review tờ khai", description: "Người duyệt phê duyệt", status: "pending" },
  { id: "submit", kind: "step", title: "Khai báo Hải quan", description: "IDA → IDC → HYS qua Customs Hub", status: "pending" },
  { id: "channel", kind: "decision", title: "Phân luồng", status: "pending" },
  { id: "inspect", kind: "step", title: "Kiểm tra hồ sơ / hàng", description: "Luồng vàng hoặc đỏ", status: "pending" },
  { id: "end", kind: "end", title: "Thông quan", status: "pending" },
];
const FLOW_EDGES: FlowEdge[] = [
  { from: "start", to: "create" }, { from: "create", to: "upload" }, { from: "upload", to: "ocr" }, { from: "ocr", to: "blocker" },
  { from: "blocker", to: "fix", label: "Có lỗi" }, { from: "blocker", to: "agent", label: "Không" }, { from: "fix", to: "agent" },
  { from: "agent", to: "review" }, { from: "review", to: "submit" }, { from: "submit", to: "channel" },
  { from: "channel", to: "inspect", label: "Vàng / Đỏ" }, { from: "channel", to: "end", label: "Xanh" }, { from: "inspect", to: "end" },
];

const NAV: NavItem[] = [
  { id: "overview", label: "Tổng quan", icon: <LayoutDashboard />, href: "#" },
  {
    id: "dossiers", label: "Hồ sơ khai báo", icon: <FolderOpen />,
    children: [
      { id: "dossier-import", label: "Nhập khẩu", href: "#", badge: <Badge tone="warning">3</Badge> },
      { id: "dossier-export", label: "Xuất khẩu", href: "#" },
      { id: "dossier-all", label: "Tất cả", href: "#" },
    ],
  },
  { id: "customs", label: "Khai báo Hải quan", icon: <Send />, href: "#" },
  { id: "skills", label: "Cấu hình Skill AI", icon: <Sparkles />, href: "#" },
  { id: "rules", label: "Luật đối chiếu", icon: <FileCheck2 />, href: "#" },
  { id: "settings", label: "Thiết lập", icon: <Settings2 />, href: "#", hasSubmenu: true },
];

function readCollapsed() {
  try { return localStorage.getItem("kb-sidebar-collapsed") === "1"; } catch { return false; }
}
import { Appearance as AppearanceSchema, appearanceAttributes, appearanceCss, DEFAULT_APPEARANCE, type Appearance } from "../src/theme/index.js";

const ATTRS = ["data-theme", "data-density", "data-font-size", "data-font", "data-gray", "data-backdrop", "data-radius", "data-menu-position", "data-menu-style", "data-menu-pattern", "data-surface", "data-cursor-effect", "data-page-description"];

/** Áp dụng cấu hình lên <html> – app thật làm việc này ở layout gốc (server-side để không nháy). */
function useApplyAppearance(a: Appearance) {
  const { css, adjustments } = useMemo(() => appearanceCss(a), [a]);
  useEffect(() => {
    const root = document.documentElement;
    for (const k of ATTRS) root.removeAttribute(k);
    for (const [k, v] of Object.entries(appearanceAttributes(a))) root.setAttribute(k, v);
    let tag = document.getElementById("kb-brand");
    if (!tag) {
      tag = document.createElement("style");
      tag.id = "kb-brand";
      document.head.appendChild(tag);
    }
    tag.textContent = css;
  }, [a, css]);
  return adjustments;
}

function Demo() {
  // Mọi tùy chọn giao diện đọc được từ URL (?mode=dark&brand=EA580C&density=compact&font=system…) – dùng cho test chụp ảnh.
  const [appearance, setAppearance] = useState<Appearance>(() => {
    const q = new URLSearchParams(location.search);
    const fromUrl: Record<string, unknown> = {};
    for (const [k, def] of Object.entries(DEFAULT_APPEARANCE)) {
      const v = q.get(k);
      if (v === null) continue;
      fromUrl[k] = typeof def === "boolean" ? v === "1" || v === "true" : k === "brand" || k === "accent" ? `#${v.replace(/^#/, "")}` : v;
    }
    const parsed = AppearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, ...fromUrl });
    return parsed.success ? parsed.data : DEFAULT_APPEARANCE;
  });
  const adjustments = useApplyAppearance(appearance);
  const [aiOpen, setAiOpen] = useState(() => new URLSearchParams(location.search).get("ai") !== "0");
  const [aiMode, setAiMode] = useState<AssistantMode>("docked");
  const [collapsed, setCollapsedState] = useState(readCollapsed);
  const setCollapsed = (c: boolean) => {
    setCollapsedState(c);
    try { localStorage.setItem("kb-sidebar-collapsed", c ? "1" : "0"); } catch { /* bỏ qua */ }
  };
  const [activeId, setActiveId] = useState("dossier-import");
  // ?appearance=general|layout|color → mở sẵn bảng cấu hình ở nhóm đó (dùng cho test chụp ảnh).
  const initialTab = new URLSearchParams(location.search).get("appearance");
  const [appearanceOpen, setAppearanceOpen] = useState(() => initialTab !== null);
  const [mobileNav, setMobileNav] = useState(false);
  const [machineUse, setMachineUse] = useState<string | null>("cnc");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);

  const send = (text: string, files: File[]) => {
    const t = text || files.map((f) => f.name).join(", ");
    setMessages((m) => [...m, { role: "user", text: t }, { role: "assistant", text: "Đã nhận. Lô này còn thiếu Packing List; trọng lượng B/L khớp tổng invoice." }]);
  };

  return (
    <UiLocaleProvider locale={appearance.locale}>
    <Toaster />
    {appearance.cursorEffect && <CursorEffect />}
    <div className={appearance.menuPosition === "top" ? "flex min-h-dvh flex-col" : "flex min-h-dvh"}>
      <Sidebar
        position={appearance.menuPosition}
        mobileOpen={mobileNav}
        onMobileOpenChange={setMobileNav}
        {...(appearance.menuPosition === "top" ? {} : { className: "sticky top-0" })}
        brand={{ logo: <BrandMark small decorative className="h-6 w-6" />, name: "KhaiBáo AI" }}
        items={NAV}
        activeId={activeId}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        onNavigate={(i) => setActiveId(i.id)}
        footer={
          <>
            <SidebarFooterButton icon={<SunMoon />} label="Giao diện" trailing={<BrandDot />} onClick={() => setAppearanceOpen(true)} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarUser name="Lê Minh Châu" role="Quản trị" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end">
                <DropdownMenuItem icon={<UserRound className="h-4 w-4" />}>Hồ sơ cá nhân</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<LogOut className="h-4 w-4" />} tone="danger">Đăng xuất</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <Dialog open={appearanceOpen} onOpenChange={setAppearanceOpen} defaultPresentation="panel">
        <DialogContent title="Cấu hình giao diện" icon={<SunMoon className="h-4 w-4" />} size="sm">
          <AppearancePanel value={appearance} onChange={setAppearance} allowCustomBrand brandAdjustments={adjustments} defaultTab={initialTab === "layout" || initialTab === "color" ? initialTab : "general"} />
        </DialogContent>
      </Dialog>
      <main className="@container min-w-0 flex-1 p-6">
        <Stack gap="lg">
          <div className="flex items-center gap-2">
            <SidebarMobileTrigger onClick={() => setMobileNav(true)} expanded={mobileNav} />
            <Breadcrumb items={[{ label: "Hồ sơ khai báo", href: "#" }, { label: "Nhập khẩu", href: "#" }, { label: "HS-NK-2609-021" }]} />
          </div>
          <PageHeader
            title="Hồ sơ khai báo"
            description="Theo dõi hồ sơ, kết quả đối chiếu và tờ khai của doanh nghiệp."
            actions={
              <>
                <Button variant="secondary">Xuất Excel</Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>Tạo hồ sơ</Button>
                  </DialogTrigger>
                  <DialogContent title="Tạo hồ sơ mới" icon={<span>▣</span>} description="Khai thông tin lô hàng, upload chứng từ ở bước sau.">
                    <Grid cols={{ base: 1, md: 2 }}>
                      <Field label="Mã loại hình" required>
                        <Select options={[{ value: "A11", label: "A11 – Nhập kinh doanh tiêu dùng" }, { value: "E21", label: "E21 – Nhập SXXK" }]} />
                      </Field>
                      <Field label="Đối tác nước ngoài" required hint="Tên người bán trên invoice">
                        <Input placeholder="KOREA BEARING SOLUTION CO., LTD." />
                      </Field>
                      <Field label="Ghi chú nội bộ" className="md:col-span-2">
                        <Textarea placeholder="Ví dụ: số PO, cảng hàng về" />
                      </Field>
                      <Field label="Số tờ khai đầu tiên" orientation="horizontal" hint="Nhãn bên trái – form dày ô như tờ khai" className="md:col-span-2">
                        <Input placeholder="107284900661" />
                      </Field>
                      <Field label="1.6 · Mã PTVC" framed required hint="Ô đứng riêng có khung – tên và nút ⓘ trên đường viền như nhóm ô" labelAction={<Button size="icon-sm" variant="ghost" aria-label="Hướng dẫn khai chỉ tiêu 1.6">i</Button>}>
                        <Input placeholder="1" />
                      </Field>
                      <Field label="1.33 · Mã địa điểm dỡ hàng" framed hint="LookupInput – nút tra cứu nằm trong viền ô">
                        <LookupInput className="w-full" placeholder="Nhập mã" onLookup={() => toast({ title: "Mở popup tra cứu" })} lookupLabel="Tra cứu Mã địa điểm dỡ hàng" />
                      </Field>
                      <FieldFrame legend="1.27 · Số kiện">
                        <Field label="Số lượng kiện"><Input placeholder="1" /></Field>
                      </FieldFrame>
                    </Grid>
                    <DialogFooter>
                      <Button variant="ghost">Huỷ</Button>
                      <Button onClick={() => toast({ tone: "success", title: "Đã tạo hồ sơ", description: "HS-NK-2610-004 · chờ upload chứng từ" })}>Tạo hồ sơ</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            }
          />

          <Stepper
            steps={STEPS}
            currentId="ocr"
            onStepClick={() => {}}
            action={
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary" size="sm" leftIcon={<GitBranch className="h-4 w-4" />}>Xem cây quy trình</Button>
                </DialogTrigger>
                <DialogContent title="Quy trình hồ sơ HS-NK-2609-021" icon={<GitBranch className="h-4 w-4" />} size="lg">
                  <WorkflowDiagram label="Quy trình hồ sơ HS-NK-2609-021" nodes={FLOW_NODES} edges={FLOW_EDGES} className="dialog-fill" onNodeClick={() => {}} />
                </DialogContent>
              </Dialog>
            }
          />

          <Grid cols={{ base: 1, sm: 2, xl: 4 }}>
            {[
              ["Hồ sơ đang mở", "3", "3 nhập · 0 xuất"],
              ["Sắp hoặc quá hạn", "2", "1 hồ sơ quá hạn"],
              ["Trường cần kiểm tra", "16", "trên 5 chứng từ"],
              ["Tờ khai đã truyền", "1", "qua Customs Hub"],
            ].map(([t, v, s]) => (
              <Card key={t}>
                <CardHeader>
                  <CardDescription>{t}</CardDescription>
                  <CardTitle as="h3" className="text-2xl">{v}</CardTitle>
                  <p className="text-xs text-fg-subtle">{s}</p>
                </CardHeader>
              </Card>
            ))}
          </Grid>

          <Card>
            <CardHeader>
              <CardTitle>Kết quả đối chiếu chéo</CardTitle>
              <CardDescription>HS-NK-2609-021 · KOREA BEARING SOLUTION CO., LTD.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="checks">
                <TabsList aria-label="Nhóm kết quả">
                  <TabsTrigger value="checks">Đối chiếu <Badge tone="warning">1</Badge></TabsTrigger>
                  <TabsTrigger value="fields">Trạng thái trường</TabsTrigger>
                  <TabsTrigger value="empty">Trống / đang tải</TabsTrigger>
                </TabsList>
                <TabsContent value="checks">
                  <Stack gap="sm">
                    <Alert tone="warning" title="Tên người mua là tên tiếng Anh">Tờ khai sẽ dùng tên đăng ký theo MST 0201234567.</Alert>
                    <Alert tone="danger" title="Thiếu cước vận chuyển">Incoterm FCA nhưng bộ chứng từ chưa có hóa đơn cước.</Alert>
                    <Alert tone="success" title="Trọng lượng khớp">Packing List 3.860,50 kg = B/L 3.860,50 kg.</Alert>
                    <Alert tone="info" title="Đang tra cứu mã HS">hscodepro đang xử lý 3 dòng hàng.</Alert>
                  </Stack>
                </TabsContent>
                <TabsContent value="fields">
                  <Stack direction="row" gap="sm" wrap>
                    {(["CROSS_CHECKED", "SINGLE_SOURCE", "CONFLICT", "INVALID_FORMAT", "MODEL_UNSURE", "USER_CONFIRMED", "PASS", "WARN", "FAIL", "SKIPPED", "GREEN_CHANNEL", "YELLOW_CHANNEL", "RED_CHANNEL"] as const).map((s) => (
                      <StatusBadge key={s} status={s} />
                    ))}
                  </Stack>
                  <Stack direction="row" gap="sm" wrap className="mt-4">
                    {(["neutral", "primary", "success", "warning", "danger", "info"] as const).map((t) => (
                      <Badge key={t} tone={t} variant="solid">{t}</Badge>
                    ))}
                  </Stack>
                </TabsContent>
                <TabsContent value="empty">
                  <Grid cols={{ base: 1, md: 2 }}>
                    <EmptyState title="Chưa có hồ sơ" description="Tạo hồ sơ đầu tiên để AI đọc bộ chứng từ." action={<Button size="sm">Tạo hồ sơ</Button>} />
                    <EmptyState illustration="no-results" title="Không có kết quả" description="Thử bỏ bớt bộ lọc." />
                    <EmptyState illustration="not-found" illustrationSize="lg" title="Không tìm thấy trang" />
                    <EmptyState illustration="error" title="Màn hình này gặp lỗi" description="Thử tải lại." />
                    <Stack gap="sm">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-24" />
                      <Spinner />
                    </Stack>
                  </Grid>
                </TabsContent>
              </Tabs>
            </CardContent>
            <CardFooter>
              <Button variant="ghost">Quay lại OCR</Button>
              <Button variant="danger">Huỷ hồ sơ</Button>
              <Button loading>Phê duyệt</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader><CardTitle>Form</CardTitle></CardHeader>
            <CardContent>
              <Grid cols={{ base: 1, md: 3 }}>
                <Field label="Số hóa đơn" required><Input defaultValue="KBS-INV-26-0917" /></Field>
                <Field label="Mã số thuế người mua" error="MST phải có 10 chữ số"><Input defaultValue="02012345" /></Field>
                <Field label="Điều kiện giao hàng" hint="Theo Incoterms 2020">
                  <Select options={[{ value: "CIF", label: "CIF" }, { value: "FCA", label: "FCA" }, { value: "EXW", label: "EXW" }]} />
                </Field>
              </Grid>
              <RadioGroup
                className="mt-4"
                label="Thanh trượt này dùng cho loại máy nào?"
                description="Câu hỏi của AI phân loại HS – chọn một"
                value={machineUse}
                onChange={setMachineUse}
                options={[
                  { value: "cnc", label: "Máy công cụ (CNC, máy phay, máy tiện)" },
                  { value: "3d", label: "Máy in 3D / thiết bị tự động hoá nhẹ" },
                  { value: "other", label: "Khác", description: "Ghi rõ ở ô trả lời khác" },
                ]}
              />
              <RadioGroup
                className="mt-4"
                orientation="horizontal"
                label="Nhóm loại hình (xếp ngang)"
                value={machineUse}
                onChange={setMachineUse}
                options={[
                  { value: "cnc", label: "Kinh doanh" },
                  { value: "3d", label: "Sản xuất xuất khẩu" },
                  { value: "other", label: "Gia công" },
                ]}
              />
              <Stack direction="row" gap="md" className="mt-4" align="center" wrap>
                <Checkbox label="Đã kiểm tra chứng từ gốc" defaultChecked />
                <Button size="sm" variant="secondary">Nhỏ</Button>
                <Button>Vừa</Button>
                <Button size="lg">Lớn</Button>
                <Button variant="link">Liên kết</Button>
              </Stack>
            </CardContent>
          </Card>

          <Showcase />

          {/* Thành phần thêm sau: thẻ chỉ số, nhóm form, badge, toast theo tiến trình, hình trang trí AI */}
          <Grid cols={{ base: 2, xl: 4 }} stagger>
            <StatCard icon={<FolderOpen />} label="Hồ sơ đang mở" value={8} hint="7 nhập · 1 xuất" />
            <StatCard icon={<FileCheck2 />} tone="danger" label="Sắp hoặc quá hạn khai" value={4} hint="1 hồ sơ đã quá hạn" hintTone="danger" />
            <StatCard icon={<Send />} tone="success" label="Tỷ lệ luồng xanh" value="67%" hint="4/6 tờ khai đã phân luồng" />
            <StatCard icon={<Sparkles />} tone="info" label="Đang tải" value={0} loading />
          </Grid>
          <Card>
            <CardHeader>
              <CardTitle>IconTile – ô icon đầu thẻ / đầu dòng</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <IconTile icon={<FolderOpen />} />
              <IconTile icon={<FileCheck2 />} tone="danger" size="md" />
              <IconTile icon={<Send />} tone="success" size="sm" />
              <IconTile icon={<Sparkles />} tone="warning" />
              <IconTile icon={<Sparkles />} tone="info" />
              <IconTile icon={<Sparkles />} tone="neutral" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-5">
              <CardTitle>FormSection – form chia nhóm</CardTitle>
            </CardHeader>
            <CardContent>
              <FormSection title="Khai báo" description="Mã loại hình và chi cục Hải quan nơi đăng ký tờ khai.">
                <Field label="Mã loại hình" required className="md:max-w-xs">
                  <Select options={[{ value: "A11", label: "A11 – Nhập kinh doanh tiêu dùng" }, { value: "E21", label: "E21 – Nhập SXXK" }]} />
                </Field>
                <Checkbox label="Ghi nhớ lựa chọn cho hồ sơ sau" defaultChecked />
              </FormSection>
              <FormSection title="Ghi chú" description="Chỉ nội bộ, không gửi Hải quan.">
                <Field label="Ghi chú nội bộ"><Textarea placeholder="Ví dụ: số PO, cảng hàng về" /></Field>
              </FormSection>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <Stack gap="md">
                <p className="text-sm font-medium">Badge – cỡ, chấm, icon · trạng thái hồ sơ / tờ khai dùng chung · toast theo tiến trình</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge size="sm" tone="info">Nhỏ</Badge>
                  <Badge tone="success" dot>Vừa, có chấm</Badge>
                  <Badge size="lg" tone="warning" icon={<Sparkles />}>Lớn, có icon</Badge>
                  <StatusBadge status="DOSSIER_APPROVED" />
                  <StatusBadge status="DOSSIER_NEEDS_REVIEW" />
                  <StatusBadge status="CUSTOMS_INSPECTING" />
                  <StatusBadge status="CUSTOMS_CLEARED" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void toastPromise(new Promise((r) => setTimeout(r, 1800)), {
                        loading: { title: "Đang ký số và gửi tờ khai…" },
                        success: { title: "Đã gửi tờ khai", description: "Customs Hub đang truyền tới VNACCS." },
                        error: { title: "Không gửi được" },
                      })
                    }
                  >
                    Toast theo tiến trình
                  </Button>
                  <span className="text-sm text-fg-muted">Số đếm chạy: <CountUp value={1284} /></span>
                </div>
                <p className="text-sm font-medium">Thao tác trên dòng – rê chuột vào dòng để hiện icon; nút … luôn có đủ thao tác</p>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {["HS-NK-2610-021", "HS-XK-2610-025"].map((code) => (
                    <li key={code} className="group flex items-center justify-between gap-3 px-3 py-2 hover:bg-surface-muted">
                      <span className="font-mono text-sm">{code}</span>
                      <RowActions
                        rowLabel={code}
                        actions={[
                          { id: "open", label: "Mở hồ sơ", icon: <FolderOpen />, onSelect: () => toast({ title: `Mở ${code}` }) },
                          { id: "send", label: "Truyền Hải quan", icon: <Send />, onSelect: () => toast({ title: `Truyền ${code}` }) },
                          { id: "cancel", label: "Hủy hồ sơ", icon: <LogOut />, tone: "danger", onSelect: () => toast({ tone: "warning", title: `Hủy ${code}` }) },
                        ]}
                      />
                    </li>
                  ))}
                </ul>
                <p className="text-sm font-medium">Loading – biểu tượng tải, ba chấm, khối đang tải, lớp phủ, khung tải dựng sẵn</p>
                <div className="flex flex-wrap items-center gap-6">
                  <Loader size="sm" /><Loader /><Loader size="lg" />
                  <Spinner size="sm" /><Spinner /><LoadingDots />
                </div>
                <Grid cols={{ base: 1, lg: 2 }}>
                  <Card><LoadingState title="Đang đọc chứng từ…" description="AI đang đọc 2/3 chứng từ. Bạn có thể rời màn hình." /></Card>
                  <LoadingOverlay loading label="Đang lưu…">
                    <Card className="p-5"><SkeletonForm fields={3} /></Card>
                  </LoadingOverlay>
                  <SkeletonCard />
                  <Card className="p-5"><SkeletonList rows={3} /></Card>
                </Grid>
                <SkeletonStats />
                <SkeletonTable rows={4} />
                <div className="relative overflow-hidden rounded-lg bg-primary p-6 text-primary-fg">
                  <AiBackdrop />
                  <AiScanCard className="relative" title="COMMERCIAL INVOICE" fields={[{ label: "Số invoice", value: "HP-2610-078" }, { label: "Trị giá", value: "20.850,00 USD" }, { label: "Mã HS", value: "8482.10.00" }]} />
                </div>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
        <Card>
          <CardContent>
            <Stack gap="sm">
              <p className="text-sm font-medium">RobotAvatar – linh vật trợ lý AI theo trạng thái (quay đầu theo con trỏ, click để nhảy)</p>
              <div className="flex flex-wrap gap-6">
                {(["idle", "thinking", "searching", "listening", "speaking", "working", "happy", "error", "sleeping"] as const).map((s) => (
                  <div key={s} className="flex flex-col items-center gap-1 text-xs text-fg-muted">
                    <RobotAvatar state={s} size={72} />
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </Stack>
          </CardContent>
        </Card>
      </main>

      <AssistantPanel
        open={aiOpen}
        onOpenChange={setAiOpen}
        mode={aiMode}
        onModeChange={setAiMode}
        name="Trợ lý KhaiBáo"
        tag="CARA"
        historyCount={20}
        composer={<ChatComposer onSend={send} accept=".pdf,.zip" onMicClick={() => {}} />}
      >
        {messages.length === 0 ? (
          <Stack gap="lg">
            <AssistantWelcome role="Trợ lý chứng từ xuất nhập khẩu" name="Trợ lý KhaiBáo" description="Hỏi về hồ sơ hoặc kéo bộ chứng từ vào đây – tôi chỉ ra chỗ thiếu, chỗ lệch và bước làm tiếp." />
            <SuggestionChips onPick={(s) => send(s, [])} suggestions={["Lô MIL48022039 còn thiếu chứng từ gì?", "Vì sao hồ sơ HS-NK-2609-021 cần duyệt?", "Tính trị giá tính thuế khi Incoterm là FCA"]} />
          </Stack>
        ) : (
          <Stack gap="sm">{messages.map((m, i) => <ChatMessage key={i} role={m.role}>{m.text}</ChatMessage>)}</Stack>
        )}
      </AssistantPanel>
      {!aiOpen && <AssistantLauncher onClick={() => setAiOpen(true)} />}
    </div>
    </UiLocaleProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
