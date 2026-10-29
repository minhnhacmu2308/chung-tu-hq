// Tên trên chứng từ → mã VNACCS (cảng/sân bay, phương thức thanh toán, đơn vị kiện, phương thức vận chuyển). Thuần.
// Thiếu mã → trả null; use case đánh dấu suspect "Không tìm thấy mã cho …" để người khai chọn (BACKEND-TODO D3).
import { TRANSPORT_MODE_INFO, type TransportMode } from "@kb/contracts";

export type Resolved = { code: string; name: string } | null;
/** Một mã trong danh mục VNACCS đầy đủ (@kb/contracts code-lists) – tầng application nạp sẵn rồi truyền vào (domain không tải file). */
export type CatalogEntry = { code: string; name: string; parent?: string; note?: string };

/**
 * Cách chứng từ hay ghi tên cảng → mã cảng (CHỈ bí danh để nhận ra). Mã và tên khai lấy từ danh mục A016 của @kb/contracts (code-lists):
 * mã không có trong danh mục thì bỏ qua – không viết cứng mã/tên ở đây. Thứ tự là thứ tự ưu tiên: bến cụ thể trước cảng/thành phố chung.
 * Sân bay (VNSGN, VNHAN…) chưa có trong A016 (README code-lists) → chưa nhận; có trong danh mục là tự dùng được.
 */
export const PORT_ALIASES: { code: string; aliases: string[]; city?: string[] }[] = [
  { code: "VNHPN", aliases: ["TAN VU"] },
  { code: "VNDVU", aliases: ["DINH VU"] },
  { code: "VNCLH", aliases: ["LACH HUYEN", "HICT"] },
  { code: "VNHPH", aliases: ["HPH"], city: ["HAIPHONG", "HAI PHONG"] },
  { code: "VNCLI", aliases: ["CAT LAI", "CATLAI"] },
  { code: "VNCMT", aliases: ["CAI MEP", "CAIMEP"] },
  { code: "VNSGN", aliases: ["SAIGON", "SAI GON", "TAN SON NHAT", "TANSONNHAT", "SGN"], city: ["HO CHI MINH", "HOCHIMINH", "HCM", "HCMC"] },
  { code: "VNDAN", aliases: ["DA NANG", "DANANG"] },
  { code: "VNHAN", aliases: ["NOI BAI", "NOIBAI", "HANOI", "HAN"] },
  { code: "KRPUS", aliases: ["BUSAN", "PUSAN"] },
  { code: "KRINC", aliases: ["INCHEON", "ICN"] },
  { code: "CNSHA", aliases: ["SHANGHAI"] },
  { code: "CNYTN", aliases: ["YANTIAN"] },
  { code: "CNSZX", aliases: ["SHENZHEN", "SHEKOU"] },
  { code: "CNNGB", aliases: ["NINGBO"] },
  { code: "CNTAO", aliases: ["QINGDAO"] },
  { code: "CNXMN", aliases: ["XIAMEN"] },
  { code: "HKHKG", aliases: ["HONG KONG", "HONGKONG"] },
  { code: "TWKHH", aliases: ["KAOHSIUNG"] },
  { code: "TWKEL", aliases: ["KEELUNG"] },
  { code: "JPTYO", aliases: ["TOKYO"] },
  { code: "JPYOK", aliases: ["YOKOHAMA"] },
  { code: "JPUKB", aliases: ["KOBE"] },
  { code: "JPOSA", aliases: ["OSAKA"] },
  { code: "SGSIN", aliases: ["SINGAPORE"] },
  { code: "THBKK", aliases: ["BANGKOK"] },
  { code: "THLCH", aliases: ["LAEM CHABANG"] },
  { code: "MYPKG", aliases: ["PORT KLANG", "KLANG"] },
  { code: "ITGOA", aliases: ["GENOVA", "GENOA"] },
  { code: "DEHAM", aliases: ["HAMBURG"] },
  { code: "NLRTM", aliases: ["ROTTERDAM"] },
  { code: "BEANR", aliases: ["ANTWERP", "ANTWERPEN"] },
  { code: "USLAX", aliases: ["LOS ANGELES"] },
  { code: "USNYC", aliases: ["NEW YORK"] },
  { code: "SEGOT", aliases: ["GOTHENBURG", "GOTEBORG"] },
];

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** "BUSAN, KOREA" → KRPUS; "HAIPHONG, VIETNAM" → VNHPH (mã + tên theo danh mục A016). Mã LOCODE 5 ký tự có sẵn trong chuỗi được ưu tiên. */
export function resolvePort(name: string | null, catalog: readonly CatalogEntry[] | undefined): Resolved {
  const r = resolvePortDetail(name, catalog);
  return r ? { code: r.code, name: r.name } : null;
}

