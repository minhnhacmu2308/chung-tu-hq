// Bước 2 dựng danh mục VNACCS: đọc CSV (export-csv.ps1) → JSON chuẩn hóa trong packages/contracts/src/code-lists/data/ + manifest.json.
//   node scripts/code-lists/build.mjs --csv %TEMP%/kb-danhmuc-csv
// Mỗi mục: { code, name, parent?, note?, inactive? }. Không sửa tay file sinh ra – sửa nguồn Excel hoặc quy tắc ở đây rồi chạy lại.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "packages/contracts/src/code-lists/data");
const csvDir = process.argv[process.argv.indexOf("--csv") + 1];
if (!csvDir || process.argv.indexOf("--csv") < 0) throw new Error("Thiếu --csv <thư mục CSV từ export-csv.ps1>");

/* ---------- CSV ---------- */
function parseCsv(text) {
  const rows = [];
  let row = [], f = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.map((r) => r.map((x) => x.replace(/\s+/g, " ").trim()));
}
const files = readdirSync(csvDir);
const used = new Set();
/** Đọc sheet theo tiền tố tên file (vd "13.DM_DDLK_CTQ__1"). */
function sheet(prefix) {
  const name = files.find((f) => f.startsWith(prefix));
  if (!name) throw new Error(`Không thấy CSV bắt đầu bằng "${prefix}"`);
  used.add(name);
  return parseCsv(readFileSync(join(csvDir, name), "utf8"));
}
const sourceOf = (prefix) => files.find((f) => f.startsWith(prefix))?.replace(/__(\d+_.*|docx\.xml)$/, "");
/** Bảng trong văn bản .docx (export-csv.ps1 chép word/document.xml): [{ heading, rows }] – heading là chữ ngay trước bảng, ô gồm các đoạn nối bằng dấu cách. */
function docxTables(prefix) {
  const name = files.find((f) => f.startsWith(prefix) && f.endsWith("__docx.xml"));
  if (!name) throw new Error(`Không thấy văn bản .docx bắt đầu bằng "${prefix}"`);
  used.add(name);
  const xml = readFileSync(join(csvDir, name), "utf8");
  const text = (s) => s.replace(/<w:tab\/>/g, " ").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const cell = (s) => text(s).split("\n").map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
  return [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((t) => ({
    heading: text(xml.slice(Math.max(0, t.index - 2000), t.index)).replace(/\s+/g, " ").trim(),
    rows: [...t[0].matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((r) => [...r[0].matchAll(/<w:tc[ >][\s\S]*?<\/w:tc>/g)].map((c) => cell(c[0]))),
  }));
}

/* ---------- Chuẩn hóa ---------- */
const clip = (s, n = 120) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
function entry(code, name, extra = {}) {
  code = String(code ?? "").trim();
  name = clip(String(name ?? "").trim(), 200);
  if (!code || !name) return null;
  const e = { code, name };
  if (extra.parent) e.parent = String(extra.parent).trim();
  // Ghi chú giữ nguyên văn (đọc hết khi mở rộng danh sách); chỉ danh mục lớn rút gọn lúc ghi ra (LARGE_LIST).
  if (extra.note && extra.note.trim() && extra.note.trim() !== name) e.note = extra.note.trim();
  if (extra.inactive) e.inactive = true;
  return e;
}
/** Bỏ trùng theo (mã cha, mã) – giữ mục đầu tiên (nguồn ưu tiên đứng trước). */
function dedupe(list) {
  const seen = new Set();
  return list.filter((e) => {
    if (!e) return false;
    const k = `${e.parent ?? ""}\u0000${e.code}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
/** Danh mục ghi dạng dòng chữ: “A”: …, Mã “1”: …, (1) CIF : …, KGM: … – dòng không có mã nối vào ghi chú mục trước. */
function textList(rows) {
  const out = [];
  for (const [line] of rows.slice(1)) {
    if (!line) continue;
    const m = /^(?:Mã\s*)?(?:\(\d+\)\s*)?[“"]?([A-Z0-9]{1,10})[”"]?\s*[:：]\s*(.+)$/.exec(line);
    if (m) out.push({ code: m[1], name: m[2] });
    else if (out.length) out[out.length - 1].name += ` ${line}`;
  }
  return out.map((e) => {
    // Tên ngắn: phần trước chú thích "(…)", "Lưu ý", " - " hoặc hết câu đầu; đầy đủ để ở ghi chú.
    const short = e.name.split(/\s*\(|\s+Lưu ý|\s-\s|(?<=\.)\s/)[0].replace(/[.:\s]+$/, "");
    return entry(e.code, short.charAt(0).toUpperCase() + short.slice(1), { note: e.name });
  });
}
/** Tên tiếng Việt của nước trong bảng mã đang dùng (code-tables.ts) – danh mục VNACCS chỉ có tên viết tắt (U KING, SNGAPOR…). */
function curatedCountryNames() {
  const src = readFileSync(join(ROOT, "packages/contracts/src/declaration/code-tables.ts"), "utf8");
  const block = src.slice(src.indexOf("export const COUNTRIES"), src.indexOf("];", src.indexOf("export const COUNTRIES")));
  return new Map([...block.matchAll(/code: "([A-Z]{2})", label: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
}

/** Bảng mã gọn trong code-tables.ts (danh mục không có trong 02_DANHMUC_VNACCS) → mục danh mục. */
function curatedEntries(name) {
  const src = readFileSync(join(ROOT, "packages/contracts/src/declaration/code-tables.ts"), "utf8");
  const start = src.indexOf(`export const ${name}:`);
  if (start < 0) throw new Error(`Không thấy bảng ${name} trong code-tables.ts`);
  const block = src.slice(start, src.indexOf("];", start));
  return [...block.matchAll(/code: "([^"]+)", label: "([^"]+)"/g)].map((m) => entry(m[1], m[2]));
}

/* ---------- Từng danh mục ---------- */
const LISTS = [];
const add = (id, title, sources, entries, extra = {}) => LISTS.push({ id, title, sources, entries: dedupe(entries), ...extra });

/** Mã cơ quan Hải quan cũ (bảng 17/03/2025) → mã mới (bảng 01/06/2026), ghép theo tên đơn vị trùng khớp. */
const OLD_TO_NEW = new Map();
{ // A038 – Cơ quan Hải quan (bản 01/06/2026 thay cho bảng 17/03/2025). Dòng tiếp theo để trống mã → thuộc đơn vị dòng trên.
  const p = "Ma_DVHQ_01.06.2026"; let region = "", unit = "";
  const rows = sheet(p).slice(1);
  const offices = rows.map((r) => { if (r[1]) region = r[1]; return entry(r[4], r[7], { note: [region, r[9]].filter(Boolean).join(" · ") }); });
  add("A038", "Cơ quan Hải quan", [sourceOf(p)], offices, { superseded: [sourceOf("1.Bang ma don vi HQ")] });
  // A014 – Bộ phận xử lý tờ khai theo mã mới: cột "Mã bộ phận xử lý tờ khai" + "Ghi chú" của cùng file (bảng 2.DM_Bo_Phan… còn mã chi cục cũ).
  const units = rows.map((r) => { if (r[4]) unit = r[4]; return r[10] ? entry(r[10].padStart(2, "0"), r[11] || `Bộ phận ${r[10]}`, { parent: unit }) : null; });
  add("A014", "Bộ phận xử lý tờ khai", [sourceOf(p)], units, { parentLabel: "Cơ quan Hải quan", superseded: [sourceOf("2.DM_Bo_Phan_Xuly_ToKhai")] });
  const newByName = new Map();
  for (const r of rows) if (r[4] && r[7] && !newByName.has(r[7])) newByName.set(r[7], r[4]);
  for (const r of sheet("1.Bang ma don vi HQ").slice(1)) {
    const nw = newByName.get(r[6]);
    if (r[4] && nw && r[4] !== nw) OLD_TO_NEW.set(r[4], nw);
  }
}
{ // A202 – Địa điểm lưu kho hàng chờ thông quan / trung chuyển / đích bảo thuế, theo chi cục
  const p = "13.DM_DDLK_CTQ";
  // Danh mục 04/2025 còn dùng mã chi cục cũ (02B1…) – giữ nguyên mã; ánh xạ cũ → mới ở manifest để lọc theo cơ quan Hải quan mới.
  const rows = sheet(p).slice(1).filter((r) => !/^deleted/i.test(r[0])).map((r) => entry(r[1], r[2], { parent: r[3], note: [r[6], r[7]].filter(Boolean).join(" – ") }));
  add("A202", "Địa điểm lưu kho", [sourceOf(p)], rows, { parentLabel: "Cơ quan Hải quan", usesOldOfficeCodes: true });
}
{ // A016 – Địa điểm xếp / dỡ hàng: cảng & ICD trong nước, kho hàng không/đường bộ trong nước, cảng nước ngoài (mã cha = mã nước)
  const ports = sheet("11a.DM_DDXEPDOHANG").slice(2).map((r) => entry(r[1], r[3] || r[2], { parent: "VN", note: r[2] }));
  const depots = sheet("11.DM.DD_XEPDOHANG").slice(1).flatMap((r) => {
    const inactive = /dừng hoạt động/i.test(r.join(" "));
    const note = [r[1], r[5]].filter(Boolean).join(" – ");
    return [r[2] && entry(r[2], r[4] || r[1], { parent: "VN", note, inactive }), r[3] && entry(r[3], `${r[4] || r[1]} (đường bộ/sắt)`, { parent: "VN", note, inactive })];
  });
  const foreign = sheet("12.DM.DD_XEPDOHANG_NUOCNGOAI").slice(1).map((r) => entry(r[0], r[1], { parent: r[2], note: r[3] }));
  // Bỏ trùng theo mã (không theo mã cha) – cảng trong nước đứng trước.
  const seen = new Set();
  add("A016", "Địa điểm xếp / dỡ hàng", [sourceOf("11a.DM"), sourceOf("11.DM"), sourceOf("12.DM")], [...ports, ...depots, ...foreign].filter((e) => e && !seen.has(e.code) && seen.add(e.code)), { parentLabel: "Mã nước" });
}
{ // COUNTRY – mã nước: tên tiếng Việt theo bảng đang dùng, kèm tên viết tắt trên hệ thống VNACCS
  const vi = curatedCountryNames();
  add("COUNTRY", "Mã nước", [sourceOf("10.QUOCGIA")], sheet("10.QUOCGIA").slice(1).map((r) => entry(r[0], vi.get(r[0]) ?? r[1], { note: vi.has(r[0]) ? r[1] : "", inactive: r[2] === "0" })));
}
add("PACKAGE_KIND", "Loại kiện", [sourceOf("14.DM_MA_LOAIKIEN")], sheet("14.DM_MA_LOAIKIEN").slice(1).map((r) => entry(r[0], r[2] || r[1], { note: r[1], inactive: r[3] === "0" })));
add("UNIT", "Đơn vị tính", [sourceOf("15.DM_DVT")], sheet("15.DM_DVT").slice(1).map((r) => entry(r[0], r[1])));
add("CURRENCY", "Mã tiền tệ", [sourceOf("16.DM_TIENTE")], sheet("16.DM_TIENTE").slice(1).map((r) => entry(r[0], r[1], { inactive: r[2] === "False" })));
{ // TYPE_CODE – mã loại hình (mã cha NK / XK). Văn bản QĐ 1357/QĐ-TCHQ là nguồn chính: tên, hướng dẫn, khai kết hợp, ghi chú.
  // Bảng Excel tổng hợp chỉ bổ sung ghi chú chưa có trong văn bản (mã mới theo QĐ 1357, CV 4032/TCHQ-GSQL…).
  const extra = new Map();
  for (const r of sheet("Bang ma loai hinh XNK")) if (/^[A-Z]\d{2}$/.test(r[1]) && r[5]) extra.set(r[1], r[5]);
  const rows = docxTables("1357_QD-TCHQ").flatMap(({ heading, rows }) => {
    const dir = /NHẬP KHẨU$/.test(heading) ? "NK" : "XK";
    // Cột: TT | Mã LH | Khai kết hợp | Tên | Hướng dẫn sử dụng | Ghi chú
    return rows.filter((r) => /^[A-Z]\d{2}$/.test(r[1] ?? "")).map(([, code, combined, name, guide, remark]) => {
      const more = extra.get(code);
      const note = [guide, remark && `Ghi chú: ${remark}`, more && !remark?.includes(more) && `Ghi chú: ${more}`, combined === "X" && "Khai kết hợp: có (QĐ 1357)"]
        .filter(Boolean).map((s) => (/[.;:]$/.test(s) ? s : `${s}.`)).join(" ");
      return entry(code, name, { parent: dir, note });
    });
  });
  add("TYPE_CODE", "Mã loại hình", [sourceOf("1357_QD-TCHQ"), sourceOf("Bang ma loai hinh XNK")], rows, { parentLabel: "Nhập / xuất", superseded: [sourceOf("8.LOAIHINH_NHAPKHAU"), sourceOf("9.LOAIHINH_XUATKHAU")] });
}
add("A520", "Mã miễn / giảm / không chịu thuế", [sourceOf("23.DM_MAMIENGIAM")], sheet("23.DM_MAMIENGIAM").slice(1).map((r) => entry(r[0], r[1], { inactive: r[2] === "0" })));
add("OTHER_TAX", "Mã áp dụng thuế suất / mức thuế và thu khác", [sourceOf("24.DM_MA_MGTHUETHUKHAC")], sheet("24.DM_MA_MGTHUETHUKHAC").slice(1).map((r) => entry(r[0], r[1], { inactive: r[2] === "False" })));
add("BANK", "Ngân hàng", [sourceOf("25.DM_NGANHANG")], sheet("25.DM_NGANHANG").slice(1).map((r) => entry(r[0], r[1], { inactive: r[2] === "False" })));
add("TAX_TABLE", "Mã biểu thuế nhập khẩu", [sourceOf("26.DM_BIEUTHUE")], sheet("26.DM_BIEUTHUE").filter((r) => /^B\d+$/.test(r[1])).map((r) => entry(r[1], r[2], { note: r[3] })));
add("ABS_TAX", "Mã áp dụng mức thuế tuyệt đối", [sourceOf("22.DM_THUESUATTUYETDOI")], sheet("22.DM_THUESUATTUYETDOI_GANCODE__2").filter((r) => /^\d+$/.test(r[0])).map((r) => entry(r[0], r[1], { note: r[2] ? `${r[2]} ${r[4]}/${r[3]}` : "" })));
// A546 = phân loại THỦ TỤC của bản khai HYS (TK_TSB); ô 1 của 1.63/2.53 (TK_EA) dùng ATTACH_KIND bên dưới.
add("A546", "Phân loại thủ tục khai HYS (TK_TSB)", [sourceOf("20.DM_KHAI_HYS")], sheet("20.DM_KHAI_HYS").filter((r) => /^A\d{2}$/.test(r[0])).map((r) => entry(r[0], r[1])));
// ATTACH_KIND – phân loại đính kèm 1.63/2.53 ô 1 (TK_EA): không có trong 02_DANHMUC_VNACCS – chép bảng ATTACH_KINDS (code-tables.ts),
// nguồn VNACCS_IDA v1.2.xlsx cột Category của TK_EA + phần mềm FPT.VNACCS (mã DM).
add("ATTACH_KIND", "Phân loại đính kèm khai báo điện tử (1.63 / 2.53)", ["VNACCS_IDA v1.2 (cột Category TK_EA)", "Phần mềm FPT.VNACCS (DM)"], curatedEntries("ATTACH_KINDS"));
{ // A519 / A528 – mã văn bản pháp quy và mã phân loại giấy phép (bản cập nhật 08/05/2026 thay cho bản 19/01/2024)
  const p = "3. C"; const rows = sheet(p);
  const laws = rows.filter((r) => /^[A-Z0-9]{2}$/.test(r[5])).map((r) => entry(r[5], [r[1], r[3]].filter(Boolean).join(" – "), { note: r[6] }));
  const permits = rows.flatMap((r) => (r[7] || "").split(/[\s,;]+/).filter((c) => /^[A-Z0-9]{3,4}$/.test(c)).map((c) => entry(c, r[6] || r[1], { parent: r[5], note: r[1] })));
  add("A519", "Mã văn bản pháp quy", [sourceOf(p)], laws, { superseded: [sourceOf("6.DM_VANBANPHAPQUY")] });
  add("A528", "Mã phân loại giấy phép", [sourceOf(p)], permits.map((e) => e && (({ parent, ...rest }) => ({ ...rest, ...(parent ? { note: `Văn bản ${parent}${rest.note ? ` · ${rest.note}` : ""}` } : {}) }))(e)), { superseded: [sourceOf("6.DM_VANBANPHAPQUY")] });
}
// Danh mục ghi dạng dòng chữ trong 29.DM_GANCODE (Phụ lục II).
for (const [id, title, n] of [
  ["CARGO_CLASS", "Mã phân loại hàng hóa", 1], ["TRANSPORT_MODE", "Mã phương thức vận chuyển", 2], ["PARTY_CLASS", "Phân loại cá nhân / tổ chức", 3],
  ["INVOICE_KIND", "Phân loại hình thức hóa đơn", 6], ["PRICE_KIND", "Mã phân loại giá hóa đơn", 7], ["PAYMENT", "Phương thức thanh toán", 8], ["INCOTERM", "Điều kiện giao hàng", 9],
  ["VALUATION_METHOD", "Mã phân loại khai trị giá", 10], ["FREIGHT_CLASS", "Phân loại phí vận chuyển", 11], ["INSURANCE_CLASS", "Phân loại phí bảo hiểm", 12],
  ["ADJUSTMENT_CODE", "Mã tên khoản điều chỉnh", 13], ["TAX_PAYER", "Người nộp thuế", 14], ["DUE_DATE", "Mã xác định thời hạn nộp thuế", 15],
  ["GROSS_UNIT", "Đơn vị tính trọng lượng (Gross)", 4], ["INSPECTION_RESULT", "Mã kết quả kiểm tra nội dung", 5], ["BP_REASON", "Mã lý do đề nghị giải phóng hàng (bảo lãnh)", 16],
]) add(id, title, [sourceOf("29.DM_GANCODE")], textList(sheet(`29.DM_GANCODE__${n}_`)));
// Hải quan trả về (HQTV) trên dòng hàng: mã loại thuế suất thuế nhập khẩu (ô "Thuế suất") và mã sắc thuế.
add("IMPORT_TAX_RATE_KIND", "Mã thuế suất thuế nhập khẩu", [sourceOf("27.Mathuesuat")], sheet("27.Mathuesuat").filter((r) => /^[A-Z]$/.test(r[1])).map((r) => entry(r[1], r[2])));
add("TAX_KIND", "Mã sắc thuế", [sourceOf("28.Sacthue")], sheet("28.Sacthue").slice(5).map((r) => /^[A-Z]$/.test(r[0]) && entry(r[0], r[1].replace(/^-\s*/, ""))));
// Danh mục không thuộc tờ khai – giữ sẵn để tra cứu sau. Hãng hàng không / tàu biển / tàu hỏa dùng cho manifest.
add("AIRLINE", "Hãng hàng không", [sourceOf("17.DM_HANG_HANGKHONG")], sheet("17.DM_HANG_HANGKHONG").slice(1).map((r) => entry(r[0], r[1])), { unassigned: true });
add("SHIPPING_LINE", "Hãng tàu biển", [sourceOf("18.DM_HANG_TAUBIEN")], sheet("18.DM_HANG_TAUBIEN").slice(1).map((r) => entry(r[0], r[1])), { unassigned: true });
add("RAIL_CARRIER", "Hãng tàu hỏa", [sourceOf("19.DM_HANGTAUHOA")], sheet("19.DM_HANGTAUHOA").slice(1).map((r) => entry(r[0], r[1])), { unassigned: true });
add("VEHICLE_KIND", "Phương tiện vận chuyển (ít dùng)", [sourceOf("5.DM_PTVC")], sheet("5.DM_PTVC").slice(1).map((r) => entry(r[0], r[1], { inactive: r[2] === "False" })), { unassigned: true });
add("LICENSING_BODY", "Đơn vị cấp phép (Một cửa)", [sourceOf("7.DONVICAPPHEP")], sheet("7.DONVICAPPHEP").slice(1).map((r) => entry(r[0], r[1], { inactive: r[2] === "0" })), { unassigned: true });
add("CANCEL_REASON", "Lý do hủy tờ khai", [sourceOf("21.DM_LYDOHUYTK")], sheet("21.DM_LYDOHUYTK").slice(1).map(([l]) => { const m = /^(H\d+)\s*:\s*(.+)$/.exec(l ?? ""); return m && entry(m[1], m[2]); }), { unassigned: true });

/* ---------- Ghi ra ---------- */
const skipped = [
  { source: sourceOf("3.DM_DL_HAIQUAN"), reason: "Danh sách đại lý của riêng doanh nghiệp (1 dòng mẫu) – dữ liệu khách hàng, không phải danh mục VNACCS" },
  { source: sourceOf("4.DM.UYTHAC"), reason: "Danh sách người ủy thác của riêng doanh nghiệp (1 dòng mẫu)" },
  { source: sourceOf("22.DM_THUESUATTUYETDOI_GANCODE__1"), reason: "Sheet A402A là mô tả cấu trúc bảng, không phải dữ liệu" },
];
mkdirSync(OUT, { recursive: true });
/** Danh mục trên 2.000 mã (địa điểm lưu kho, cảng, hãng tàu): ghi chú là địa chỉ / tên đầy đủ – rút còn 120 ký tự để giữ dung lượng tải. */
const LARGE_LIST = 2000;
for (const l of LISTS) {
  if (l.entries.length > LARGE_LIST) l.entries = l.entries.map((e) => (e.note ? { ...e, note: clip(e.note) } : e));
  writeFileSync(join(OUT, `${l.id}.json`), `${JSON.stringify(l.entries)}\n`);
}
const manifest = {
  note: "Sinh bởi scripts/code-lists/build.mjs từ thư mục 02_DANHMUC_VNACCS – không sửa tay.",
  oldToNewOfficeCodes: Object.fromEntries([...OLD_TO_NEW].sort()),
  lists: LISTS.map(({ entries, ...l }) => ({ ...l, count: entries.length, inactive: entries.filter((e) => e.inactive).length, hasParent: entries.some((e) => e.parent) })),
  skipped,
};
writeFileSync(join(OUT, "../manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
const unused = files.filter((f) => !used.has(f));
for (const l of manifest.lists) console.log(`${l.id.padEnd(22)} ${String(l.count).padStart(6)}${l.inactive ? `  (ngưng ${l.inactive})` : ""}  ← ${l.sources.join(", ")}`);
console.log(`\nCSV không dùng (${unused.length}): ${unused.join(", ")}`);
