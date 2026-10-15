// Tên trên chứng từ → mã VNACCS (cảng/sân bay, phương thức thanh toán, đơn vị kiện, phương thức vận chuyển). Thuần.
// Thiếu mã → trả null; use case đánh dấu suspect "Không tìm thấy mã cho …" để người khai chọn (BACKEND-TODO D3).
import { TRANSPORT_MODE_INFO, type TransportMode } from "@kb/contracts";

export type Resolved = { code: string; name: string } | null;

/** Cảng/sân bay hay gặp (mã UN/LOCODE dùng trong VNACCS). Thiếu → D3. */
export const PORTS: { code: string; name: string; aliases: string[]; country: string }[] = [
  { code: "VNTVU", name: "Cảng Tân Vũ (Hải Phòng)", aliases: ["TAN VU"], country: "VN" },
  { code: "VNDVU", name: "Cảng Đình Vũ (Hải Phòng)", aliases: ["DINH VU"], country: "VN" },
  { code: "VNLCH", name: "Cảng Lạch Huyện (Hải Phòng)", aliases: ["LACH HUYEN", "HICT"], country: "VN" },
  { code: "VNHPH", name: "Cảng Hải Phòng", aliases: ["HAIPHONG", "HAI PHONG", "HPH"], country: "VN" },
  { code: "VNCLI", name: "Cảng Cát Lái (TP.HCM)", aliases: ["CAT LAI", "CATLAI"], country: "VN" },
  { code: "VNCMT", name: "Cảng Cái Mép (Bà Rịa – Vũng Tàu)", aliases: ["CAI MEP", "CAIMEP"], country: "VN" },
  { code: "VNSGN", name: "Cảng Sài Gòn (TP.HCM)", aliases: ["HO CHI MINH", "HOCHIMINH", "SAIGON", "SAI GON", "HCM", "HCMC"], country: "VN" },
  { code: "VNDAD", name: "Cảng Đà Nẵng", aliases: ["DA NANG", "DANANG"], country: "VN" },
  { code: "VNHAN", name: "Sân bay Nội Bài (Hà Nội)", aliases: ["NOI BAI", "NOIBAI", "HANOI", "HAN"], country: "VN" },
  // Tân Sơn Nhất: mã địa điểm VNACCS chưa đối chiếu được (mã cũ "VNSGN-A" không phải UN/LOCODE, ô VD_DST/TK_PSC chỉ 6 ký tự) → không tra, người khai chọn mã.
  { code: "KRPUS", name: "Busan", aliases: ["BUSAN", "PUSAN"], country: "KR" },
  { code: "KRINC", name: "Incheon", aliases: ["INCHEON", "ICN"], country: "KR" },
  { code: "CNSHA", name: "Shanghai", aliases: ["SHANGHAI"], country: "CN" },
  { code: "CNYTN", name: "Yantian", aliases: ["YANTIAN"], country: "CN" },
  { code: "CNSZX", name: "Shenzhen", aliases: ["SHENZHEN", "SHEKOU"], country: "CN" },
  { code: "CNNGB", name: "Ningbo", aliases: ["NINGBO"], country: "CN" },
  { code: "CNTAO", name: "Qingdao", aliases: ["QINGDAO"], country: "CN" },
  { code: "CNXMN", name: "Xiamen", aliases: ["XIAMEN"], country: "CN" },
  { code: "HKHKG", name: "Hong Kong", aliases: ["HONG KONG", "HONGKONG"], country: "HK" },
  { code: "TWKHH", name: "Kaohsiung", aliases: ["KAOHSIUNG"], country: "TW" },
  { code: "TWKEL", name: "Keelung", aliases: ["KEELUNG"], country: "TW" },
  { code: "JPTYO", name: "Tokyo", aliases: ["TOKYO"], country: "JP" },
  { code: "JPYOK", name: "Yokohama", aliases: ["YOKOHAMA"], country: "JP" },
  { code: "JPUKB", name: "Kobe", aliases: ["KOBE"], country: "JP" },
  { code: "JPOSA", name: "Osaka", aliases: ["OSAKA"], country: "JP" },
  { code: "SGSIN", name: "Singapore", aliases: ["SINGAPORE"], country: "SG" },
  { code: "THBKK", name: "Bangkok", aliases: ["BANGKOK"], country: "TH" },
  { code: "THLCH", name: "Laem Chabang", aliases: ["LAEM CHABANG"], country: "TH" },
  { code: "MYPKG", name: "Port Klang", aliases: ["PORT KLANG", "KLANG"], country: "MY" },
  { code: "ITGOA", name: "Genova", aliases: ["GENOVA", "GENOA"], country: "IT" },
  { code: "DEHAM", name: "Hamburg", aliases: ["HAMBURG"], country: "DE" },
  { code: "NLRTM", name: "Rotterdam", aliases: ["ROTTERDAM"], country: "NL" },
  { code: "BEANR", name: "Antwerp", aliases: ["ANTWERP", "ANTWERPEN"], country: "BE" },
  { code: "USLAX", name: "Los Angeles", aliases: ["LOS ANGELES"], country: "US" },
  { code: "USNYC", name: "New York", aliases: ["NEW YORK"], country: "US" },
  { code: "SEGOT", name: "Gothenburg", aliases: ["GOTHENBURG", "GOTEBORG"], country: "SE" },
];

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** "BUSAN, KOREA" → KRPUS; "HAIPHONG, VIETNAM" → VNHPH. Mã LOCODE 5 ký tự có sẵn trong chuỗi được ưu tiên. */
export function resolvePort(name: string | null): Resolved {
  if (!name) return null;
  const n = norm(name);
  const direct = PORTS.find((p) => n.split(" ").includes(p.code));
  if (direct) return { code: direct.code, name: direct.name };
  // Thứ tự trong PORTS là thứ tự ưu tiên: bến cụ thể (Tân Vũ, Đình Vũ, Cát Lái…) đứng trước cảng/thành phố chung.
  // So theo nguyên từ: alias ngắn như "HAN" (Nội Bài) không được khớp vào giữa "SHANGHAI" hay "CHANGI".
  const padded = ` ${n} `;
  const hit = PORTS.find((p) => p.aliases.some((a) => padded.includes(` ${a} `)));
  return hit ? { code: hit.code, name: hit.name } : null;
}