/**
 * Như resolvePort, kèm `generic` khi chỉ khớp tên thành phố ("HO CHI MINH" → VNSGN): đúng mã cảng chung nhưng không chỉ rõ bến,
 * chứng từ khác ghi bến cụ thể (Arrival Notice "CANG CAT LAI (HCM)") thì phải ưu tiên bến đó.
 */
/**
 * Ô sân bay chỉ ghi mã IATA 3 chữ ("SGN") hoặc mã trạm chuyển phát = IATA + 1 chữ (FedEx "SGNA", "ZUHA") → mã IATA.
 * Chỉ nhận khi cả ô là một từ 3–4 chữ (tránh nhầm "NAM", "CITY" trong địa chỉ). UN/LOCODE sân bay thường = mã nước + IATA.
 */
export function iataOf(raw: string | null): string | null {
  const t = raw ? norm(raw) : "";
  return /^[A-Z]{3}[A-Z]?$/.test(t) ? t.slice(0, 3) : null;
}

function resolvePortDetail(name: string | null, catalog: readonly CatalogEntry[] | undefined): (NonNullable<Resolved> & { generic?: true }) | null {
  if (!name || !catalog?.length) return null;
  const byCode = new Map(catalog.map((e) => [e.code, e]));
  const entry = (code: string) => byCode.get(code);
  const known = PORT_ALIASES.filter((p) => entry(p.code));
  const out = (code: string, generic?: true) => ({ code, name: entry(code)!.name, ...(generic ? { generic } : {}) });
  const n = norm(name);
  // Mã ghi sẵn dạng giá trị chọn từ danh mục ("VNHPN – Cảng Tân Vũ" hoặc cả ô chỉ là mã). Không dò mã trong câu: A016 có ~14.700 mã,
  // nhiều mã trùng từ tiếng Anh (GRAND, DEBIT…) sẽ bị bắt nhầm.
  const head = /^\s*([A-Z0-9]{5,6})\s*(?:[–—-]|$)/.exec(name.toUpperCase())?.[1];
  if (head && entry(head)) return out(head);
  const iata = iataOf(name);
  const byIata = iata ? known.find((p) => p.code.slice(2) === iata || p.aliases.includes(iata)) : undefined;
  if (byIata) return out(byIata.code);
  // So theo nguyên từ: alias ngắn như "HAN" (Nội Bài) không được khớp vào giữa "SHANGHAI" hay "CHANGI".
  const padded = ` ${n} `;
  const has = (a: string) => padded.includes(` ${a} `);
  const hit = known.find((p) => p.aliases.some(has));
  if (hit) return out(hit.code);
  const city = known.find((p) => p.city?.some(has));
  return city ? out(city.code, true) : null;
}

