// Danh mục hàng hóa dùng chung mẫu (ADR 0015) của doanh nghiệp demo. Dữ liệu minh họa, không phải dữ liệu thật.
// Chế độ "Mỗi bộ phận một bộ mã": Kế toán (MISA) – mã hiển thị chính, Kho, XNK (mặc định cho Hải quan) + 2 bộ nhà cung cấp.
// ~40 mặt hàng: ĐVT khác nhau giữa các bộ (cuộn / mét / kg / tấm…) có quy đổi, vài mã trùng viết khác ("vt-0012" / "VT 0012"),
// vài mặt hàng chưa có mã XNK / chưa có quy đổi; 8 mục hàng chờ ghép đủ 3 mức (mức tính bằng đúng luật ghép của @kb/contracts).
// Mặt hàng 1–7 giữ id `prd_seed_<n>` của danh mục cũ (product_catalog) – như migration giữ id cũ.
import { itemCodeKey, itemNameKey, type CatalogItemKind, type CodeSetKind, type LineItem } from "@kb/contracts";
import { matchContext, resolveIn, type MockAlias, type MockCatalog, type MockCatalogItem, type MockCodeSet, type MockQueueItem } from "../catalog-engine";

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const day = (d: number) => daysAgo(d).slice(0, 10);

export const SEED_SETS = { ACC: "cst_seed_acc", WH: "cst_seed_wh", XNK: "cst_seed_xnk", SKF: "cst_seed_skf", HIWIN: "cst_seed_hiwin" } as const;
type SetRef = keyof typeof SEED_SETS;

const SETS: { ref: SetRef; kind: CodeSetKind; name: string; partner?: string; primary?: boolean; isDefault?: boolean; owners: string[] }[] = [
  { ref: "ACC", kind: "ACCOUNTING", name: "Kế toán (MISA)", primary: true, owners: ["usr_tuan"] },
  { ref: "WH", kind: "WAREHOUSE", name: "Kho", owners: ["usr_ha"] },
  { ref: "XNK", kind: "CUSTOMS", name: "XNK", isDefault: true, owners: ["usr_chau"] },
  { ref: "SKF", kind: "SUPPLIER", name: "SKF KOREA LTD", partner: "SKF KOREA LTD", owners: [] },
  { ref: "HIWIN", kind: "SUPPLIER", name: "HIWIN TECHNOLOGIES CORP.", partner: "HIWIN TECHNOLOGIES CORP.", owners: [] },
];

/** [bộ, mã như trong hệ thống của bộ phận, ĐVT của bộ (vắng = ĐVT gốc)]. */
type A = [SetRef, string, string?];
type ItemSeed = {
  kind: CatalogItemKind; name: string; hs: string | null; unit: string; origin?: string; times?: number; ago?: number; no?: string; duty?: string;
  aliases: A[]; conv?: Record<string, string>;
};

