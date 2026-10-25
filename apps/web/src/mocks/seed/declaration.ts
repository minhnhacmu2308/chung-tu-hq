// Dữ liệu mẫu bước 4–5: dòng hàng (HS), lần chạy agent, tờ khai.
// Hồ sơ trình diễn dos_021 (HANSOL) và dos_026 (HIWIN) CHƯA chạy agent → PM tự bấm "Chạy AI Agent".
import { buildDeclaration, ratesFor } from "../declaration-builder";
import { LARGE_LOT_ID, largeLotItems } from "./large-lot";
import type { AgentRun, Declaration, Dossier, LineItem } from "../types";
import { seedCore } from "./core";

type ItemSeed = {
  desc: string;
  qty: string;
  unit: string;
  price: string;
  amount: string;
  invoiceHs?: string;
  hs: string;
  conf: number;
};

const ITEMS: Record<string, ItemSeed[]> = {
  [LARGE_LOT_ID]: largeLotItems(),
  dos_021: [
    { desc: "Vòng bi cầu 6205-2RS, đường kính trong 25 mm", qty: "2000", unit: "PCE", price: "1.85", amount: "3700.00", invoiceHs: "8482.10.1000", hs: "8482.10.00", conf: 0.94 },
    { desc: "Vòng bi cầu 6308ZZ, đường kính trong 40 mm", qty: "800", unit: "PCE", price: "4.20", amount: "3360.00", invoiceHs: "8482.10.1000", hs: "8482.10.00", conf: 0.92 },
    { desc: "Ổ bi đũa côn 30210", qty: "400", unit: "PCE", price: "6.75", amount: "2700.00", invoiceHs: "8482.20.0000", hs: "8482.20.00", conf: 0.88 },
    { desc: "Ổ bi đũa trụ NU2212", qty: "150", unit: "PCE", price: "18.40", amount: "2760.00", invoiceHs: "8482.50.0000", hs: "8482.50.00", conf: 0.86 },
    { desc: "Thanh trượt dẫn hướng HGR25, dài 1.000 mm", qty: "120", unit: "PCE", price: "32.50", amount: "3900.00", invoiceHs: "8482.80.0000", hs: "8466.93.90", conf: 0.61 },
    { desc: "Con trượt HGH25CA cho thanh dẫn hướng", qty: "240", unit: "PCE", price: "12.30", amount: "2952.00", invoiceHs: "8482.80.0000", hs: "8466.93.90", conf: 0.58 },
    { desc: "Gối đỡ vòng bi UCP208 (có lắp ổ bi)", qty: "200", unit: "SET", price: "7.39", amount: "1478.00", invoiceHs: "8483.20.0000", hs: "8483.20.90", conf: 0.81 },
  ],
  dos_026: [
    { desc: "Thanh trượt dẫn hướng MGN12H, dài 500 mm", qty: "100", unit: "PCE", price: "28.40", amount: "2840.00", invoiceHs: "8466.93", hs: "8466.93.90", conf: 0.66 },
    { desc: "Vít me bi SFU1605, dài 600 mm", qty: "40", unit: "PCE", price: "54.50", amount: "2180.00", invoiceHs: "8483.40", hs: "8483.40.90", conf: 0.83 },
    { desc: "Gối đỡ vít me BK12/BF12 (không lắp ổ bi)", qty: "50", unit: "SET", price: "12.00", amount: "600.00", hs: "8483.30.90", conf: 0.74 },
  ],
  dos_023: [
    { desc: "Động cơ điện xoay chiều 3 pha 0,75 kW YS8024", qty: "1500", unit: "PCE", price: "14.80", amount: "22200.00", invoiceHs: "8501.51", hs: "8501.51.19", conf: 0.9 },
    { desc: "Động cơ DC không chổi than 57BLF, 0,2 kW", qty: "1200", unit: "PCE", price: "12.35", amount: "14820.00", invoiceHs: "8501.31", hs: "8501.31.40", conf: 0.84 },
    { desc: "Bộ điều khiển tốc độ động cơ BLD-120", qty: "600", unit: "PCE", price: "15.325", amount: "9195.00", invoiceHs: "8504.40", hs: "8504.40.90", conf: 0.72 },
  ],
  dos_024: [
    { desc: "Đèn treo trần LED Tolomeo Mega, 3000K", qty: "40", unit: "PCE", price: "168.50", amount: "6740.00", invoiceHs: "9405.11", hs: "9405.11.90", conf: 0.89 },
    { desc: "Đèn bàn LED Tizio 35, màu đen", qty: "60", unit: "PCE", price: "104.00", amount: "6240.00", invoiceHs: "9405.21", hs: "9405.21.90", conf: 0.91 },
  ],
  dos_018: [
    { desc: "Thanh trượt dẫn hướng LGR20, dài 1.200 mm", qty: "300", unit: "PCE", price: "38.00", amount: "11400.00", hs: "8466.93.90", conf: 0.7 },
    { desc: "Con trượt LGH20CA", qty: "400", unit: "PCE", price: "15.05", amount: "6020.00", hs: "8466.93.90", conf: 0.68 },
  ],
  dos_019: [
    { desc: "Động cơ điện xoay chiều 3 pha 0,75 kW YS8024", qty: "1800", unit: "PCE", price: "14.80", amount: "26640.00", hs: "8501.51.19", conf: 0.9 },
    { desc: "Bộ điều khiển tốc độ động cơ BLD-120", qty: "800", unit: "PCE", price: "15.325", amount: "12260.00", hs: "8504.40.90", conf: 0.72 },
  ],
  dos_020: [
    { desc: "Gối đỡ vòng bi UCF205 gia công", qty: "2500", unit: "SET", price: "5.30", amount: "13250.00", hs: "8483.20.90", conf: 0.85 },
    { desc: "Trục truyền động thép C45 gia công, Ø30 × 800 mm", qty: "500", unit: "PCE", price: "19.00", amount: "9500.00", hs: "8483.10.90", conf: 0.8 },
  ],
  dos_017: [
    { desc: "Đèn treo trần LED Tolomeo Mega, 2700K", qty: "30", unit: "PCE", price: "168.50", amount: "5055.00", hs: "9405.11.90", conf: 0.89 },
    { desc: "Đèn bàn LED Tizio 35, màu trắng", qty: "40", unit: "PCE", price: "106.375", amount: "4255.00", hs: "9405.21.90", conf: 0.91 },
  ],
  dos_016: [
    { desc: "Vòng bi cầu 6205-2RS", qty: "4000", unit: "PCE", price: "1.85", amount: "7400.00", hs: "8482.10.00", conf: 0.94 },
    { desc: "Ổ bi đũa côn 30205", qty: "1600", unit: "PCE", price: "5.30", amount: "8480.00", hs: "8482.20.00", conf: 0.88 },
  ],
  dos_014: [
    { desc: "Vòng bi cầu 6001ZZ", qty: "3000", unit: "PCE", price: "1.25", amount: "3750.00", hs: "8482.10.00", conf: 0.93 },
    { desc: "Vòng bi kim HK1012", qty: "2000", unit: "PCE", price: "1.46", amount: "2920.00", hs: "8482.40.00", conf: 0.87 },
  ],
};