/** POD nước ngoài (chuyển tải) → điểm đến cuối tại Việt Nam (PRODUCT §7.5). */
export function resolveDischargePort(pod: string | null, finalDestination: string | null): { resolved: Resolved; note?: string } {
  const p = resolvePort(pod);
  const vnPort = (r: Resolved) => r && PORTS.find((x) => x.code === r.code)?.country === "VN";
  if (p && vnPort(p)) return { resolved: p };
  const f = resolvePort(finalDestination);
  if (f && vnPort(f)) return { resolved: f, note: `Cảng dỡ trên vận đơn (${pod ?? "—"}) là cảng chuyển tải nước ngoài – khai điểm đến cuối tại Việt Nam` };
  return { resolved: p, ...(p ? { note: "Cảng dỡ không phải cảng Việt Nam – kiểm tra điểm đến cuối" } : {}) };
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
 * Đơn vị kiện → mã loại kiện ô 2 chỉ tiêu 1.27 / 2.25 (UN/ECE Rec 21, cùng mã với PACKAGE_UNITS của @kb/contracts: pallet PX, cuộn RO).
 * Không nhận ra → PK kèm `guessed` để người khai chọn lại (Phụ lục II chỉ nêu ví dụ CS, BX).
 */
export function resolvePackageUnit(raw: string | null): (NonNullable<Resolved> & { guessed?: true }) | null {
  if (!raw) return null;
  const n = norm(raw);
  const map: [RegExp, string, string][] = [
    [/^(PL|PX|PLT|PLTS|PALLET|PALLETS)$/, "PX", "Pallet"], [/^(CT|CTN|CTNS|CARTON|CARTONS)$/, "CT", "Carton"], [/^(PK|PKG|PKGS|PACKAGE|PACKAGES)$/, "PK", "Package"],
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