/** Bỏ dấu tiếng Việt rồi chuẩn hóa như `norm` – so tên trên chứng từ với tên trong danh mục VNACCS (viết không dấu). */
const plain = (s: string) => norm(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D"));

/** Tên trên chứng từ trùng nguyên văn tên một mã trong danh mục ("CANG CAT LAI (HCM)" → VNCLI), hoặc chuỗi chứa sẵn mã đó. */
export function findInCatalog(raw: string | null, catalog: readonly CatalogEntry[] | undefined): CatalogEntry | null {
  if (!raw || !catalog?.length) return null;
  const n = plain(raw);
  const tokens = new Set(n.split(" "));
  return catalog.find((e) => plain(e.name) === n) ?? catalog.find((e) => e.code.length >= 5 && tokens.has(e.code)) ?? null;
}

export type DischargePick = { resolved: Resolved; note?: string; /** Chuỗi trên chứng từ đã cho ra mã (để ghi nguồn). */ raw: string | null; fromCatalog?: true };

/**
 * Cảng dỡ từ mọi chứng từ (B/L, Arrival Notice…) theo thứ tự ưu tiên, rồi điểm đến cuối:
 * 1) tên trùng danh mục cảng VNACCS (A016) → mã đó; 2) bến cụ thể theo bí danh (PORT_ALIASES, mã có trong A016); 3) mã cảng chung theo tên thành phố.
 * POD nước ngoài (chuyển tải) → điểm đến cuối tại Việt Nam (PRODUCT §7.5).
 */
export function pickDischargePort(pods: readonly string[], finals: readonly string[], catalog?: readonly CatalogEntry[], opts: { air?: boolean; world?: readonly CatalogEntry[] } = {}): DischargePick {
  const vn = (code: string) => code.startsWith("VN");
  const exact = (xs: readonly string[]) => {
    for (const raw of xs) {
      const e = findInCatalog(raw, catalog);
      if (e && vn(e.code)) return { resolved: { code: e.code, name: e.name }, raw, fromCatalog: true as const };
    }
    return null;
  };
  const tableVn = (xs: readonly string[], generic: boolean) => {
    for (const raw of xs) {
      const r = resolvePortDetail(raw, catalog);
      if (r && vn(r.code) && !!r.generic === generic) return { resolved: { code: r.code, name: r.name }, raw };
    }
    return null;
  };
  const viaPod = exact(pods) ?? tableVn(pods, false);
  if (viaPod) return viaPod;
  const viaFinal = exact(finals) ?? tableVn(finals, false);
  const podGeneric = tableVn(pods, true);
  // Hàng air: tên thành phố chính là sân bay (HO CHI MINH → VNSGN) – không có “bến” cụ thể để chọn thêm.
  if (podGeneric && opts.air && !viaFinal) return podGeneric;
  if (podGeneric) return viaFinal && viaFinal.resolved.code !== podGeneric.resolved.code ? viaFinal : { ...podGeneric, note: `“${podGeneric.raw}” chỉ là tên thành phố – tạm khai cảng chung ${podGeneric.resolved.code}, chọn bến dỡ cụ thể nếu khác` };
  const transshipNote = `Cảng dỡ trên vận đơn (${pods[0] ?? "—"}) là cảng chuyển tải nước ngoài – khai điểm đến cuối tại Việt Nam`;
  if (viaFinal) return pods.length ? { ...viaFinal, note: transshipNote } : viaFinal;
  const finalGeneric = tableVn(finals, true);
  if (finalGeneric) return { ...finalGeneric, note: pods.length ? transshipNote : `“${finalGeneric.raw}” chỉ là tên thành phố – chọn bến dỡ cụ thể nếu khác` };
  const p = resolvePort(pods[0] ?? null, opts.world ?? catalog);
  return { resolved: p, raw: pods[0] ?? null, ...(p ? { note: "Cảng dỡ không phải cảng Việt Nam – kiểm tra điểm đến cuối" } : {}) };
}

const PLACE_SUFFIX = /\b(CITY|PORT|AIRPORT|DISTRICT|PROVINCE|TOWN|PREFECTURE)\b/g;

/** Các đoạn tên địa danh trong một chuỗi ("ZHUHAI CITY.GUANGDONG , CHINA" → "ZHUHAI", "GUANGDONG", "CHINA"); đoạn có "CITY" xét trước. */
function placeSegments(raw: string): string[] {
  const parts = [raw, ...raw.split(/[,;/().]+/)];
  const ordered = [...parts.filter((x) => /CITY/i.test(x)), ...parts.filter((x) => !/CITY/i.test(x))];
  return [...new Set(ordered.map((x) => plain(plain(x).replace(PLACE_SUFFIX, " "))).filter((x) => x.length >= 3))];
}

/** Một đoạn trùng nguyên tên mã trong danh mục cảng thế giới (A016); trùng tên ở nhiều nước → chỉ nhận khi biết nước. */
function matchWorldPort(raw: string, catalog: readonly CatalogEntry[], country: string | null): { entry: CatalogEntry; segment: string } | null {
  for (const seg of placeSegments(raw)) {
    const hits = catalog.filter((e) => plain(e.name) === seg);
    const pool = country ? hits.filter((e) => e.parent === country) : hits;
    if (pool.length === 1) return { entry: pool[0]!, segment: seg };
  }
  return null;
}

/** Bí danh hay gặp trước, rồi tên trùng danh mục cảng thế giới A016 (cảng nước ngoài không có bí danh, vd ZHUHAI → CNZUH). Mã/tên luôn theo A016. */
export function resolveWorldPort(raw: string | null, country: string | null, catalog?: readonly CatalogEntry[]): Resolved {
  if (!raw) return null;
  const t = resolvePort(raw, catalog);
  if (t) return t;
  const w = catalog?.length ? matchWorldPort(raw, catalog, country) : null;
  if (w) return { code: w.entry.code, name: w.entry.name };
  const iata = iataOf(raw);
  const hits = iata && catalog?.length ? catalog.filter((e) => e.code.slice(2) === iata && (!country || e.parent === country)) : [];
  return hits.length === 1 ? { code: hits[0]!.code, name: hits[0]!.name } : null;
}

export type LoadingPick = { resolved: Resolved; raw: string | null; note?: string };

/**
 * 1.34 cảng/sân bay xếp hàng từ mọi chứng từ ghi nơi đi (B/L, AWB, Arrival Notice, C/O…): bí danh → tên trùng danh mục A016 (lọc theo nước người xuất khẩu).
 * Không chứng từ nào ghi nơi đi (nhãn chuyển phát nhanh, invoice EXW) → suy từ thành phố trong địa chỉ người xuất khẩu, đánh dấu để người khai kiểm.
 */
export function pickLoadingPort(pols: readonly string[], sellerAddresses: readonly string[], country: string | null, catalog?: readonly CatalogEntry[]): LoadingPick {
  for (const raw of pols) {
    const r = resolveWorldPort(raw, country, catalog);
    if (r) return { resolved: r, raw };
  }
  if (pols.length) return { resolved: null, raw: pols[0]! };
  if (!catalog?.length || !country) return { resolved: null, raw: null };
  for (const addr of sellerAddresses) {
    const w = matchWorldPort(addr, catalog, country);
    if (w) return { resolved: { code: w.entry.code, name: w.entry.name }, raw: addr, note: `Chứng từ không ghi nơi xếp hàng – tạm suy từ thành phố “${w.segment}” trong địa chỉ người xuất khẩu, kiểm lại cảng/sân bay đi` };
  }
  return { resolved: null, raw: null };
}

/** POD nước ngoài (chuyển tải) → điểm đến cuối tại Việt Nam (PRODUCT §7.5). */
export function resolveDischargePort(pod: string | null, finalDestination: string | null, catalog: readonly CatalogEntry[] | undefined): { resolved: Resolved; note?: string } {
  const r = pickDischargePort(pod ? [pod] : [], finalDestination ? [finalDestination] : [], catalog);
  return { resolved: r.resolved, ...(r.note ? { note: r.note } : {}) };
}

/**
 * Mã địa điểm lưu kho (1.29, bảng A202) của chi cục khai báo:
 * 1) mã kho có sẵn trên Arrival Notice và thuộc chi cục; 2) tên kho trùng tên trong danh mục; 3) không xác định được kho cụ thể
 * (AN chỉ ghi tên bãi như “CÁT LÁI KHO 3”, hàng lẻ CFS) → địa điểm tập kết hàng do chính chi cục quản lý (vd 02CIRCI), kèm nghi ngờ để người khai kiểm.
 */
export function resolveWarehouse(code: string | null, name: string | null, warehouses: readonly CatalogEntry[] | undefined): { entry: CatalogEntry; exact: boolean } | null {
  if (!warehouses?.length) return null;
  // AN đã ghi mã kho: giữ mã đó (có thể thuộc danh mục dùng mã chi cục cũ) – không thay bằng địa điểm tập kết.
  if (code) {
    const byCode = warehouses.find((w) => w.code === code.trim().toUpperCase());
    return byCode ? { entry: byCode, exact: true } : null;
  }
  const byName = findInCatalog(name, warehouses);
  if (byName) return { entry: byName, exact: true };
  if (!name) return null;
  const general = warehouses.filter((w) => /^Địa điểm tập kết hàng do (Chi cục|Đội)/.test(w.note ?? ""));
  return general.length === 1 ? { entry: general[0]!, exact: false } : null;
}

export type ResolvedPayment = { code: string; name: string; note?: string; suspect?: true };

/**
 * Phương thức thanh toán trên chứng từ → mã TK_IVP (chỉ tiêu 1.43 / 2.38, Phụ lục II TT39).
 * TTR là "chuyển tiền bồi hoàn bằng điện" (hoàn trả L/C), KHÔNG phải T/T thường: T/T, chuyển khoản → KC ("Khác, bao gồm cả TT")
 * và ghi phương thức thực tế vào chi tiết khai trị giá (1.50) / ghi chú (2.57). Không nhận ra → KC kèm nghi ngờ.
 */
export function resolvePayment(raw: string | null): ResolvedPayment | null {
  if (!raw) return null;
  const n = norm(raw);
  const kcNote = (what: string) => `Mã KC gồm cả ${what} – ghi phương thức thực tế (“${raw.trim()}”) vào chi tiết khai trị giá / ghi chú`;
  if (/\bTTR\b|REIMBURSE/.test(n)) return { code: "TTR", name: "Chuyển tiền bồi hoàn bằng điện" };
  if (/\bL ?C\b|LETTER OF CREDIT/.test(n)) return { code: "LC", name: "Tín dụng thư (L/C)" };
  if (/\bD ?A\b|DOCUMENTS? AGAINST ACCEPTANCE/.test(n)) return { code: "DA", name: "Nhờ thu chấp nhận chứng từ (D/A)" };
  if (/\bD ?P\b|DOCUMENTS? AGAINST PAYMENT/.test(n)) return { code: "DP", name: "Nhờ thu kèm chứng từ (D/P)" };
  if (/\bCAD\b|CASH AGAINST DOCUMENTS?/.test(n)) return { code: "CAD", name: "Trả tiền lấy chứng từ (CAD)" };
  if (/\bOA\b|OPEN ACCOUNT/.test(n)) return { code: "OA", name: "Mở tài khoản thanh toán (O/A)" };
  if (/\bCHEQUE\b|\bCHECK\b|\bSEC\b/.test(n)) return { code: "CHEQUE", name: "Séc" };
  if (/\bCASH\b|TIEN MAT/.test(n)) return { code: "CASH", name: "Tiền mặt" };
  if (/FREE OF CHARGE|\bFOC\b|NO COMMERCIAL VALUE|KHONG THANH TOAN|NO PAYMENT/.test(n)) return { code: "KHONGTT", name: "Không thanh toán" };
  if (/NETTING|OFFSET|CAN TRU|BU TRU/.test(n)) return { code: "CANTRU", name: "Cấn trừ, bù trừ" };
  if (/\bT ?T\b|TELEGRAPHIC|\bWIRE\b|BANK TRANSFER|REMITTANCE|CHUYEN KHOAN/.test(n)) return { code: "KC", name: "Khác (bao gồm cả TT)", note: kcNote("T/T, chuyển khoản") };
  return { code: "KC", name: "Khác", suspect: true, note: `Không nhận ra phương thức thanh toán “${raw.trim()}” – chọn mã TK_IVP; nếu khai KC thì ghi phương thức thực tế vào chi tiết khai trị giá / ghi chú` };
}

/**
 * Đơn vị kiện → mã loại kiện ô 2 chỉ tiêu 1.27 / 2.25 (danh mục PACKAGE_KIND của VNACCS, cùng mã với PACKAGE_UNITS của @kb/contracts: cuộn RO).
 * Danh mục VNACCS không có mã pallet (PX của UN/ECE Rec 21 bị từ chối; PL là “PAIL” – thùng xô) → pallet khai PK.
 * Không nhận ra → PK kèm `guessed` để người khai chọn lại (Phụ lục II chỉ nêu ví dụ CS, BX).
 */
export function resolvePackageUnit(raw: string | null): (NonNullable<Resolved> & { guessed?: true; note?: string }) | null {
  if (!raw) return null;
  const n = norm(raw);
  if (/^(PL|PX|PLT|PLTS|PALLET|PALLETS)$/.test(n)) return { code: "PK", name: "Package", note: "Pallet: danh mục mã loại kiện VNACCS không có mã pallet riêng – khai PK" };
  const map: [RegExp, string, string][] = [
    [/^(CT|CTN|CTNS|CARTON|CARTONS)$/, "CT", "Carton"], [/^(PK|PKG|PKGS|PACKAGE|PACKAGES)$/, "PK", "Package"],
    [/^(BX|BOX|BOXES)$/, "BX", "Box"], [/^(BG|BAG|BAGS)$/, "BG", "Bag"], [/^(CS|CASE|CASES)$/, "CS", "Case"], [/^(DR|DRUM|DRUMS)$/, "DR", "Drum"], [/^(RO|RL|ROLL|ROLLS)$/, "RO", "Roll"],
    [/^(CR|CRATE|CRATES)$/, "CR", "Crate"], [/^(BE|BDL|BUNDLE|BUNDLES)$/, "BE", "Bundle"], [/^(BL|BALE|BALES)$/, "BL", "Bale"], [/^(SA|SACK|SACKS)$/, "SA", "Sack"],
  ];
  const hit = map.find(([re]) => re.test(n));
  return hit ? { code: hit[1], name: hit[2] } : { code: "PK", name: "Package", guessed: true };
}

/**
 * Mã phương thức vận chuyển VNACCS (chỉ tiêu 1.6/2.6, bảng TRANSPORT_MODES): lấy đúng lựa chọn trên hồ sơ.
 * Đường biển mà vận đơn không khớp (có/không container) → giữ mã người chọn, kèm ghi chú để người duyệt xem lại.
 */
export function transportModeCode(mode: TransportMode, hasContainers: boolean): { code: string; name: string; note?: string } {
  const { code, label } = TRANSPORT_MODE_INFO[mode];
  if (mode === "SEA_CONTAINER" && !hasContainers) return { code, name: label, note: "Vận đơn không có số container – kiểm tra lại mã 2 hay 3 (hàng không chứa trong container)" };
  if (mode === "SEA_BULK" && hasContainers) return { code, name: label, note: "Vận đơn có số container – kiểm tra lại mã 3 hay 2 (hàng chứa trong container)" };
  return { code, name: label };
}
