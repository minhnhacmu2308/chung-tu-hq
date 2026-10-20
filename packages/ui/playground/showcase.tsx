// Trình diễn các component dữ liệu / nhập liệu / phản hồi của @kb/ui.
import { Filter, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import {
  Abbreviation, Avatar, AvatarGroup, Badge, Button, Card, CardContent, CardHeader, CardTitle, Combobox, createDataTableColumnHelper, DataTable,
  DatePicker, DateRangePicker, Disclosure, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  Field, FileDropzone, FileUploadList, Grid, Input, Popover, PopoverContent, PopoverTrigger, Progress, Stack, StatusBadge, Switch,
  STATUS_META, toast, Tooltip, type IsoDateRange, type Status, type UploadItem,
} from "../src/index.js";

const ROW_STATUSES: Status[] = ["NEEDS_REVIEW", "AUTO_APPROVED", "GREEN_CHANNEL", "YELLOW_CHANNEL", "RED_CHANNEL"];
type Row = { id: string; code: string; partner: string; type: "NK" | "XK"; value: number; status: Status; due: string };

const ROWS: Row[] = Array.from({ length: 37 }, (_, i) => {
  const partners = ["KOREA BEARING SOLUTION", "ARTEMIDE S.P.A.", "SLAMP S.P.A.", "DONGGUAN CHANGLI TRADING", "NORDIC APPAREL GROUP AB"];
  return {
    id: `r${i}`,
    code: `HS-${i % 4 === 0 ? "XK" : "NK"}-26${String(9 + (i % 3)).padStart(2, "0")}-${String(100 + i).padStart(3, "0")}`,
    partner: partners[i % partners.length]!,
    type: i % 4 === 0 ? "XK" : "NK",
    value: Math.round((1000 + ((i * 7919) % 50000)) * 100) / 100,
    status: ROW_STATUSES[i % ROW_STATUSES.length]!,
    due: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}`,
  };
});

const col = createDataTableColumnHelper<Row>();
const COLUMNS = col.columns([
  col.accessor("code", { header: "Mã hồ sơ", size: 150, minSize: 110, meta: { filter: "text", hideable: false }, cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  col.accessor("partner", { header: "Đối tác", size: 260, meta: { wrap: true, filter: "text" } }),
  col.accessor("type", { header: "Loại", size: 120, minSize: 110, meta: { filter: "select" } }),
  col.accessor("value", {
    header: "Trị giá (USD)",
    meta: { align: "end" },
    cell: (c) => c.getValue().toLocaleString("vi-VN", { minimumFractionDigits: 2 }),
  }),
  col.accessor("due", { header: "Hạn khai", size: 120 }),
  col.accessor("status", {
    header: "Trạng thái",
    size: 170,
    meta: {
      filter: "select",
      filterOptions: ROW_STATUSES.map((v) => ({ value: v, label: STATUS_META[v].label })),
    },
    cell: (c) => <StatusBadge status={c.getValue()} /> }),
]);

const PORTS = [
  { value: "VNHPH", label: "Hải Phòng", description: "Cảng Hải Phòng" },
  { value: "VNCLI", label: "Cát Lái", description: "TP. Hồ Chí Minh" },
  { value: "VNDAD", label: "Đà Nẵng", description: "Cảng Tiên Sa" },
  { value: "VNSGN", label: "Tân Sơn Nhất", description: "Sân bay – TP. Hồ Chí Minh" },
  { value: "VNHAN", label: "Nội Bài", description: "Sân bay – Hà Nội" },
];
const DOC_TYPES = [
  { value: "CI", label: "Commercial Invoice" },
  { value: "PL", label: "Packing List" },
  { value: "BL", label: "Bill of Lading" },
  { value: "CO", label: "C/O" },
  { value: "AN", label: "Arrival Notice" },
];

// 20.000 đối tác giả lập để thử Combobox với danh sách rất dài
const CITIES = ["Hà Nội", "Hải Phòng", "Đà Nẵng", "Hồ Chí Minh", "Cần Thơ", "Bình Dương", "Đồng Nai", "Bắc Ninh"];
const PARTNERS = Array.from({ length: 20_000 }, (_, i) => ({
  value: `p${i}`,
  label: `Công ty TNHH ${CITIES[i % CITIES.length]} số ${String(i + 1).padStart(5, "0")}`,
  description: `MST 03${String(10_000_000 + i * 7).slice(0, 8)}`,
}));

const INITIAL_UPLOADS: UploadItem[] = [
  { id: "u1", name: "INV HD 53 dot 2.pdf", size: 813210, status: "done" },
  { id: "u2", name: "BL HD 53 dot 2.PDF", size: 1129518, status: "uploading", progress: 62 },
  { id: "u3", name: "Cuoc HD 53 dot 2.pdf", size: 341879, status: "queued" },
  { id: "u4", name: "CONG VAN.pdf", size: 431357, status: "error", error: "Mất kết nối khi tải lên" },
];

export function Showcase() {
  const [port, setPort] = useState<string | null>("VNHPH");
  const [docs, setDocs] = useState<string[]>(["CI", "BL"]);
  const [invoiceDate, setInvoiceDate] = useState<string | null>("2026-09-18");
  const [period, setPeriod] = useState<IsoDateRange>({ from: "2026-10-01", to: "2026-10-31" });
  const [uploads, setUploads] = useState<UploadItem[]>(INITIAL_UPLOADS);
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [partner, setPartner] = useState<string | null>("p15432");

  return (
    <Stack gap="lg">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Danh sách hồ sơ</CardTitle>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="sm" leftIcon={<Filter className="h-4 w-4" />}>Bộ lọc</Button>
            </PopoverTrigger>
            <PopoverContent showClose className="w-80">
              <Stack gap="md">
                <p className="text-sm font-semibold">Lọc hồ sơ</p>
                <Field label="Kỳ"><DateRangePicker value={period} onChange={setPeriod} /></Field>
                <Field label="Cảng"><Combobox options={PORTS} value={port} onChange={setPort} clearable /></Field>
                <Button size="sm" onClick={() => toast({ tone: "info", title: "Đã áp dụng bộ lọc" })}>Áp dụng</Button>
              </Stack>
            </PopoverContent>
          </Popover>
        </CardHeader>
        <CardContent>
          <DataTable
            aria-label="Danh sách hồ sơ"
            columns={COLUMNS}
            data={ROWS}
            getRowId={(r) => r.id}
            selectable
            searchable
            columnToggle
            resizable
            rowLabel={(r) => r.code}
            onRowClick={(r) => toast({ tone: "info", title: `Mở hồ sơ ${r.code}` })}
            pagination={{ initialPageSize: 8 }}
            rowActions={(r) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label={`Thao tác cho ${r.code}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => toast({ tone: "success", title: `Đã nhân bản ${r.code}` })}>Nhân bản</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => toast({ tone: "info", title: "Đã xuất Excel" })}>Xuất Excel</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem tone="danger" onSelect={() => toast({ tone: "danger", title: `Đã huỷ ${r.code}`, action: { label: "Hoàn tác", onClick: () => {} } })}>
                    Huỷ hồ sơ
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          />
        </CardContent>
      </Card>

      <Grid cols={{ base: 1, lg: 2 }}>
        <Card>
          <CardHeader><CardTitle>Upload chứng từ</CardTitle></CardHeader>
          <CardContent>
            <Stack gap="md">
              <FileDropzone
                accept=".pdf,.zip"
                multiple
                maxSize={20 * 1024 * 1024}
                maxFiles={10}
                onFiles={(files) =>
                  setUploads((u) => [...u, ...files.map((f, i) => ({ id: `n${Date.now()}${i}`, name: f.name, size: f.size, status: "queued" as const }))])
                }
              />
              <FileUploadList
                items={uploads}
                onRemove={(id) => setUploads((u) => u.filter((x) => x.id !== id))}
                onRetry={(id) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, status: "uploading", progress: 10 } : x)))}
              />
              {/* Dạng gọn: đặt trong ô của từng loại chứng từ */}
              <FileDropzone size="sm" accept=".pdf,.jpg,.png" labels={{ title: "Thả hoặc chọn file Packing List", browse: "" }} onFiles={() => {}} />
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Nhập liệu nâng cao</CardTitle></CardHeader>
          <CardContent>
            <Stack gap="md">
              <Field label="Cảng dỡ hàng" hint="Gõ không dấu: “hai phong” · nút Mở rộng để đọc hết mô tả"><Combobox options={PORTS} value={port} onChange={setPort} clearable expandable /></Field>
              <Field label="Loại chứng từ"><Combobox multiple options={DOC_TYPES} value={docs} onChange={setDocs} /></Field>
              <Field label={<>1.5 · <Abbreviation short="Mã PLHH" full="Mã phân loại hàng hóa" /></>} hint="Nhãn dài viết tắt – bấm chữ gạch chấm xem tên đầy đủ"><Input /></Field>
              <Field label="Đối tác (20.000 mục)" hint="Gõ “da nang 00123” – chỉ hiện 100 kết quả đầu, gõ thêm để thu hẹp">
                <Combobox options={PARTNERS} value={partner} onChange={setPartner} clearable />
              </Field>
              <Field label="Kỳ báo cáo" hint="Gõ tay 01/10/2026 hoặc chọn trên lịch">
                <DateRangePicker value={period} onChange={setPeriod} min="2024-01-01" max="2026-12-31" />
              </Field>
              <Field label="Ngày hóa đơn"><DatePicker value={invoiceDate} onChange={setInvoiceDate} min="2024-01-01" /></Field>
              <Disclosure title="Thông tin khác (không bắt buộc)">Nộp thuế, ngân hàng trả thay, bảo lãnh…</Disclosure>
              <Disclosure title="Dòng 1 · Vòng bi tuyến tính LM20" meta={<Badge tone="info">2 ô đã đổi</Badge>} actions={<Button size="sm" variant="ghost">Bỏ dòng</Button>} defaultOpen>
                Bảng so sánh Trước | Sau
              </Disclosure>
              <Switch label="Tự truyền tờ khai khi không còn lỗi" description="Chỉ áp dụng cho hồ sơ luồng tự duyệt" checked={autoSubmit} onCheckedChange={setAutoSubmit} />
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Card>
        <CardHeader><CardTitle>Tiến độ, người dùng, gợi ý</CardTitle></CardHeader>
        <CardContent>
          <Grid cols={{ base: 1, md: 2 }} gap="lg">
            <Stack gap="md">
              <Progress label="Đọc chứng từ" value={45} />
              <Progress label="Đối chiếu chéo" value={100} tone="success" />
              <Progress label="Tra mã HS" value={null} />
              <Progress label="Thiếu cước" value={30} tone="danger" />
            </Stack>
            <Stack gap="md">
              <Stack direction="row" gap="sm" align="center">
                <Avatar name="Lê Minh Châu" size="lg" />
                <Avatar name="Nguyễn Văn Phát" />
                <Avatar name="Trần Thu Hà" size="sm" />
              </Stack>
              <AvatarGroup people={["Lê Minh Châu", "Nguyễn Văn Phát", "Trần Thu Hà", "Phạm Châu", "Đỗ Quang"].map((name) => ({ name }))} max={3} />
              <Stack direction="row" gap="sm">
                <Tooltip content="Tải lại dữ liệu đối chiếu"><Button variant="secondary" size="sm">Làm mới</Button></Tooltip>
                <Button size="sm" onClick={() => toast({ tone: "success", title: "Đã lưu nháp", description: "Tờ khai HS-NK-2609-021" })}>Toast thành công</Button>
                <Button size="sm" variant="danger" onClick={() => toast({ tone: "danger", title: "Truyền tờ khai lỗi", description: "Customs Hub không phản hồi", action: { label: "Thử lại", onClick: () => {} } })}>Toast lỗi</Button>
              </Stack>
            </Stack>
          </Grid>
        </CardContent>
      </Card>
    </Stack>
  );
}
