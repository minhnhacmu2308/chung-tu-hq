// Tìm vị trí giá trị một trường trên lớp chữ của PDF gốc (PDF chuẩn xuất từ phần mềm) → vùng để tô khi rê chuột.
// So khớp bỏ dấu, bỏ hoa thường, bỏ ký tự ngăn cách: "17420.00" khớp "17,420.00" / "US$17,420"; ngày khớp các kiểu in phổ biến.
// Số ngắn (số lượng "1", "300") phải khớp trọn một cụm chữ/số, và nếu quá ngắn thì phải là chỗ duy nhất trên chứng từ – tránh tô nhầm.
import type { Region } from "@kb/contracts";

/** Một mẩu chữ trên trang, tọa độ % trang (gốc trên-trái). */
export type TextBox = { str: string; x: number; y: number; w: number; h: number };
export type PageText = { page: number; boxes: readonly TextBox[] };

type Ch = { c: string; box: number; off: number; start: boolean };
type Indexed = { page: number; boxes: readonly TextBox[]; text: string; chars: Ch[] };

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[\u0111\u0110]/g, "d").toUpperCase(); // \u0111/\u0110 = d gạch
const ALNUM = /[A-Z0-9]/;
const isDigit = (c: string) => c >= "0" && c <= "9";

/** Chuỗi chữ-số đã chuẩn hóa của cả trang + vị trí gốc từng ký tự; `start` = ký tự mở đầu một cụm (sau khoảng trắng/dấu, đổi chữ↔số, sang mẩu mới). */
function indexPage(p: PageText): Indexed {
  const chars: Ch[] = [];
  p.boxes.forEach((b, box) => {
    let gap = true;
    let sepInNumber = false;
    for (let off = 0; off < b.str.length; off++) {
      const raw = b.str[off]!;
      const f = fold(raw);
      let any = false;
      for (const c of f) {
        if (!ALNUM.test(c)) continue;
        any = true;
        const prev = chars[chars.length - 1];
        const newBox = prev === undefined || prev.box !== box;
        const kindChange = !newBox && isDigit(prev.c) !== isDigit(c);
        // "17,420.00": một dấu phân cách giữa hai chữ số không tách cụm số.
        const joinedNumber = !newBox && sepInNumber && isDigit(prev.c) && isDigit(c);
        chars.push({ c, box, off, start: newBox || kindChange || (gap && !joinedNumber) });
        gap = false;
        sepInNumber = false;
      }
      if (!any) {
        const prev = chars[chars.length - 1];
        sepInNumber = (raw === "." || raw === ",") && !gap && prev?.box === box && isDigit(prev.c);
        gap = true;
      }
    }
  });
  return { page: p.page, boxes: p.boxes, text: chars.map((x) => x.c).join(""), chars };
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTHS_LONG = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

type Needle = { s: string; strict: boolean };

/** Các cách một giá trị có thể được in trên chứng từ (đã chuẩn hóa chữ-số). `strict`: phải khớp trọn cụm. */
export function needlesFor(value: string): Needle[] {
  const v = value.trim();
  const base = fold(v).replace(/[^A-Z0-9]/g, "");
  if (!base) return [];
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (date) {
    const [, y, m, d] = date as unknown as [string, string, string, string];
    const mi = Number(m) - 1;
    const dd = String(Number(d));
    const yy = y.slice(2);
    const forms = [y + m + d, d + m + y, m + d + y, d + m + yy, m + d + yy];
    for (const mon of [MONTHS[mi], MONTHS_LONG[mi]]) if (mon) forms.push(d + mon + y, dd + mon + y, mon + d + y, mon + dd + y, d + mon + yy, dd + mon + yy);
    return [...new Set(forms)].map((s) => ({ s, strict: true }));
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    const forms = [base, String(n).replace(/[^0-9]/g, ""), n.toFixed(2).replace(/[^0-9]/g, "")];
    return [...new Set(forms)].filter(Boolean).map((s) => ({ s, strict: true }));
  }
  // Chữ dài: cho phép khớp giữa cụm (vd tên công ty dính chữ khác); chữ ngắn phải khớp trọn cụm.
  return [{ s: base, strict: base.length < 6 }];
}

function matches(idx: Indexed, n: Needle): number[] {
  const out: number[] = [];
  for (let i = idx.text.indexOf(n.s); i >= 0; i = idx.text.indexOf(n.s, i + 1)) {
    const end = i + n.s.length;
    const okStart = idx.chars[i]!.start;
    const okEnd = end >= idx.chars.length || idx.chars[end]!.start;
    if (!n.strict || (okStart && okEnd)) out.push(i);
  }
  return out;
}

/** Khung bao các ký tự [from, to) – cắt theo tỉ lệ ký tự trong mẩu đầu/cuối (mẩu chữ thường dài hơn giá trị). */
function boundsOf(idx: Indexed, from: number, to: number): Region {
  const first = idx.chars[from]!;
  const last = idx.chars[to - 1]!;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let b = first.box; b <= last.box; b++) {
    const box = idx.boxes[b]!;
    const len = Math.max(1, box.str.length);
    const left = b === first.box ? box.x + (box.w * first.off) / len : box.x;
    const right = b === last.box ? box.x + (box.w * (last.off + 1)) / len : box.x + box.w;
    x0 = Math.min(x0, left);
    x1 = Math.max(x1, right);
    y0 = Math.min(y0, box.y);
    y1 = Math.max(y1, box.y + box.h);
  }
  const pad = 0.4;
  const cx0 = Math.max(0, x0 - pad), cy0 = Math.max(0, y0 - pad);
  return { page: idx.page, x: cx0, y: cy0, w: Math.min(100, x1 + pad) - cx0, h: Math.min(100, y1 + pad) - cy0 };
}

