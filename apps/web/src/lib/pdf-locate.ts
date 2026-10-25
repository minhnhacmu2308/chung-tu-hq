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
