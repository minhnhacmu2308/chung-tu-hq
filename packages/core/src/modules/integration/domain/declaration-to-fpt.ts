// Tờ khai (chỉ tiêu theo mnemonic `code`) → object FPT.VNACCS (objVN_IDA/HANG/VANDON/KTG, objVN_EDA/HANG/CON).
// Cắt độ dài theo đặc tả (ghi cảnh báo), ngày → dd/MM/yyyy, số → number. Thuần; kiểm tra bằng Zod của @kb/contracts/fpt.
import { DECLARATION_CONDITIONS, EdaRequestSchema, extraFieldFpt, fptKey, inapplicableExtraCodes, itemDefaults, itemFieldFpt, itemOverrides, lawCodesByLine, splitAddressLines, taxTable, type FptObjectName, IdaRequestSchema, type EdaRequest, type IdaRequest, VN_EDA_FIELDS, VN_EDA_HANG_FIELDS, VN_IDA_FIELDS, VN_IDA_HANG_FIELDS, VN_IDA_KTG_FIELDS, VN_IDA_VANDON_FIELDS } from "@kb/contracts";

/** Dữ liệu tờ khai đủ để dựng payload – không phụ thuộc kiểu của module declaration. */
export type DeclarationPayload = {
  kind: "IDA" | "EDA";
  direction: "NK" | "XK";
  fields: Record<string, { value: string }>;
  /** `id`: id dòng hàng – khóa ô người khai nhập cho dòng (HANG.<id>.<ô>); không có (dữ liệu cũ) → chỉ giá trị tự điền. */
  items: { id?: string; lineNo: number; description: string; quantity: string; unit: string; unitPrice: string; amount: string; origin: string; hsConfirmed: string | null; importDutyRate: string | null; vatRate: string | null; policyNote: string | null }[];
  adjustments: { label: string; amount: string; currency: string }[];
  containers: string[];
  currency: string;
  note?: string | undefined;
};

/** `issues`: payload sai đặc tả FPT (Zod). `blockers`: lỗi nghiệp vụ chắc chắn làm tờ khai sai – không được truyền. */
export type FptBuild = { request: IdaRequest | EdaRequest; warnings: string[]; issues: string[]; blockers: string[] };

// Cùng tên trường nhưng size khác nhau giữa IDA và EDA (TK_EPN 70 vs 100) → bảng riêng từng mẫu.
const SIZE_IDA = new Map([...VN_IDA_FIELDS, ...VN_IDA_HANG_FIELDS, ...VN_IDA_VANDON_FIELDS, ...VN_IDA_KTG_FIELDS].map((f) => [f.name, f.size]));
const SIZE_EDA = new Map([...VN_EDA_FIELDS, ...VN_EDA_HANG_FIELDS].map((f) => [f.name, f.size]));