const ITEMS: ItemSeed[] = [
  // 1–7: mặt hàng của danh mục cũ (giữ id).
  { kind: "GOODS", name: "Vòng bi cầu 6205-2RS, đường kính trong 25 mm", hs: "84821000", unit: "PCE", origin: "KR", times: 6, ago: 12, no: "107845120330", duty: "3",
    aliases: [["ACC", "vt-0012"], ["WH", "VT 0012"], ["XNK", "6205-2RS"], ["SKF", "6205-2RSH"]] },
  { kind: "GOODS", name: "Vòng bi cầu 6308ZZ, đường kính trong 40 mm", hs: "84821000", unit: "PCE", origin: "KR", times: 4, ago: 12, no: "107845120330", duty: "3",
    aliases: [["ACC", "VT-0013"], ["WH", "VT0013", "DZN"], ["XNK", "6308ZZ"], ["SKF", "6308-ZZ"]], conv: { DZN: "12" } },
  { kind: "GOODS", name: "Ổ bi đũa côn 30210", hs: "84822000", unit: "PCE", origin: "JP", times: 3, ago: 40, no: "107712004410", duty: "3", aliases: [["ACC", "VT-0014"], ["XNK", "30210"]] },
  { kind: "GOODS", name: "Gối đỡ vòng bi UCP208 (có lắp ổ bi)", hs: "84832090", unit: "SET", origin: "CN", times: 2, ago: 40, no: "107712004410", duty: "0",
    aliases: [["ACC", "VT-0015"], ["WH", "VT-0015"], ["XNK", "UCP208"]] },
  { kind: "GOODS", name: "Vít me bi SFU1605, dài 600 mm", hs: "84834090", unit: "PCE", origin: "TW", times: 2, ago: 75, no: "107598332100", duty: "0",
    aliases: [["ACC", "VT-0016"], ["XNK", "SFU1605"], ["HIWIN", "SFU01605-4"]] },
  { kind: "GOODS", name: "Động cơ điện xoay chiều 3 pha 0,75 kW YS8024", hs: "85015119", unit: "PCE", origin: "CN", times: 1, ago: 5, duty: "5", aliases: [["ACC", "TB-0101"], ["XNK", "YS8024"]] },
  { kind: "GOODS", name: "Thanh trượt dẫn hướng HGR25, dài 1.000 mm", hs: "84669390", unit: "PCE", origin: "TW", aliases: [["WH", "VT-0017"], ["HIWIN", "HGR25-1000"]] },
  // 8–40.
  { kind: "MATERIAL", name: "Dây cáp điện CVV 3x2.5mm2", hs: "85444949", unit: "MTR", origin: "VN", times: 3, ago: 20,
    aliases: [["ACC", "DC-0001"], ["WH", "dc 0001", "ROL"], ["XNK", "CVV3X2.5"]], conv: { ROL: "100" } },
  { kind: "MATERIAL", name: "Dây cáp điện CVV 3x4mm2", hs: "85444949", unit: "MTR", origin: "VN", aliases: [["ACC", "DC-0002"], ["WH", "DC.0002", "ROL"]], conv: { ROL: "100" } },
  { kind: "MATERIAL", name: "Dây điện đơn VCm 1.5mm2", hs: "85444929", unit: "MTR", origin: "VN", aliases: [["ACC", "DC-0003"], ["WH", "DC-0003", "ROL"]], conv: { ROL: "200" } },
  { kind: "MATERIAL", name: "Ống nhựa PVC phi 21", hs: "39172300", unit: "MTR", origin: "VN", aliases: [["ACC", "ON-0021"], ["WH", "ON-0021", "PCE"]], conv: { PCE: "4" } },
  { kind: "MATERIAL", name: "Ống nhựa PVC phi 27", hs: "39172300", unit: "MTR", origin: "VN", aliases: [["ACC", "ON-0027"], ["WH", "ON-0027", "PCE"]], conv: { PCE: "4" } },
  { kind: "MATERIAL", name: "Thép tấm SS400 dày 5 mm", hs: "72085100", unit: "KGM", origin: "JP", times: 2, ago: 30, duty: "0",
    aliases: [["ACC", "TH-0005"], ["WH", "TH-0005", "PCE"], ["XNK", "SS400-5"]], conv: { PCE: "235.5" } },
  { kind: "MATERIAL", name: "Thép tấm SS400 dày 10 mm", hs: "72085100", unit: "KGM", origin: "JP", aliases: [["ACC", "TH-0010"], ["WH", "TH-0010", "PCE"]], conv: { PCE: "471" } },
  { kind: "MATERIAL", name: "Thép cuộn cán nóng dày 2 mm", hs: "72083990", unit: "KGM", origin: "CN", times: 1, ago: 45,
    aliases: [["ACC", "TH-C002"], ["WH", "TH-C002", "ROL"], ["XNK", "HRC-2.0"]], conv: { ROL: "8000" } },
  { kind: "MATERIAL", name: "Vải không dệt PP 80 gsm khổ 1,6 m", hs: "56031300", unit: "MTR", origin: "CN", aliases: [["ACC", "VAI-080"], ["WH", "VAI-080", "ROL"]], conv: { ROL: "50" } },
  // Kho tính theo kg, chưa có quy đổi → "chưa có quy đổi".
  { kind: "MATERIAL", name: "Vải canvas cotton khổ 1,5 m", hs: "52091200", unit: "MTR", origin: "IN", aliases: [["ACC", "VAI-C15"], ["WH", "VAI-C15", "KGM"]] },
  { kind: "SUPPLY", name: "Băng keo OPP trong 48 mm x 100 m", hs: "39191010", unit: "ROL", origin: "VN", aliases: [["ACC", "BK-048"], ["WH", "BK-048"]] },
  { kind: "SUPPLY", name: "Màng PE quấn pallet khổ 50 cm", hs: "39201090", unit: "ROL", origin: "VN", aliases: [["ACC", "MPE-50"], ["WH", "MPE-50", "KGM"]], conv: { KGM: "0.4" } },
  { kind: "MATERIAL", name: "Hạt nhựa PP homopolymer", hs: "39021040", unit: "KGM", origin: "SA", times: 5, ago: 8, duty: "3",
    aliases: [["ACC", "NL-PP01"], ["WH", "NL-PP01"], ["XNK", "PP-H030"]] },
  { kind: "MATERIAL", name: "Hạt nhựa HDPE", hs: "39012000", unit: "KGM", origin: "TH", times: 2, ago: 60, duty: "3",
    aliases: [["ACC", "NL-HD01"], ["WH", "NL-HD01"], ["XNK", "HDPE-5502", "TNE"]], conv: { TNE: "1000" } },
  { kind: "SUPPLY", name: "Bu lông lục giác M10x40 inox 304", hs: "73181510", unit: "PCE", origin: "CN", aliases: [["ACC", "BL-1040"], ["WH", "BL-1040", "KGM"]], conv: { KGM: "30" } },
  { kind: "SUPPLY", name: "Đai ốc lục giác M10 inox 304", hs: "73181610", unit: "PCE", origin: "CN", aliases: [["ACC", "DO-0010"], ["WH", "DO-0010", "KGM"]], conv: { KGM: "80" } },
  { kind: "SUPPLY", name: "Vòng đệm phẳng M10 inox", hs: "73182200", unit: "PCE", origin: "CN", aliases: [["ACC", "VD-0010"]] },
  { kind: "SUPPLY", name: "Sơn epoxy chống gỉ màu xám", hs: "32089090", unit: "LTR", origin: "VN", aliases: [["ACC", "SON-EP1"], ["WH", "SON-EP1"]] },
  { kind: "SUPPLY", name: "Dung môi pha sơn epoxy", hs: "38140000", unit: "LTR", origin: "VN", aliases: [["ACC", "SON-DM1"]] },
  { kind: "SUPPLY", name: "Dầu thủy lực ISO VG46", hs: "27101943", unit: "LTR", origin: "SG", aliases: [["ACC", "DAU-46"], ["WH", "DAU-46"]] },
  { kind: "SUPPLY", name: "Mỡ bôi trơn chịu nhiệt", hs: "34031990", unit: "KGM", origin: "SG", aliases: [["ACC", "MO-001"]] },
  { kind: "SUPPLY", name: "Thùng carton 5 lớp 60x40x40 cm", hs: "48191000", unit: "PCE", origin: "VN", aliases: [["ACC", "BB-CT01"], ["WH", "BB-CT01"]] },
  { kind: "SUPPLY", name: "Pallet gỗ 1200x1000 mm", hs: "44152000", unit: "PCE", origin: "VN", aliases: [["ACC", "BB-PL01"], ["WH", "BB-PL01"]] },
  { kind: "SUPPLY", name: "Găng tay bảo hộ sợi", hs: "61169900", unit: "PR", origin: "VN", aliases: [["ACC", "BH-GT01"], ["WH", "BH-GT01", "DZN"]], conv: { DZN: "12" } },
  { kind: "SUPPLY", name: "Khẩu trang y tế 3 lớp", hs: "63079040", unit: "PCE", origin: "VN", aliases: [["ACC", "BH-KT01"], ["WH", "BH-KT01"]] },
  { kind: "PRODUCT", name: "Quạt công nghiệp 750W", hs: "84145199", unit: "PCE", origin: "VN", times: 4, ago: 15, aliases: [["ACC", "SP-Q750"], ["XNK", "QCN-750"]] },
  { kind: "PRODUCT", name: "Quạt công nghiệp 1100W", hs: "84145199", unit: "PCE", origin: "VN", times: 2, ago: 15, aliases: [["ACC", "SP-Q1100"], ["XNK", "QCN-1100"]] },
  { kind: "PRODUCT", name: "Tủ điện điều khiển 3 pha", hs: "85371019", unit: "SET", origin: "VN", times: 1, ago: 50, aliases: [["ACC", "SP-TD3P"], ["XNK", "TD-3P"]] },
  { kind: "GOODS", name: "Biến tần 2,2 kW 3 pha", hs: "85044090", unit: "PCE", origin: "TW", times: 1, ago: 90, duty: "0", aliases: [["ACC", "TB-BT22"], ["XNK", "VFD022"]] },
  { kind: "GOODS", name: "Cảm biến tiệm cận M18", hs: "85365069", unit: "PCE", origin: "JP", aliases: [["ACC", "TB-CB18"], ["WH", "TB-CB18"]] },
  { kind: "GOODS", name: "Rơ le trung gian 24VDC", hs: "85364990", unit: "PCE", origin: "CN", aliases: [["ACC", "TB-RL24"]] },
  { kind: "GOODS", name: "Ray trượt kèm con trượt HGW25CC", hs: "84669390", unit: "PCE", origin: "TW", times: 2, ago: 75, no: "107598332100", duty: "0",
    aliases: [["ACC", "VT-0018"], ["XNK", "HGW25CC"], ["HIWIN", "HGW25CC"]] },
  { kind: "GOODS", name: "Nhông xích 08B 20 răng", hs: "84839099", unit: "PCE", origin: "CN", aliases: [["ACC", "VT-0019"], ["WH", "vt.0019"]] },
];

