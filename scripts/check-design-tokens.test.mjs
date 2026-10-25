import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkRepo, checkSource } from "./check-design-tokens.mjs";

const rules = (path, text) => checkSource(path, text).map((p) => p.rule);

describe("check-design-tokens", () => {
  it("cho qua code dùng token", () => {
    assert.deepEqual(rules("apps/web/src/features/x/a.tsx", `<Card className="bg-surface text-fg-muted p-4 gap-2 rounded-md" />`), []);
    assert.deepEqual(rules("packages/ui/src/components/b.tsx", `"bg-neutral-subtle text-neutral-subtle-fg bg-danger"`), []);
  });

  it("chặn mã hex, hàm màu, màu Tailwind mặc định ở mọi nơi", () => {
    assert.deepEqual(rules("packages/ui/src/components/b.tsx", `const c = "#0F6B55";`), ["raw-hex"]);
    assert.deepEqual(rules("apps/web/a.css", `.x { color: rgb(1 2 3); }`), ["raw-color-fn"]);
    assert.deepEqual(rules("apps/web/a.tsx", `className="bg-blue-500 hover:text-gray-700"`), ["tw-palette"]);
    assert.deepEqual(rules("apps/web/a.tsx", `className="text-white"`), ["tw-palette"]);
  });

  it("chặn bo góc ngoài thang (không theo cấu hình giao diện)", () => {
    assert.deepEqual(rules("packages/ui/src/c.tsx", `className="rounded-xl border"`), ["radius-off-scale"]);
    assert.deepEqual(rules("apps/web/a.tsx", `className="hover:rounded-t-2xl"`), ["radius-off-scale"]);
    assert.deepEqual(rules("packages/ui/src/c.tsx", `className="rounded-lg rounded-t-md rounded-full rounded-sm"`), []);
  });

  it("chặn giá trị màu tùy ý, dark:, màu trong style inline", () => {
    assert.ok(rules("packages/ui/src/c.tsx", `className="bg-[#fff]"`).includes("arbitrary-color"));
    assert.ok(rules("packages/ui/src/c.tsx", `className="bg-[var(--kb-color-primary)]"`).includes("arbitrary-color"));
    assert.deepEqual(rules("packages/ui/src/c.tsx", `className="dark:bg-surface"`), ["dark-variant"]);
    assert.ok(rules("packages/ui/src/c.tsx", `<div style={{ color: x }} />`).includes("inline-color"));
  });

  it("trong apps: chặn giá trị tùy ý, style inline, phần tử điều khiển thô, import Radix", () => {
    assert.deepEqual(rules("apps/web/a.tsx", `className="w-[437px]"`), ["apps-arbitrary-value"]);
    assert.deepEqual(rules("apps/web/a.tsx", `<div style={{ width: 4 }} />`), ["apps-inline-style"]);
    assert.deepEqual(rules("apps/web/a.tsx", `<button onClick={f}>X</button>`), ["apps-raw-control"]);
    assert.deepEqual(rules("apps/web/a.tsx", `import * as D from "@radix-ui/react-dialog";`), ["apps-radix-direct"]);
    // Thứ đã có component chuẩn thì không tự dựng lại trong app.
    assert.deepEqual(rules("apps/web/a.tsx", `import { MoreHorizontal, Plus } from "lucide-react";`), ["apps-row-menu"]);
    // Thao tác trên dòng: truyền rowActions cho DataTable (nổi khi rê chuột), không tự dựng cột thao tác.
    assert.deepEqual(rules("apps/web/a.tsx", `col.display({ id: "actions", cell: (c) => <RowActions rowLabel="x" actions={[]} /> })`), ["apps-actions-column"]);
    assert.deepEqual(rules("apps/web/a.tsx", `meta: { align: "end", sticky: "end" },`), ["apps-actions-column"]);
    assert.deepEqual(rules("apps/web/a.tsx", `<DataTable rowActions={(r) => <RowActions rowLabel={r.code} actions={a} />} />`), []);
    // Trạng thái nghiệp vụ: StatusBadge (thêm vào STATUS_META), không tự dựng bảng { label, tone }.
    assert.deepEqual(rules("apps/web/a.tsx", `const STATUS: Record<Member["status"], { tone: "success" | "neutral"; label: string }> = {`), ["apps-status-map"]);
    assert.deepEqual(rules("apps/web/a.tsx", `const STATUS: Record<S, { label: string; tone: Tone }> = {`), ["apps-status-map"]);
    assert.deepEqual(rules("apps/web/a.tsx", `const STATUS = { ACTIVE: "ACCOUNT_ACTIVE" } as const satisfies Record<S, Status>;`), []);
    assert.deepEqual(rules("apps/web/a.tsx", `<Skeleton className="h-96" />`), ["apps-big-skeleton"]);
    assert.deepEqual(rules("apps/web/a.tsx", `<Skeleton className="mt-2 h-120 w-full" />`), ["apps-big-skeleton"]);
    assert.deepEqual(rules("apps/web/a.tsx", `<Skeleton className="h-10 w-64" />`), []); // khối nhỏ đúng dáng một dòng/ô thì được
    assert.deepEqual(rules("packages/ui/src/c.tsx", `import { MoreHorizontal } from "lucide-react"; <Skeleton className="h-96" />`), []);
  });

  it("trong apps: chặn tắt nút chuyển panel của popup, bảng tự viết, tự chỉnh icon, tự dựng ô icon", () => {
    assert.deepEqual(rules("apps/web/a.tsx", `<DialogContent title="Sửa gói" allowPresentationToggle={false}>`), ["apps-dialog-toggle-off"]);
    assert.deepEqual(rules("apps/web/a.tsx", `<DialogContent title="Quy trình" allowPresentationToggle>`), []);
    assert.deepEqual(rules("apps/web/a.tsx", `<table className="w-full text-sm">`), ["apps-raw-table"]);
    assert.deepEqual(rules("apps/web/a.tsx", `<span className="inline-flex [&>svg]:h-4 [&>svg]:w-4">{icon}</span>`), ["apps-svg-selector"]);
    assert.deepEqual(rules("apps/web/a.tsx", `<div className="grid grid-cols-1 lg:grid-cols-3">`), ["apps-viewport-layout"]);
    assert.deepEqual(rules("apps/web/a.tsx", `<Card className="lg:col-span-2">`), ["apps-viewport-layout"]);
    assert.deepEqual(rules("apps/web/a.tsx", `<div className="grid grid-cols-1 cq-lg:grid-cols-3"><Card className="cq-lg:col-span-2">`), []);
    assert.deepEqual(rules("apps/web/a.tsx", `<Field className="md:max-w-xs"><span className="max-sm:sr-only">`), ["apps-viewport-layout"]);
    assert.deepEqual(rules("apps/web/a.tsx", `<Grid cols={{ base: 1, md: 2 }}><span className="cq-max-sm:sr-only">`), []);
    assert.deepEqual(rules("apps/web/src/features/shell/app-shell.tsx", `<main className="px-4 md:px-8">`), []);
    assert.deepEqual(rules("apps/web/a.tsx", `<span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-subtle text-primary-subtle-fg">`), ["apps-icon-tile"]);
    assert.deepEqual(rules("apps/web/a.tsx", `<li className="rounded-md border p-3 bg-warning-subtle">`), []); // nền dịu cho cả dòng thì được
    assert.deepEqual(rules("packages/ui/src/c.tsx", `<table className="w-full" /> <span className="[&>svg]:h-4 justify-center bg-primary-subtle" />`), []);
  });

  it("@kb/ui được dùng giá trị kích thước tùy ý và biến CSS cục bộ (không phải token)", () => {
    assert.deepEqual(rules("packages/ui/src/c.tsx", `className="max-h-[calc(100dvh-2rem)] bg-[var(--swatch)]"`), []);
  });

  it("file token, bộ máy theme và test được chứa mã màu", () => {
    assert.deepEqual(rules("packages/ui/src/styles/tokens.css", `--kb-color-bg: #FFFFFF;`), []);
    assert.deepEqual(rules("packages/ui/src/theme/palette.ts", `50: "#F8FAFC"`), []);
    assert.deepEqual(rules("packages/ui/src/theme/x.test.ts", `expect(c).toBe("#0F6B55")`), []);
  });

  it("không nhầm neo URL hay HTML entity là mã màu", () => {
    assert.deepEqual(rules("packages/ui/src/c.tsx", `src={url + "#page=2"} title="&#039;"`), []);
  });

  it("thoát hiểm bằng comment có lý do (cùng dòng hoặc dòng trên)", () => {
    assert.deepEqual(rules("apps/web/a.tsx", `// kb-allow-raw: logo đối tác bắt buộc màu gốc\n<img className="bg-[#ffcc00]" />`), []);
    assert.ok(rules("apps/web/a.tsx", `<img className="bg-[#ffcc00]" /> // kb-allow-raw:`).length > 0, "thiếu lý do thì không được miễn");
  });

  it("apps/web: chặn chữ tiếng Việt viết cứng; cho qua bộ nhãn, nội dung pháp lý *.vi.ts, comment, test, route API", () => {
    const f = "apps/web/src/features/x/a.tsx";
    assert.deepEqual(rules(f, `<Button>Lưu hồ sơ</Button>`), ["apps-hardcoded-text"]);
    assert.deepEqual(rules(f, `toast.error("Không tải được");`), ["apps-hardcoded-text"]);
    assert.deepEqual(rules(f, `<Button>{t.save}</Button> // nút Lưu`), []);
    assert.deepEqual(rules(f, `  // Đổi ngôn ngữ → dựng lại`), []);
    assert.deepEqual(rules(f, `   * Hàm này trả nhãn`), []);
    assert.deepEqual(rules(f, `{/* Khối chú thích */}<Card />`), []);
    assert.deepEqual(rules(f, `const url = "https://vnaccs.example/đi";`), ["apps-hardcoded-text"], "// trong URL không phải comment");
    assert.deepEqual(rules("apps/web/src/features/x/a.messages.ts", `vi: { save: "Lưu" },`), []);
    assert.deepEqual(rules("apps/web/src/features/x/print.vi.ts", `title: "TỜ KHAI HÀNG HÓA NHẬP KHẨU"`), []);
    assert.deepEqual(rules("apps/web/src/features/x/a.test.tsx", `getByText("Lưu")`), []);
    assert.deepEqual(rules("apps/web/src/app/api/x/route.ts", `throw new HttpError(404, "X", "Không thấy")`), []);
    assert.deepEqual(rules("apps/web/src/mocks/seed/a.ts", `name: "Công ty An Phát"`), [], "dữ liệu mẫu không phải nhãn giao diện");
  });

  it("apps/web: chặn chữ không dấu viết cứng trong JSX và prop hiển thị; cho qua biểu thức, kiểu generic, bộ nhãn, test", () => {
    const f = "apps/web/src/features/x/a.tsx";
    assert.deepEqual(rules(f, `<Button>Open EDI</Button>`), ["apps-hardcoded-latin-text"]);
    assert.deepEqual(rules(f, `<span>MST <span className="font-mono">{x}</span></span>`), ["apps-hardcoded-latin-text"]);
    assert.deepEqual(rules(f, `<Field label="Email" required>`), ["apps-hardcoded-latin-text"]);
    assert.deepEqual(rules(f, `<Input placeholder="name@company.com" />`), ["apps-hardcoded-latin-text"]);
    assert.deepEqual(rules(f, `<Field label={t.email}><Input placeholder={t.emailExample} /></Field>`), []);
    assert.deepEqual(rules(f, `{a ? <Spinner /> : b.isError ? <LoadError /> : null}`), []);
    assert.deepEqual(rules(f, `const rows = items.filter((a) => at >= start && at <= end);`), []);
    assert.deepEqual(rules(f, `function f(t: Record<K, string>, labels: Record<K, string>) {}`), []);
    assert.deepEqual(rules(f, `<Badge>{n}</Badge><Icon className="h-4 w-4" />`), []);
    assert.deepEqual(rules(f, `{/* kb-allow-raw: ví dụ định dạng mã */}\n<Input placeholder="BI820001" />`), []);
    assert.deepEqual(rules("apps/web/src/features/x/a.test.tsx", `<Button>Save</Button>`), []);
    assert.deepEqual(rules("apps/web/src/features/x/a.messages.ts", `en: { save: "Save" },`), []);
  });

  it("toàn repo hiện tại sạch", () => {
    assert.deepEqual(checkRepo(), []);
  });
});
