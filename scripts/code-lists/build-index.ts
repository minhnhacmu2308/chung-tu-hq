// Sinh bảng "Danh mục mã VNACCS" trong docs/NGUON-DU-LIEU.md từ manifest.json + bố cục / catalog chỉ tiêu tờ khai (@kb/contracts).
//   pnpm code-lists:index
// Chạy lại sau build.mjs hoặc khi đổi codeTable của chỉ tiêu. Chỉ thay phần giữa hai dấu BEGIN/END, phần viết tay giữ nguyên.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CODE_LIST_IDS, CODE_LIST_META, codeListFor, type CodeListId } from "../../packages/contracts/src/code-lists/index.js";
import { CATALOG_EDA } from "../../packages/contracts/src/declaration/catalog-eda.js";
import { CATALOG_IDA } from "../../packages/contracts/src/declaration/catalog-ida.js";
import { LAYOUT_EDA, LAYOUT_IDA, type DeclarationLayout, type LayoutBlock } from "../../packages/contracts/src/declaration-layout/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DOC = join(ROOT, "docs/NGUON-DU-LIEU.md");
const BEGIN = "<!-- BEGIN danh-muc (sinh bởi scripts/code-lists/build-index.ts – không sửa tay) -->";
const END = "<!-- END danh-muc -->";
const manifest = JSON.parse(readFileSync(join(ROOT, "packages/contracts/src/code-lists/manifest.json"), "utf8")) as { skipped: { source: string; reason: string }[] };

// Danh mục → chỉ tiêu dùng nó ("IDA 1.86"). Ô trong nhóm không có số riêng thì lấy số của nhóm; ô Hải quan trả về không có số → khóa ô.
const used = new Map<CodeListId, Set<string>>();
const add = (form: string, no: string | undefined, table: Parameters<typeof codeListFor>[0], key?: string) => {
  const id = codeListFor(table);
  if (!id) return;
  if (!no) { if (!key) return; no = `ô ${key.replace(/{n+}/g, "")}`; }
  if (!used.has(id)) used.set(id, new Set());
  used.get(id)!.add(`${form} ${no}`);
};
const walk = (form: string, blocks: LayoutBlock[]) => {
  for (const it of blocks.flatMap((b) => b.items)) {
    if (it.kind === "field") add(form, it.no, it.codeTable, it.key);
    else for (const f of it.fields) add(form, f.no ?? it.no, f.codeTable, f.key);
  }
};
for (const l of [LAYOUT_IDA, LAYOUT_EDA] as DeclarationLayout[]) {
  for (const f of l.summary) add(l.kind, f.no, f.codeTable, f.key);
  walk(l.kind, [...l.declarant, ...l.customs].flatMap((s) => s.blocks).concat(l.item.declarant, l.item.customs));
}
for (const [form, catalog] of [["IDA", CATALOG_IDA], ["EDA", CATALOG_EDA]] as const) for (const f of catalog) add(form, f.code, f.codeTable);

const cell = (s: string) => s.replaceAll("|", "\|");
const rows = CODE_LIST_IDS.map((id) => {
  const l = CODE_LIST_META[id];
  const fields = [...(used.get(id) ?? [])].sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
  const notes = [l.superseded?.length ? `thay ${l.superseded.join(", ")}` : "", l.usesOldOfficeCodes ? "còn mã chi cục cũ" : "", l.inactive ? `${l.inactive} mã ngưng dùng` : ""].filter(Boolean);
  return `| \`${id}\` | ${cell(l.title)} | ${cell(l.sources.join(", "))} | ${l.count} | ${fields.length ? fields.join(", ") : "–"} | ${cell(notes.join("; "))} |`;
});

const block = [
  BEGIN,
  "",
  `${rows.length} danh mục, dữ liệu ở \`packages/contracts/src/code-lists/data/<ID>.json\` (mỗi mục \`{ code, name, parent?, note?, inactive? }\`). "–" = chưa gắn chỉ tiêu tờ khai (giữ để tra cứu).`,
  "",
  "| ID | Danh mục | File nguồn | Số mã | Chỉ tiêu tờ khai dùng | Ghi chú |",
  "|---|---|---|---:|---|---|",
  ...rows,
  "",
  "File nguồn không dựng thành danh mục:",
  "",
  ...manifest.skipped.map((s) => `- \`${s.source}\`: ${s.reason}`),
  "",
  END,
].join("\n");

const doc = readFileSync(DOC, "utf8");
const start = doc.indexOf("<!-- BEGIN danh-muc"), stop = doc.indexOf(END);
if (start < 0 || stop < 0) throw new Error("docs/NGUON-DU-LIEU.md thiếu dấu BEGIN/END");
writeFileSync(DOC, doc.slice(0, start) + block + doc.slice(stop + END.length));
console.log(`✓ docs/NGUON-DU-LIEU.md: ${rows.length} danh mục`);