/** Mục hàng chờ: mức/gợi ý tính bằng luật ghép lúc tạo seed (2 chắc chắn, 3 nghi vấn – 1 thiếu quy đổi –, 3 không khớp). */
const QUEUE: { set: SetRef; code: string; name: string; unit: string | null; hs: string | null; ago: number; ref: string }[] = [
  { set: "SKF", code: "6205-2RSH/C3", name: "Vòng bi cầu 6205-2RS, đường kính trong 25 mm", unit: "PCE", hs: "84821000", ago: 3, ref: "document:seed-skf" },
  { set: "XNK", code: "QCN-750-B", name: "Quạt công nghiệp 750W", unit: "PCE", hs: "84145199", ago: 3, ref: "document:seed-xk" },
  { set: "XNK", code: "TH-0010", name: "Thép tấm SS400 10mm", unit: "TNE", hs: "72085100", ago: 2, ref: "document:seed-thep" },
  { set: "ACC", code: "VT-0020", name: "Vòng bi cầu 6205-2RS, đường kính 25 mm", unit: "PCE", hs: null, ago: 2, ref: "user:usr_ha" },
  { set: "SKF", code: "NU210", name: "Ổ bi đũa trụ NU210", unit: "PCE", hs: "84822000", ago: 2, ref: "document:seed-skf" },
  { set: "WH", code: "VT-0099", name: "Lưỡi cưa hợp kim 255 mm", unit: "PCE", hs: null, ago: 1, ref: "user:usr_ha" },
  { set: "HIWIN", code: "HGH20CA", name: "Con trượt dẫn hướng HGH20CA", unit: "PCE", hs: null, ago: 1, ref: "document:seed-hiwin" },
  { set: "XNK", code: "KT-3L-50", name: "Khẩu trang vải 3 lớp", unit: "PCE", hs: "63079090", ago: 1, ref: "document:seed-xk" },
];

