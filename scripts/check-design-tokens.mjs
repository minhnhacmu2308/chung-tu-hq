#!/usr/bin/env node
// Chặn mọi cách "lách" design system. Chạy: `pnpm lint:tokens` (CI bắt buộc).
// Thoát hiểm (hiếm, phải có lý do): thêm comment `kb-allow-raw: <lý do>` trên cùng dòng hoặc dòng ngay trên.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCAN_DIRS = ["apps", "packages"];
const EXT = /\.(tsx?|jsx?|mjs|css)$/;

/** Nơi DUY NHẤT được định nghĩa màu: file token và bộ máy theme (+ test của chúng). */
const ALLOW_RAW_COLOR = [/^packages\/ui\/src\/styles\/tokens\.css$/, /^packages\/ui\/src\/theme\//, /\.test\.(tsx?|mjs)$/];

const PALETTE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const UTIL = "bg|text|border|border-[trblxy]|ring|ring-offset|fill|stroke|from|via|to|outline|decoration|divide|placeholder|accent|caret|shadow";

/** Chữ tiếng Việt có dấu – dấu hiệu nhãn giao diện viết cứng. */
const VI_CHARS = "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ";

/** @type {{id:string, scope:"all"|"apps", test:RegExp, msg:string, rawColor?:boolean, skipPath?:RegExp, onlyPath?:RegExp, codeOnly?:boolean}[]} */
export const RULES = [
  { id: "raw-hex", scope: "all", rawColor: true, test: /(^|[^\w&/])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])/, msg: "Mã màu hex. Dùng token: bg-surface, text-fg-muted, bg-primary…" },
  { id: "raw-color-fn", scope: "all", rawColor: true, test: /\b(rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/, msg: "Hàm màu thô. Định nghĩa màu chỉ trong tokens.css." },
  { id: "tw-palette", scope: "all", test: new RegExp(`(?<![\\w-])(?:[\\w-]+:)*(?:${UTIL})-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?![\\w-])`), msg: "Màu mặc định của Tailwind (đã bị tắt). Dùng token ngữ nghĩa: text-danger-subtle-fg, bg-surface-muted…" },
  { id: "arbitrary-color", scope: "all", test: /-\[(#|rgb|hsl|oklch|oklab|color-mix|var\(--kb-)/, msg: "Giá trị màu tùy ý trong class. Dùng utility token (bg-primary…)." },
  { id: "dark-variant", scope: "all", test: /(?<![\w-])dark:[\w[-]/, msg: "Không dùng `dark:`. Token tự đổi theo sáng/tối (light-dark())." },
  { id: "inline-color", scope: "all", test: /style=\{\{[^}]*\b(color|background|backgroundColor|borderColor|fill|stroke|boxShadow)\s*:/, msg: "Màu trong style inline. Dùng class token." },
  { id: "apps-arbitrary-value", scope: "apps", test: /(?<![\w-])(?:[\w-]+:)*[a-z][\w-]*-\[[^\]\s]+\]/, msg: "Giá trị tùy ý trong app. Dùng thang spacing/size chuẩn hoặc thêm vào @kb/ui." },
  { id: "apps-inline-style", scope: "apps", test: /style=\{\{/, msg: "Style inline trong app. Dùng class token / component @kb/ui." },
  { id: "apps-raw-control", scope: "apps", test: /<(button|input|select|textarea)\b/, msg: "Phần tử điều khiển thô. Dùng Button/Input/Select/Textarea/Checkbox từ @kb/ui." },
  { id: "apps-radix-direct", scope: "apps", test: /from\s+["']@radix-ui\//, msg: "Import Radix trực tiếp. Dùng component đã bọc trong @kb/ui." },
  { id: "apps-row-menu", scope: "apps", test: /\bMoreHorizontal\b/, msg: 'Menu "…" tự dựng. Thao tác trên dòng dùng RowActions của @kb/ui (icon hiện khi rê chuột + menu đủ thao tác).' },
  { id: "apps-dialog-toggle-off", scope: "apps", test: /allowPresentationToggle=\{false\}/, msg: "Tắt nút chuyển cửa sổ ↔ panel của popup. Mọi popup giữ nút này để người dùng tự chọn dạng hiển thị." },
  { id: "apps-raw-table", scope: "apps", test: /<table\b/, msg: "Bảng tự viết. Danh sách dùng DataTable; ma trận vai trò × quyền dùng PermissionMatrix (components/common)." },
  {
    id: "apps-hardcoded-text", scope: "apps", codeOnly: true,
    onlyPath: /^apps\/web\/src\/(features|components|app|lib)\//,
    skipPath: /^apps\/web\/src\/app\/api\/|^apps\/web\/src\/lib\/server\/|(^|[\/.])(messages|vi)\.tsx?$|\.test\.tsx?$/,
    test: new RegExp(`[${VI_CHARS}${VI_CHARS.toUpperCase()}]`),
    msg: "Chữ hiển thị viết cứng. Giao diện có 3 ngôn ngữ (vi/en/zh): đưa nhãn vào bộ nhãn defineMessages trong file *.messages.ts rồi dùng useMessages(...). Nội dung pháp lý chỉ có tiếng Việt (bản in tờ khai) để trong file *.vi.ts.",
  },
  {
    // Chữ không dấu (tiếng Anh, viết tắt…) viết cứng trong JSX hoặc prop hiển thị – rule trên chỉ bắt được chữ có dấu.
    id: "apps-hardcoded-latin-text", scope: "apps", codeOnly: true,
    onlyPath: /^apps\/web\/src\/(features|components|app)\/.*\.tsx$/,
    skipPath: /^apps\/web\/src\/app\/api\/|(^|[\/.])(messages|vi)\.tsx?$|\.test\.tsx?$/,
    test: /(?<![=-])>[^<>{}"'`=&|?():;]*[A-Za-z]{2}[^<>{}"'`=&|?():;]*<|\b(?:label|title|placeholder|description|aria-label|alt|emptyTitle|emptyDescription|hint|tooltip)="[^"]*[A-Za-z]{2}[^"]*"/,
    msg: "Chữ hiển thị viết cứng (kể cả tiếng Anh/viết tắt). Giao diện có 3 ngôn ngữ (vi/en/zh): đưa vào bộ nhãn *.messages.ts. Mã/ví dụ định dạng không cần dịch → comment `kb-allow-raw: <lý do>`. Xem .claude/rules/ho-tro-3-ngon-ngu.md",
  },
  { id: "apps-viewport-layout", scope: "apps", skipPath: /\/shell\//, test: /(?<![\w:-])(?:max-)?(?:sm|md|lg|xl|2xl):(?=[a-z-])/, msg: "Bố cục theo bề rộng MÀN HÌNH – panel neo bên phải/popup hẹp sẽ làm thẻ, form chật. Dùng Grid cols={{ base, md, xl }} hoặc mốc theo vùng nội dung cq-sm/cq-md/cq-lg/cq-xl/cq-max-sm. Chỉ khung ứng dụng (features/**/shell) được dùng sm:/md:/lg:." },
  { id: "apps-svg-selector", scope: "apps", test: /\[&>svg\]/, msg: "Tự chỉnh cỡ icon bằng [&>svg]. Icon trong nút dùng leftIcon/rightIcon của Button; ô icon dùng IconTile; nhãn có icon dùng Badge icon." },
  { id: "apps-icon-tile", scope: "apps", test: /className="[^"]*(?:justify-center[^"]*bg-(?:primary|success|warning|danger|info|neutral)-subtle|bg-(?:primary|success|warning|danger|info|neutral)-subtle[^"]*justify-center)/, msg: "Tự dựng ô icon nền dịu. Dùng IconTile của @kb/ui." },
  { id: "apps-big-skeleton", scope: "apps", test: /<Skeleton\b[^>]*className="[^"]*\bh-(?:6[4-9]|[7-9]\d|\d{3,})\b/, msg: "Khung tải nguyên khối. Dùng khung tải đúng dáng: PageLoading / SkeletonCard / SkeletonTable / SkeletonForm / SkeletonList / SkeletonStats." },
];

const ALLOW_COMMENT = /kb-allow-raw:\s*\S.{3,}/;

/** Bỏ phần chú thích của một dòng (gần đúng, đủ cho lint): dòng `*`, `/* … *\/`, `{/* … *\/}`, `// …`. */
export function stripComment(line) {
  if (/^\s*(\*|\/\*|\{\/\*)/.test(line)) return "";
  return line.replace(/\{?\/\*.*?\*\/\}?/g, "").replace(/(^|[\s;,)}\]])\/\/.*$/, "$1");
}

/**
 * Kiểm tra 1 file. `path` là đường dẫn tương đối repo, dùng dấu "/".
 * @returns {{path:string,line:number,rule:string,msg:string,text:string}[]}
 */
export function checkSource(path, text) {
  const inApps = path.startsWith("apps/");
  const rawColorAllowed = ALLOW_RAW_COLOR.some((re) => re.test(path));
  const lines = text.split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    if (ALLOW_COMMENT.test(line) || (i > 0 && ALLOW_COMMENT.test(lines[i - 1] ?? ""))) return;
    for (const r of RULES) {
      if (r.scope === "apps" && !inApps) continue;
      if (r.rawColor && rawColorAllowed) continue;
      if (r.skipPath?.test(path)) continue;
      if (r.onlyPath && !r.onlyPath.test(path)) continue;
      if (r.test.test(r.codeOnly ? stripComment(line) : line)) out.push({ path, line: i + 1, rule: r.id, msg: r.msg, text: line.trim().slice(0, 160) });
    }
  });
  return out;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (EXT.test(name)) yield p;
  }
}

export function checkRepo(root = ROOT) {
  const problems = [];
  for (const d of SCAN_DIRS) {
    let exists = true;
    try { statSync(join(root, d)); } catch { exists = false; }
    if (!exists) continue;
    for (const file of walk(join(root, d))) {
      const rel = relative(root, file).split(sep).join("/");
      problems.push(...checkSource(rel, readFileSync(file, "utf8")));
    }
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = checkRepo();
  if (!problems.length) {
    console.log("✓ design tokens: không có vi phạm");
  } else {
    for (const p of problems) console.error(`${p.path}:${p.line}  [${p.rule}] ${p.msg}\n    ${p.text}`);
    console.error(`\n✗ ${problems.length} vi phạm design system. Xem docs/DESIGN-SYSTEM.md`);
    process.exit(1);
  }
}