/** Hồ sơ đã chạy xong agent (HS đã xác nhận, đã có tờ khai). */
const DONE = [LARGE_LOT_ID, "dos_023", "dos_024", "dos_018", "dos_019", "dos_020", "dos_017", "dos_016", "dos_014"];

export function seedDeclaration(dossiers: Dossier[]): { lineItems: LineItem[]; agentRuns: AgentRun[]; declarations: Declaration[] } {
  const lineItems: LineItem[] = [];
  const agentRuns: AgentRun[] = [];
  const declarations: Declaration[] = [];
  const org = seedCore().org;

  for (const d of dossiers) {
    const seeds = ITEMS[d.id];
    if (!seeds) continue;
    const done = DONE.includes(d.id);
    const items: LineItem[] = seeds.map((s, i) => ({
      id: `li_${d.id.slice(4)}_${i + 1}`,
      dossierId: d.id,
      lineNo: i + 1,
      description: s.desc,
      quantity: s.qty,
      unit: s.unit,
      unitPrice: s.price,
      amount: s.amount,
      origin: d.partner.includes("ARTEMIDE") ? "IT" : d.partner.includes("SHENZHEN") ? "CN" : d.partner.includes("TAIWAN") ? "TW" : d.partner.includes("MORINAGA") ? "JP" : d.direction === "XK" ? "VN" : "KR",
      ...(s.invoiceHs ? { invoiceHsCode: s.invoiceHs } : {}),
      hsSuggested: s.hs,
      hsConfidence: s.conf,
      ...(done ? { hsConfirmed: s.hs, ...ratesFor(d, s.hs) } : {}),
    }));
    lineItems.push(...items);

    if (done) {
      const startedAt = new Date(new Date(d.createdAt).getTime() + 3_600_000).toISOString();
      agentRuns.push({
        dossierId: d.id,
        mode: "BOTH",
        startedAt,
        tasks: [
          { id: "HS_LOOKUP", status: "DONE", progress: 100, message: `Đã tra ${items.length} dòng hàng` },
          { id: "MAPPING", status: "DONE", progress: 100, message: "Đã ánh xạ theo SK-MAP" },
          { id: "BUILD_DECLARATION", status: "DONE", progress: 100, message: "Đã dựng tờ khai nháp" },
          { id: "DIGITIZE", status: "DONE", progress: 100, message: "Đã số hóa chứng từ" },
        ],
      });
      const decl = buildDeclaration(d, items, org);
      if (d.status === "APPROVED") {
        Object.assign(decl, { status: "APPROVED", approvedBy: "Phạm Anh Tuấn", approvedAt: d.updatedAt });
      } else if (d.status === "SUBMITTED" || d.status === "CLEARED") {
        Object.assign(decl, { status: "SUBMITTED", approvedBy: "Phạm Anh Tuấn", approvedAt: d.updatedAt });
      }
      declarations.push(decl);
    }
  }
  return { lineItems, agentRuns, declarations };
}