/**
 * Dòng hàng của hồ sơ mẫu đã tra danh mục (như khi đọc invoice: Part No tra bộ nhà cung cấp): [hồ sơ, dòng, mặt hàng | null = "Mã lạ"].
 * dos_021 (chưa chạy agent – PM bấm chạy rồi thấy thẻ mã nối + 2 dòng "Mã lạ"), dos_016 (đã khai).
 */
const LINE_LINKS: [string, number, string | null][] = [
  ["dos_021", 1, "prd_seed_1"], ["dos_021", 2, "prd_seed_2"], ["dos_021", 3, "prd_seed_3"], ["dos_021", 4, null],
  ["dos_021", 5, "prd_seed_7"], ["dos_021", 6, null], ["dos_021", 7, "prd_seed_4"],
  ["dos_016", 1, "prd_seed_1"],
];

/** Gắn mặt hàng / cờ "Mã lạ" cho dòng hàng mẫu; mã hàng (HAG_MAHANG) = mã bộ Hải quan mặc định của mặt hàng. */
export function seedLineCatalogLinks(lines: LineItem[], cat: MockCatalog): void {
  const customs = cat.codeSets.find((s) => s.isDefault);
  for (const [dossierId, lineNo, itemId] of LINE_LINKS) {
    const line = lines.find((l) => l.dossierId === dossierId && l.lineNo === lineNo);
    if (!line) continue;
    const item = itemId ? cat.items.find((i) => i.id === itemId) : null;
    if (!item) {
      line.unknownCode = true;
      continue;
    }
    line.catalogItem = { id: item.id, itemNo: item.itemNo, name: item.name };
    const code = cat.aliases.find((a) => a.itemId === item.id && a.codeSetId === customs?.id && a.status === "ACTIVE")?.code;
    if (code) line.itemCode = code;
  }
}

