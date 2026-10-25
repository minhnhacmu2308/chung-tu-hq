// Hồ sơ mẫu lô lớn dos_028 (120 dòng hàng NK → 3 tờ khai nhánh: 50 + 50 + 20): thử tách tờ khai, truyền nối tiếp, thông quan từng tờ, AMA từng tờ.
// Tiền tính bằng số nguyên đơn vị nhỏ (xu) rồi mới đổi lại chuỗi thập phân – không cộng số thực.
import { fromMinor, toMinor } from "@/lib/decimal";

export const LARGE_LOT_ID = "dos_028";
export const LARGE_LOT_LINES = 120;

type Family = { desc: string; unit: string; price: string; hs: string; conf: number; sizes: string[] };

const FAMILIES: Family[] = [
  { desc: "Vòng bi cầu", unit: "PCE", price: "1.85", hs: "8482.10.00", conf: 0.94, sizes: ["6000ZZ", "6001ZZ", "6203-2RS", "6205-2RS", "6208-2RS", "6308ZZ"] },
  { desc: "Ổ bi đũa côn", unit: "PCE", price: "6.75", hs: "8482.20.00", conf: 0.88, sizes: ["30205", "30207", "30210", "32008"] },
  { desc: "Gối đỡ vòng bi (có lắp ổ bi)", unit: "SET", price: "7.39", hs: "8483.20.90", conf: 0.82, sizes: ["UCP205", "UCP208", "UCF205", "UCFL207"] },
  { desc: "Thanh trượt dẫn hướng", unit: "PCE", price: "32.50", hs: "8466.93.90", conf: 0.64, sizes: ["HGR20 dài 1.000 mm", "HGR25 dài 1.000 mm", "MGN12H dài 500 mm"] },
  { desc: "Động cơ điện xoay chiều 3 pha", unit: "PCE", price: "14.80", hs: "8501.51.19", conf: 0.9, sizes: ["0,55 kW YS7124", "0,75 kW YS8024", "1,1 kW YS8026"] },
  { desc: "Bộ điều khiển tốc độ động cơ", unit: "PCE", price: "15.30", hs: "8504.40.90", conf: 0.72, sizes: ["BLD-120", "BLD-300", "BLD-510"] },
];

export type LargeLotItem = { desc: string; qty: string; unit: string; price: string; amount: string; hs: string; conf: number };

/** 120 dòng: xoay vòng 6 nhóm hàng × quy cách, số lượng và đơn giá thay đổi nhẹ theo dòng. */
export function largeLotItems(): LargeLotItem[] {
  return Array.from({ length: LARGE_LOT_LINES }, (_, i) => {
    const f = FAMILIES[i % FAMILIES.length]!;
    const size = f.sizes[Math.floor(i / FAMILIES.length) % f.sizes.length]!;
    const qty = 20 + ((i * 37) % 180);
    const priceMinor = toMinor(f.price) + (i % 5) * 5; // ±0,05 USD theo quy cách
    return {
      desc: `${f.desc} ${size}`, qty: String(qty), unit: f.unit, price: fromMinor(priceMinor), amount: fromMinor(priceMinor * qty), hs: f.hs, conf: f.conf,
    };
  });
}

export const largeLotTotal = (): string => fromMinor(largeLotItems().reduce((s, it) => s + toMinor(it.amount), 0));
