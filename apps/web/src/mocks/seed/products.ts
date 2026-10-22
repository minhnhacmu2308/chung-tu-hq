// Danh mục hàng hóa mẫu của doanh nghiệp demo (mặt hàng đã khai trước đây). Dữ liệu minh họa, không phải dữ liệu thật.
import type { ProductCatalogItem } from "@kb/contracts";

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const day = (d: number) => daysAgo(d).slice(0, 10);

type Seed = Pick<ProductCatalogItem, "code" | "name" | "hsCode" | "unit" | "origin" | "importDutyRate" | "vatRate" | "source" | "timesDeclared"> & { ago: number; no?: string; type?: string };

const SEED: Seed[] = [
  { code: "6205-2RS", name: "Vòng bi cầu 6205-2RS, đường kính trong 25 mm", hsCode: "84821000", unit: "PCE", origin: "KR", importDutyRate: "3", vatRate: "8", source: "IMPORT", timesDeclared: 6, ago: 12, no: "107845120330", type: "A11" },
  { code: "6308ZZ", name: "Vòng bi cầu 6308ZZ, đường kính trong 40 mm", hsCode: "84821000", unit: "PCE", origin: "KR", importDutyRate: "3", vatRate: "8", source: "IMPORT", timesDeclared: 4, ago: 12, no: "107845120330", type: "A11" },
  { code: "30210", name: "Ổ bi đũa côn 30210", hsCode: "84822000", unit: "PCE", origin: "JP", importDutyRate: "3", vatRate: "8", source: "IMPORT", timesDeclared: 3, ago: 40, no: "107712004410", type: "A11" },
  { code: "UCP208", name: "Gối đỡ vòng bi UCP208 (có lắp ổ bi)", hsCode: "84832090", unit: "SET", origin: "CN", importDutyRate: "0", vatRate: "8", source: "IMPORT", timesDeclared: 2, ago: 40, no: "107712004410", type: "A11" },
  { code: "SFU1605", name: "Vít me bi SFU1605, dài 600 mm", hsCode: "84834090", unit: "PCE", origin: "TW", importDutyRate: "0", vatRate: "8", source: "IMPORT", timesDeclared: 2, ago: 75, no: "107598332100", type: "A12" },
  { code: null, name: "Động cơ điện xoay chiều 3 pha 0,75 kW YS8024", hsCode: "85015119", unit: "PCE", origin: "CN", importDutyRate: "5", vatRate: "8", source: "DECLARATION", timesDeclared: 1, ago: 5, type: "A11" },
  { code: null, name: "Thanh trượt dẫn hướng HGR25, dài 1.000 mm", hsCode: "84669390", unit: "PCE", origin: "TW", importDutyRate: "0", vatRate: "8", source: "MANUAL", timesDeclared: 0, ago: 2 },
];

export function seedProducts(): ProductCatalogItem[] {
  return SEED.map((s, i) => ({
    id: `prd_seed_${i + 1}`, code: s.code, name: s.name, hsCode: s.hsCode, unit: s.unit, origin: s.origin, tariffSchedule: "B01",
    importDutyRate: s.importDutyRate, vatRate: s.vatRate, note: null, source: s.source, timesDeclared: s.timesDeclared,
    lastDeclarationNo: s.no ?? null, lastDeclarationDate: s.source === "MANUAL" ? null : day(s.ago), lastTypeCode: s.type ?? null,
    raw: null, createdAt: daysAgo(s.ago + 30), updatedAt: daysAgo(s.ago),
  }));
}