/** Bộ tìm cho một chứng từ: lập chỉ mục các trang một lần, gọi `locate(value)` cho từng trường. */
export function createLocator(pages: readonly PageText[]) {
  const indexed = pages.map(indexPage);
  return function locate(value: string): Region | null {
    for (const n of needlesFor(value)) {
      if (n.s.length < 2 && !/^\d$/.test(n.s)) continue;
      const hits = indexed.flatMap((idx) => matches(idx, n).map((i) => ({ idx, i })));
      // Số/chữ rất ngắn xuất hiện nhiều chỗ → không đoán.
      if (!hits.length || (n.s.length < 3 && hits.length > 1)) continue;
      const { idx, i } = hits[0]!;
      return boundsOf(idx, i, i + n.s.length);
    }
    // Chữ rất dài (địa chỉ, mô tả hàng) có thể xuống dòng lệch thứ tự → tô theo đoạn đầu.
    const base = needlesFor(value)[0];
    if (base && !base.strict && base.s.length > 24) return locate(value.slice(0, Math.ceil(value.length / 2)));
    return null;
  };
}

type Rect = { x: number; y: number; w: number; h: number };

/** Phần chữ của một mẩu nằm trong khoảng ngang [x0, x1] (cắt theo tỉ lệ ký tự – mẩu chữ thường dài hơn vùng chọn). */
function sliceBox(b: TextBox, x0: number, x1: number): string {
  const len = b.str.length;
  if (!len || b.w <= 0) return b.str;
  const from = Math.max(0, Math.floor(((x0 - b.x) / b.w) * len));
  const to = Math.min(len, Math.ceil(((x1 - b.x) / b.w) * len));
  return b.str.slice(from, Math.max(from, to));
}

const vOverlap = (b: TextBox, r: Rect) => Math.max(0, Math.min(b.y + b.h, r.y + r.h) - Math.max(b.y, r.y)) / Math.max(b.h, 0.01);

/** Chữ trong vùng người dùng kéo chọn trên trang (theo dòng, trái → phải). Vùng rất nhỏ (bấm chuột) = lấy trọn mẩu chữ dưới con trỏ. */
export function textIn(page: PageText, r: Rect): string {
  const click = r.w < 0.8 && r.h < 0.8;
  const hit = page.boxes.filter((b) => (click ? r.x >= b.x && r.x <= b.x + b.w && r.y >= b.y && r.y <= b.y + b.h : vOverlap(b, r) >= 0.5 && b.x < r.x + r.w && b.x + b.w > r.x));
  const parts = hit.map((b) => ({ b, s: click ? b.str : sliceBox(b, r.x, r.x + r.w) })).filter((p) => p.s.trim());
  // Cùng dòng khi lệch dưới nửa chiều cao chữ.
  parts.sort((a, c) => (Math.abs(a.b.y - c.b.y) < Math.min(a.b.h, c.b.h) / 2 ? a.b.x - c.b.x : a.b.y - c.b.y));
  return parts.map((p) => p.s.trim()).join(" ").replace(/\s+/g, " ").trim();
}

const hasLetters = (s: string) => (s.match(/\p{L}/gu) ?? []).length >= 2;
const cleanLabel = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length >= 2 && t.length <= 60 && hasLetters(t) ? t : null;
};

/**
 * Nhãn in cạnh giá trị trên chứng từ (vd "Invoice No.:" bên trái hoặc ngay phía trên ô giá trị) → để gợi ý alias cho skill.
 * Thứ tự: chữ đứng trước giá trị trong cùng mẩu chữ → mẩu gần nhất bên trái cùng dòng → mẩu ngay phía trên. Không thấy → null.
 */
export function labelNear(page: PageText, r: Rect, value: string): string | null {
  const v = fold(value).replace(/[^A-Z0-9]/g, "");
  const notValue = (s: string) => fold(s).replace(/[^A-Z0-9]/g, "") !== v;
  const sameLine = page.boxes.filter((b) => vOverlap(b, r) >= 0.5);
  // 1) "Invoice No.: ABC123" trong một mẩu.
  for (const b of sameLine) {
    if (b.x < r.x - 0.3 && b.x + b.w > r.x) {
      // Cắt theo vị trí giá trị trong chuỗi (người dùng kéo lệch vài ký tự vẫn đúng); không thấy thì theo tọa độ.
      const at = b.str.toUpperCase().indexOf(value.trim().toUpperCase());
      const before = cleanLabel(at > 0 ? b.str.slice(0, at) : sliceBox(b, b.x, r.x));
      if (before && notValue(before)) return before;
    }
  }
  // 2) Mẩu gần nhất bên trái cùng dòng (cách không quá 1/4 trang).
  const left = sameLine.filter((b) => b.x + b.w <= r.x + 0.3 && r.x - (b.x + b.w) < 25).sort((a, b) => b.x + b.w - (a.x + a.w));
  for (const b of left) {
    const l = cleanLabel(b.str);
    if (l && notValue(l)) return l;
    if (l === null && hasLetters(b.str)) break;
  }
  // 3) Ngay phía trên (ô có tiêu đề), chồng lên theo chiều ngang.
  const above = page.boxes
    .filter((b) => b.y + b.h <= r.y + 0.3 && r.y - (b.y + b.h) < 4 && b.x < r.x + r.w && b.x + b.w > r.x - 2)
    .sort((a, b) => b.y + b.h - (a.y + a.h) || a.x - b.x);
  for (const b of above) {
    const l = cleanLabel(b.str);
    if (l && notValue(l)) return l;
  }
  return null;
}