export function seedCatalog(): MockCatalog {
  const created = daysAgo(120);
  const codeSets: MockCodeSet[] = SETS.map((s) => ({
    id: SEED_SETS[s.ref], kind: s.kind, name: s.name, partnerName: s.partner ?? null, partnerKey: s.partner ? itemNameKey(s.partner) : null,
    // Bộ nguồn gốc mẫu = XNK (như migration: chưa có SHARED → bộ mặc định cho Hải quan).
    isPrimaryDisplay: !!s.primary, isDefault: !!s.isDefault, isSource: !!s.isDefault, createdAt: created,
  }));
  const owners = Object.fromEntries(SETS.map((s) => [SEED_SETS[s.ref], s.owners]));
  const items: MockCatalogItem[] = [];
  const aliases: MockAlias[] = [];
  const conversions: MockCatalog["conversions"] = [];
  ITEMS.forEach((s, i) => {
    const n = i + 1;
    const id = n <= 7 ? `prd_seed_${n}` : `cat_seed_${n}`;
    const at = daysAgo((s.ago ?? 10) + 30);
    items.push({
      id, itemNo: `MH-${String(n).padStart(6, "0")}`, kind: s.kind, name: s.name, nameKey: itemNameKey(s.name), hsCode: s.hs, baseUnit: s.unit, origin: s.origin ?? null,
      tariffSchedule: "B01", importDutyRate: s.duty ?? null, vatRate: s.duty !== undefined ? "8" : null, envTaxRate: null, exciseRate: null, safeguardRate: null, antiDiscriminationRate: null,
      description: null, note: null, timesDeclared: s.times ?? 0, lastDeclarationNo: s.no ?? null, lastDeclarationDate: s.times ? day(s.ago ?? 10) : null,
      status: "ACTIVE", mergedIntoId: null, source: n <= 7 ? "MIGRATION" : "IMPORT", createdAt: at, updatedAt: daysAgo(s.ago ?? 10),
    });
    s.aliases.forEach(([ref, code, unit], k) => {
      aliases.push({
        id: `ali_seed_${n}_${k + 1}`, codeSetId: SEED_SETS[ref], code, codeKey: itemCodeKey(code), name: s.name, unit: unit ?? s.unit, itemId: id, status: "ACTIVE",
        proposedBy: "usr_chau", decidedBy: "usr_chau", decidedAt: at, source: n <= 7 && ref === "XNK" ? "MIGRATION" : "IMPORT", createdAt: at,
      });
    });
    for (const [unit, factor] of Object.entries(s.conv ?? {})) conversions.push({ itemId: id, unit, factor });
  });
  // Một đề xuất mã đang chờ người phụ trách bộ Kho duyệt.
  aliases.push({
    id: "ali_seed_proposed_1", codeSetId: SEED_SETS.WH, code: "TB-RL24", codeKey: itemCodeKey("TB-RL24"), name: "Rơ le trung gian 24VDC", unit: "PCE", itemId: "cat_seed_38",
    status: "PROPOSED", proposedBy: "usr_ha", decidedBy: null, decidedAt: null, source: "MANUAL", createdAt: daysAgo(1),
  });

  const cat: MockCatalog = {
    settings: { mode: "PER_DEPARTMENT", itemNoPrefix: "MH-", itemNoSeq: ITEMS.length, setupAt: created },
    codeSets, owners, items, aliases, conversions, queue: [], imports: [], audit: [],
  };
  const ctx = matchContext(cat);
  cat.queue = QUEUE.map((q, i): MockQueueItem => {
    const codeSetId = SEED_SETS[q.set];
    const res = resolveIn(cat, { codeSetId, code: q.code, name: q.name, hsCode: q.hs, unit: q.unit }, ctx);
    return {
      id: `cmq_seed_${i + 1}`, importId: null, importRow: null, codeSetId, code: q.code, name: q.name, unit: q.unit, hsCode: q.hs, level: res.level,
      suggestedItemId: res.itemId ?? res.candidates[0]?.itemId ?? null, candidates: res.candidates, reason: res.reason, status: "PENDING",
      decidedBy: null, decidedAt: null, sourceRef: q.ref, factor: null, itemFields: null, createdAt: daysAgo(q.ago),
    };
  });
  return cat;
}