const val = (p: DeclarationPayload, code: string) => p.fields[code]?.value?.trim() ?? "";
/** "VNHPH – Cảng Hải Phòng" → { code: "VNHPH", name: "Cảng Hải Phòng" }; "03CE – …" → code 03CE. */
const split = (v: string) => {
  const m = /^([A-Z0-9-]{1,12})\s*[–-]\s*(.+)$/.exec(v);
  return m ? { code: m[1]!, name: m[2]!.trim() } : { code: v, name: v };
};
const firstToken = (v: string) => v.split(/\s*[–-]\s*/)[0]!.trim();
/** Hô hiệu (1.31/2.30 ô 1) chỉ có khi đường biển/sông – đổi phương thức sau khi dựng thì giá trị cũ không gửi. */
const callSign = (p: DeclarationPayload) => (DECLARATION_CONDITIONS.BY_WATER.test({ typeCode: "", transportCode: firstToken(val(p, "PTVC")), incoterm: "", hasInvoice: true }) ? val(p, "HO_HIEU") : "");
const ddmmyyyy = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
const num = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : 0);
const numPart = (v: string) => num(v.split(" ")[0] ?? "");
const unitPart = (v: string, fallback: string) => v.split(" ")[1] ?? fallback;
const hs8 = (code: string | null) => (code ?? "").replace(/\D/g, "").slice(0, 8);
/** Mô tả hàng xuất khẩu phải kết thúc bằng “#&” + mã nước xuất xứ (TT121, chỉ tiêu 2.69). */
const withOrigin = (description: string, origin: string) => (!origin || /#&[A-Z]{2}$/.test(description.trim()) ? description : `${description.trim()}#&${origin}`);

/** Gán giá trị kèm cắt độ dài theo đặc tả; key JSON theo fptKey. */
function setter(target: Record<string, unknown>, warnings: string[], sizes: Map<string, number | undefined>) {
  return (name: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    let v = value;
    const size = sizes.get(name);
    if (typeof v === "string" && size && v.length > size) {
      warnings.push(`${name}: cắt "${v.slice(0, 20)}…" từ ${v.length} xuống ${size} ký tự`);
      v = v.slice(0, size);
    }
    target[fptKey(name)] = v;
  };
}

/** 1.38 / 2.33: "QPGP 06GPTC17032025; MTTB 08TB18062025" → [{ code, no }] (mã phân loại giấy phép + số giấy phép), theo thứ tự khai. */
export function parsePermits(value: string): { code: string; no: string }[] {
  return value.split(";").map((x) => x.trim()).filter(Boolean).map((x) => {
    const [code = "", ...rest] = x.split(/\s+/);
    return { code: code.toUpperCase(), no: rest.join("") };
  });
}

/** 2.80 mã văn bản pháp luật theo dòng – quy tắc ở @kb/contracts (form hiện cùng giá trị). */
export { lawCodesByLine };

/** Tối đa 5 giấy phép (TK_SS1..5 mã phân loại, TK_SN1..5 số). */
function setPermits(value: string, set: ReturnType<typeof setter>, warnings: string[]) {
  const permits = parsePermits(value);
  permits.slice(0, 5).forEach((x, k) => {
    set(`TK_SS${k + 1}`, x.code);
    set(`TK_SN${k + 1}`, x.no);
  });
  if (permits.length > 5) warnings.push(`Giấy phép: chỉ gửi 5 giấy phép đầu (${permits.slice(5).map((x) => x.code).join(", ")} bị bỏ)`);
}

/** Chia địa chỉ thành 4 ô 35 ký tự (EPA/EP2/EP3/EP4 hoặc CGA/CAT/CAC/CAS) – cùng quy tắc form (giữ dòng người khai chia sẵn). */
function splitAddress(addr: string, names: string[], set: ReturnType<typeof setter>) {
  splitAddressLines(addr, names.length).forEach((c, i) => c && set(names[i]!, c));
}

/**
 * Ô bổ sung người khai nhập trên form đầy đủ (mã chỉ tiêu = tên trường VNACCS: TK_CCC, TK_ICC, VD_BL2, KTG_IN4…) → đúng object FPT, đổi kiểu theo đặc tả.
 * Gọi sau các ô suy từ chỉ tiêu app nên ghi đè giá trị mặc định (TK_CHB, TK_IMY). Ô APP_* chỉ lưu trong app, không gửi.
 * Ô theo tình huống không áp dụng với giá trị tờ khai (1.40 / 2.35 khi 1.39 / 2.34 khác D) → không gửi, kể cả khi người khai đã nhập trước đó.
 */
function applyExtras(p: DeclarationPayload, targets: Partial<Record<FptObjectName, ReturnType<typeof setter>>>) {
  const skip = new Set(inapplicableExtraCodes(p.kind, Object.entries(p.fields).map(([code, f]) => ({ code, value: f.value ?? "" }))));
  for (const [code, f] of Object.entries(p.fields)) {
    const spec = extraFieldFpt(p.kind, code);
    const v = f.value?.trim() ?? "";
    const set = spec ? targets[spec.object] : undefined;
    if (!spec || !v || !set || skip.has(code)) continue;
    set(code, spec.field.type === "date" ? ddmmyyyy(v) : spec.field.type === "decimal" || spec.field.type === "long" ? num(v) : v);
  }
}

function items(p: DeclarationPayload, warnings: string[], blockers: string[]) {
  const sizes = p.kind === "IDA" ? SIZE_IDA : SIZE_EDA;
  const lineNos = p.items.map((it) => it.lineNo);
  return p.items.map((it, i) => {
    const h: Record<string, unknown> = {};
    const set = setter(h, warnings, sizes);
    // Ô người khai nhập / sửa đè trên form đầy đủ (theo id dòng) thắng giá trị tự điền.
    const own = it.id ? itemOverrides(Object.entries(p.fields).map(([code, f]) => ({ code, value: f.value })), it.id) : {};
    const auto = itemDefaults(p.kind, it, { currency: p.currency, vbpq: val(p, "VBPQ"), lineNos });
    set(p.kind === "IDA" ? "HAG_B25" : "HAG_R01", String(i + 1).padStart(2, "0"));
    set("HAG_CMD", hs8(it.hsConfirmed));
    if (p.kind === "EDA" && !it.origin) blockers.push(`Dòng ${it.lineNo}: chưa có mã nước xuất xứ – mô tả hàng xuất khẩu phải ghi “mô tả#&mã nước” (chỉ tiêu 2.69)`);
    set("HAG_CMN", p.kind === "EDA" ? withOrigin(it.description, it.origin) : it.description);
    set("HAG_QN1", num(it.quantity));
    set("HAG_QT1", it.unit || "PCE");
    set("HAG_BPR", num(it.amount));
    set("HAG_UPR", num(it.unitPrice));
    if (p.kind === "IDA") {
      set("HAG_OR", it.origin);
      if (it.importDutyRate !== null) set("HAG_TXA", num(it.importDutyRate));
      const table = taxTable(it.policyNote);
      if (!own["HAG_ORS"] && !table.code) blockers.push(`Dòng ${it.lineNo}: chưa có mã Biểu thuế nhập khẩu cho ${table.fta} – nhập chỉ tiêu 1.80 trên tờ khai (tra Bảng mã Biểu thuế trên website Cục Hải quan)`);
    }
    const codes = p.kind === "EDA" ? lawCodesByLine(val(p, "VBPQ"), lineNos).get(it.lineNo) ?? [] : [];
    if (codes.length > 5 && !own["HAG_OL1"]) warnings.push(`Dòng ${it.lineNo}: chỉ gửi 5 mã văn bản pháp luật đầu (${codes.slice(5).join(", ")} bị bỏ)`);
    for (const [key, v] of Object.entries({ ...auto, ...own })) {
      const spec = itemFieldFpt(p.kind, key);
      if (!spec || !v) continue;
      set(key, spec.type === "date" ? ddmmyyyy(v) : spec.type === "decimal" || spec.type === "long" ? num(v) : v);
    }
    return h;
  });
}

export function buildFptRequest(p: DeclarationPayload): FptBuild {
  const warnings: string[] = [];
  const blockers: string[] = [];
  if (p.kind === "IDA") {
    const tk: Record<string, unknown> = {};
    const set = setter(tk, warnings, SIZE_IDA);
    set("TK_ICB", val(p, "MA_LH"));
    // Chỉ tiêu theo tình huống: chỉ có trên tờ khai khi loại hình phù hợp (mapping `when`).
    if (val(p, "TNTX_TK")) set("TK_TDN", num(val(p, "TNTX_TK").replace(/\D/g, ""))); // 1.3
    set("TK_RED", ddmmyyyy(val(p, "HAN_TX"))); // 1.10
    set("TK_CH", firstToken(val(p, "CQHQ")));
    set("TK_CHB", "00"); // đội thủ tục mặc định (format.json) – đổi khi có danh mục A038 chi tiết (D3); người khai nhập 1.9 thì ghi đè (applyExtras)
    if (!val(p, "TK_IMY")) {
      set("TK_IMY", "000000"); // mã bưu chính: người khai chưa nhập 1.14, org chưa lưu → mặc định
      warnings.push("TK_IMY: mã bưu chính người nhập khẩu chưa có trong tài khoản – gửi 000000");
    }
    set("TK_TPM", firstToken(val(p, "NGUOI_NT")) || "1");
    set("TK_MTC", firstToken(val(p, "PTVC")));
    set("TK_SKB", firstToken(val(p, "PL_CN")) || "4");
    set("TK_ICD", ddmmyyyy(val(p, "NGAY_DK")));
    set("TK_IMC", val(p, "NNK_MST"));
    set("TK_IMN", val(p, "NNK_TEN"));
    set("TK_IMA", val(p, "NNK_DC"));
    set("TK_IMT", val(p, "NNK_DT"));
    set("TK_EPN", val(p, "NXK_TEN"));
    splitAddress(val(p, "NXK_DC"), ["TK_EPA", "TK_EP2", "TK_EP3", "TK_EP4"], set);
    set("TK_EPO", val(p, "MA_NUOC"));
    // 1.37: tối đa 5 mã, không trùng (TK_OL1..5); hàng chương 84/85 thì ô 1 là MO/CU (CV 2061/TCHQ-GSQL).
    const laws = [...new Set(val(p, "VBPQ").split(/[;,\s]+/).filter(Boolean))];
    laws.slice(0, 5).forEach((c, k) => set(`TK_OL${k + 1}`, c));
    if (laws.length > 5) warnings.push(`Mã văn bản pháp quy: chỉ gửi 5 mã đầu (${laws.slice(5).join(", ")} bị bỏ)`);
    if (p.items.some((it) => /^(84|85)/.test(hs8(it.hsConfirmed))) && !/^(MO|CU)$/.test(laws[0] ?? "")) blockers.push("Hàng chương 84/85: ô 1 Mã văn bản pháp quy khác (1.37) phải là MO hoặc CU – CV 2061/TCHQ-GSQL");
    setPermits(val(p, "GP"), set, warnings); // 1.38
    set("TK_IV1", firstToken(val(p, "HD_PL")) || "A");
    set("TK_IV3", val(p, "SO_HD"));
    set("TK_IVD", ddmmyyyy(val(p, "NGAY_HD")));
    set("TK_IVP", firstToken(val(p, "PT_TT")));
    set("TK_IP1", firstToken(val(p, "GIA_PL")) || "A");
    set("TK_IP2", val(p, "DK_GIA"));
    set("TK_IP3", val(p, "MA_TT") || p.currency);
    set("TK_IP4", num(val(p, "TONG_TG")));
    set("TK_NT2", val(p, "GHI_CHU"));
    set("TK_REF", val(p, "SO_QLNB"));

    const vd: Record<string, unknown> = {};
    const setVd = setter(vd, warnings, SIZE_IDA);
    setVd("VD_BL1", val(p, "SO_VD"));
    setVd("VD_NO", Math.round(numPart(val(p, "SO_KIEN"))));
    setVd("VD_NOT", unitPart(val(p, "SO_KIEN"), "PK"));
    setVd("VD_GW", num(val(p, "TRONG_LUONG")));
    setVd("VD_GWT", "KGM");
    setVd("VD_ST", firstToken(val(p, "KHO")));
    const pod = split(val(p, "CANG_DO"));
    setVd("VD_DST", pod.code);
    setVd("VD_DSN", pod.name);
    const pol = split(val(p, "CANG_XEP"));
    setVd("VD_PSC", pol.code);
    setVd("VD_PSN", pol.name);
    setVd("VD_VSC", callSign(p)); // 1.31 ô 1
    setVd("VD_VSN", val(p, "PTVC_TEN"));
    setVd("VD_ARR", ddmmyyyy(val(p, "NGAY_DEN")));
    // 1.35: không nhập số lượng container khi đường hàng không (1) hoặc hàng đóng chung container vào kho CFS khai mã 3 (TT39 PL II).
    const mode = firstToken(val(p, "PTVC"));
    // Người khai sửa 1.35 trên tờ khai → dùng số đã sửa.
    const contCount = val(p, "SL_CONT") ? Math.round(num(val(p, "SL_CONT"))) : p.containers.length;
    if (contCount && mode !== "1" && mode !== "3") setVd("VD_COC", contCount);

    const ktg: Record<string, unknown> = {};
    const setKtg = setter(ktg, warnings, SIZE_IDA);
    setKtg("KTG_VD1", firstToken(val(p, "KHAI_TG")) || "6");
    setKtg("KTG_VLD", val(p, "CT_TG")); // 1.50 chi tiết khai trị giá
    const freight = p.adjustments.find((a) => a.label.startsWith("Cước"));
    if (freight) {
      setKtg("KTG_FR1", "A");
      setKtg("KTG_FR2", freight.currency);
      setKtg("KTG_FR3", num(freight.amount));
    }
    const ins = p.adjustments.find((a) => a.label.startsWith("Phí bảo hiểm"));
    if (ins) {
      setKtg("KTG_IN1", "A");
      setKtg("KTG_IN2", ins.currency);
      setKtg("KTG_IN3", num(ins.amount));
    }
    // Khoản điều chỉnh khác (1.49, KTG_VR/VI/VC/VP) chưa ánh xạ được mã khoản → không gửi thì Hải quan tính thiếu trị giá: chặn truyền.
    const others = p.adjustments.filter((a) => !a.label.startsWith("Cước") && !a.label.startsWith("Phí bảo hiểm"));
    if (others.length) blockers.push(`Khoản điều chỉnh cộng vào trị giá chưa được khai ở chỉ tiêu 1.49: ${others.map((a) => `${a.label} ${a.amount} ${a.currency}`).join("; ")} – khai trên phần mềm khai báo`);
    applyExtras(p, { objVN_IDA: set, objVN_IDA_VANDON: setVd, objVN_IDA_KTG: setKtg });
    const request = { objVN_IDA: tk, objVN_IDA_HANG: items(p, warnings, blockers), objVN_IDA_VANDON: vd, objVN_IDA_KTG: ktg };
    const parsed = IdaRequestSchema.safeParse(request);
    return { request: (parsed.success ? parsed.data : request) as IdaRequest, warnings, issues: parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`), blockers };
  }

  const tk: Record<string, unknown> = {};
  const set = setter(tk, warnings, SIZE_EDA);
  set("TK_ECB", val(p, "MA_LH"));
  if (val(p, "TNTX_TK")) set("TK_TDN", num(val(p, "TNTX_TK").replace(/\D/g, ""))); // 2.3
  set("TK_RID", ddmmyyyy(val(p, "HAN_TN"))); // 2.7
  set("TK_CH", firstToken(val(p, "CQHQ")));
  set("TK_CHB", "00"); // bắt buộc (sheet VN_EDA); đội thủ tục mặc định như IDA – đổi khi có danh mục A038 chi tiết (D3)
  set("TK_MTC", firstToken(val(p, "PTVC")));
  set("TK_ECD", ddmmyyyy(val(p, "NGAY_DK")));
  set("TK_EPC", val(p, "NXK_MST"));
  set("TK_EPN", val(p, "NXK_TEN"));
  set("TK_EPA", val(p, "NXK_DC"));
  set("TK_EPT", val(p, "NXK_DT"));
  set("TK_CGN", val(p, "NNK_TEN"));
  splitAddress(val(p, "NNK_DC"), ["TK_CGA", "TK_CAT", "TK_CAC", "TK_CAS"], set);
  set("TK_CGK", val(p, "MA_NUOC"));
  set("TK_EKN", val(p, "SO_VD"));
  set("TK_NO", Math.round(numPart(val(p, "SO_KIEN"))));
  set("TK_NOT", unitPart(val(p, "SO_KIEN"), "PK"));
  set("TK_GW", num(val(p, "TRONG_LUONG")));
  set("TK_GWT", "KGM");
  set("TK_ST", firstToken(val(p, "KHO")));
  const dst = split(val(p, "CANG_DO"));
  set("TK_DSC", dst.code);
  set("TK_DSN", dst.name);
  const psc = split(val(p, "CANG_XEP"));
  set("TK_PSC", psc.code);
  set("TK_PSN", psc.name);
  set("TK_VSC", callSign(p)); // 2.30 ô 1
  set("TK_VSN", val(p, "PTVC_TEN"));
  set("TK_SYM", ddmmyyyy(val(p, "NGAY_DI")));
  set("TK_IV1", firstToken(val(p, "HD_PL")) || "A");
  set("TK_IV3", val(p, "SO_HD"));
  set("TK_IVD", ddmmyyyy(val(p, "NGAY_HD")));
  set("TK_IVP", firstToken(val(p, "PT_TT")));
  set("TK_IP1", firstToken(val(p, "GIA_PL")) || "A");
  set("TK_IP2", val(p, "DK_GIA"));
  set("TK_IP3", val(p, "MA_TT") || p.currency);
  set("TK_IP4", num(val(p, "TONG_TG")));
  // 2.40 trị giá tính thuế dạng "19660 USD" → TK_FKK + TK_FCD; điều kiện FOB/DAP/DAF không khai (ô trống).
  const fkk = val(p, "TG_TT");
  if (fkk) {
    set("TK_FKK", numPart(fkk));
    set("TK_FCD", unitPart(fkk, p.currency));
  }
  set("TK_TPM", firstToken(val(p, "NGUOI_NT"))); // 2.43
  setPermits(val(p, "GP"), set, warnings); // 2.33
  set("TK_NT2", val(p, "GHI_CHU"));
  set("TK_REF", val(p, "SO_QLNB"));
  const con: Record<string, unknown> = {};
  const setCon = setter(con, warnings, SIZE_EDA);
  // 2.60: danh sách người khai thấy/sửa trên tờ khai (SO_CONT) ưu tiên; chưa có ô này (dữ liệu cũ) → container của vận đơn.
  const containers = val(p, "SO_CONT") ? val(p, "SO_CONT").split(/[\s,;]+/).filter(Boolean) : p.containers;
  containers.slice(0, 50).forEach((c, i) => setCon(`CON_C${String(i + 1).padStart(2, "0")}`, c));
  if (containers.length > 50) warnings.push(`Có ${containers.length} container – chỉ tiêu 2.60 nhận 50, khai phần còn lại qua HYS`);
  applyExtras(p, { objVN_EDA: set, objVN_EDA_CON: setCon });
  const request = { objVN_EDA: tk, objVN_EDA_CON: Object.keys(con).length ? con : null, objVN_EDA_HANG: items(p, warnings, blockers) };
  const parsed = EdaRequestSchema.safeParse(request);
  return { request: (parsed.success ? parsed.data : request) as EdaRequest, warnings, issues: parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`), blockers };
}
