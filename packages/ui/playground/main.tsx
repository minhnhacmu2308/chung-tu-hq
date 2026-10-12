// Playground: xem toàn bộ component @kb/ui và thử cấu hình giao diện. Chạy: pnpm ui:playground
import { FileCheck2, FolderOpen, GitBranch, LayoutDashboard, LogOut, Send, Settings2, Sparkles, SunMoon, UserRound, Wrench } from "lucide-react";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/styles/index.css";
import {
  Alert, AppearancePanel, AssistantLauncher, AssistantPanel, AssistantWelcome, Badge, Button, Card, CardContent,
  CardDescription, CardFooter, CardHeader, CardTitle, ChatComposer, ChatMessage, Checkbox, Dialog, DialogContent,
  DialogFooter, DialogTrigger, EmptyState, Field, Grid, Input, PageHeader, Select, Skeleton, Spinner, Stack,
  StatusBadge, SuggestionChips, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, type AssistantMode,
  BrandDot, Sidebar, SidebarFooterButton, SidebarUser, type NavItem,
  Stepper, WorkflowDiagram, type FlowEdge, type FlowNode,
  Breadcrumb, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  SidebarMobileTrigger, Toaster, toast, UiLocaleProvider,
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

const ATTRS = ["data-theme", "data-density", "data-font-size", "data-font", "data-gray", "data-backdrop", "data-radius", "data-cursor-effect", "data-page-description"];

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
      fromUrl[k] = typeof def === "boolean" ? v === "1" || v === "true" : k === "brand" ? `#${v.replace(/^#/, "")}` : v;
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
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);

  const send = (text: string, files: File[]) => {
    const t = text || files.map((f) => f.name).join(", ");
    setMessages((m) => [...m, { role: "user", text: t }, { role: "assistant", text: "Đã nhận. Lô này còn thiếu Packing List; trọng lượng B/L khớp tổng invoice." }]);
  };

  return (
    <UiLocaleProvider locale={appearance.locale}>
    <Toaster />
    <div className="flex min-h-dvh">
      <Sidebar
        mobileOpen={mobileNav}
        onMobileOpenChange={setMobileNav}
        className="sticky top-0"
        brand={{ logo: <Wrench className="h-4 w-4" />, name: "KhaiBáo AI" }}
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
        <DialogContent title="Cấu hình giao diện" size="sm">
          <AppearancePanel value={appearance} onChange={setAppearance} allowCustomBrand brandAdjustments={adjustments} />
        </DialogContent>
      </Dialog>
      <main className="min-w-0 flex-1 p-6">
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
                  <WorkflowDiagram label="Quy trình hồ sơ HS-NK-2609-021" nodes={FLOW_NODES} edges={FLOW_EDGES} className="h-[70dvh]" onNodeClick={() => {}} />
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
        </Stack>
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
