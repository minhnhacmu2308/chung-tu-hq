// Tờ khai (chỉ tiêu theo mnemonic `code`) → object FPT.VNACCS (objVN_IDA/HANG/VANDON/KTG, objVN_EDA/HANG/CON).
// Cắt độ dài theo đặc tả (ghi cảnh báo), ngày → dd/MM/yyyy, số → number. Thuần; kiểm tra bằng Zod của @kb/contracts/fpt.
import { EdaRequestSchema, fptKey, IdaRequestSchema, type EdaRequest, type IdaRequest, VN_EDA_FIELDS, VN_EDA_HANG_FIELDS, VN_IDA_FIELDS, VN_IDA_HANG_FIELDS, VN_IDA_KTG_FIELDS, VN_IDA_VANDON_FIELDS } from "@kb/contracts";

/** Dữ liệu tờ khai đủ để dựng payload – không phụ thuộc kiểu của module declaration. */
export type DeclarationPayload = {
  kind: "IDA" | "EDA";
  direction: "NK" | "XK";
  fields: Record<string, { value: string }>;
  items: { lineNo: number; description: string; quantity: string; unit: string; unitPrice: string; amount: string; origin: string; hsConfirmed: string | null; importDutyRate: string | null; vatRate: string | null; policyNote: string | null }[];
  adjustments: { label: string; amount: string; currency: string }[];
  containers: string[];
  currency: string;
  note?: string | undefined;
};

export type FptBuild = { request: IdaRequest | EdaRequest; warnings: string[]; issues: string[] };

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
const ddmmyyyy = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
const num = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : 0);
const numPart = (v: string) => num(v.split(" ")[0] ?? "");
const unitPart = (v: string, fallback: string) => v.split(" ")[1] ?? fallback;
const hs8 = (code: string | null) => (code ?? "").replace(/\D/g, "").slice(0, 8);
/** Mã áp dụng thuế suất GTGT (VB9xx) theo thuế suất – CHƯA đối chiếu bảng "Thue khac - GTGT.xls" (D3). */
const vatCode = (rate: string | null) => ({ "10": "VB901", "8": "VB903", "5": "VB905", "0": "VB900" })[String(num(rate ?? "10"))] ?? "VB901";
/** Mã biểu thuế NK (A527) suy từ ghi chú chính sách (chưa lưu riêng – BACKEND-TODO). */
const taxTable = (note: string | null) => (note?.includes("AKFTA") ? "B07" : note?.includes("EVFTA") ? "B17" : note?.includes("ATIGA") ? "B04" : note?.includes("ACFTA") ? "B05" : "B01");

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

/** Chia địa chỉ dài thành 4 ô 35 ký tự (EPA/EP2/EP3/EP4 hoặc CGA/CAT/CAC/CAS). */
function splitAddress(addr: string, names: string[], set: ReturnType<typeof setter>) {
  const chunks: string[] = [];
  let rest = addr.trim();
  while (rest && chunks.length < names.length) {
    if (rest.length <= 35) {
      chunks.push(rest);
      rest = "";
    } else {
      const cut = rest.lastIndexOf(" ", 35);
      const at = cut > 10 ? cut : 35;
      chunks.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
  }
  chunks.forEach((c, i) => set(names[i]!, c));
}

function items(p: DeclarationPayload, warnings: string[]) {
  const sizes = p.kind === "IDA" ? SIZE_IDA : SIZE_EDA;
  return p.items.map((it, i) => {
    const h: Record<string, unknown> = {};
    const set = setter(h, warnings, sizes);
    set("HAG_B25", String(i + 1).padStart(2, "0"));
    set("HAG_CMD", hs8(it.hsConfirmed));
    set("HAG_CMN", it.description);
    set("HAG_QN1", num(it.quantity));
    set("HAG_QT1", it.unit || "PCE");
    set("HAG_QN2", num(it.quantity)); // số lượng (2) theo đơn vị tính của biểu thuế – chưa có bảng quy đổi (D3), dùng số lượng (1)
    set("HAG_QT2", it.unit || "PCE");
    set("HAG_BPR", num(it.amount));
    set("HAG_UPR", num(it.unitPrice));
    set("HAG_UPC", p.currency);
    set("HAG_TSC", it.unit || "PCE");
    if (p.kind === "IDA") {
      set("HAG_OR", it.origin);
      set("HAG_ORS", taxTable(it.policyNote));
      if (it.importDutyRate !== null) set("HAG_TXA", num(it.importDutyRate));
      set("HAG_TX5", vatCode(it.vatRate)); // mã áp dụng thuế suất GTGT (bảng "Thue khac - GTGT") – mã chưa đối chiếu (D3)
    }
    return h;
  });
}

export function buildFptRequest(p: DeclarationPayload): FptBuild {
  const warnings: string[] = [];
  if (p.kind === "IDA") {
    const tk: Record<string, unknown> = {};
    const set = setter(tk, warnings, SIZE_IDA);
    set("TK_ICB", val(p, "MA_LH"));
    set("TK_CH", firstToken(val(p, "CQHQ")));
    set("TK_CHB", "00"); // đội thủ tục mặc định (format.json) – đổi khi có danh mục A038 chi tiết (D3)
    set("TK_IMY", "000000"); // mã bưu chính: org chưa lưu → mặc định, xem warnings
    warnings.push("TK_IMY: mã bưu chính người nhập khẩu chưa có trong tài khoản – gửi 000000");
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
    set("TK_OL1", val(p, "VBPQ"));
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
    setVd("VD_VSN", val(p, "PTVC_TEN"));
    setVd("VD_ARR", ddmmyyyy(val(p, "NGAY_DEN")));
    if (p.containers.length) setVd("VD_COC", p.containers.length);

    const ktg: Record<string, unknown> = {};
    const setKtg = setter(ktg, warnings, SIZE_IDA);
    setKtg("KTG_VD1", firstToken(val(p, "KHAI_TG")) || "6");
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
    const request = { objVN_IDA: tk, objVN_IDA_HANG: items(p, warnings), objVN_IDA_VANDON: vd, objVN_IDA_KTG: ktg };
    const parsed = IdaRequestSchema.safeParse(request);
    return { request: (parsed.success ? parsed.data : request) as IdaRequest, warnings, issues: parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }

  const tk: Record<string, unknown> = {};
  const set = setter(tk, warnings, SIZE_EDA);
  set("TK_ECB", val(p, "MA_LH"));
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
  set("TK_VSN", val(p, "PTVC_TEN"));
  set("TK_SYM", ddmmyyyy(val(p, "NGAY_DI")));
  set("TK_IV1", "A");
  set("TK_IV3", val(p, "SO_HD"));
  set("TK_IVD", ddmmyyyy(val(p, "NGAY_HD")));
  set("TK_IVP", firstToken(val(p, "PT_TT")));
  set("TK_IP1", firstToken(val(p, "GIA_PL")) || "A");
  set("TK_IP2", val(p, "DK_GIA"));
  set("TK_IP3", val(p, "MA_TT") || p.currency);
  set("TK_IP4", num(val(p, "TONG_TG")));
  set("TK_NT2", val(p, "GHI_CHU"));
  set("TK_REF", val(p, "SO_QLNB"));
  const con: Record<string, unknown> = {};
  const setCon = setter(con, warnings, SIZE_EDA);
  p.containers.slice(0, 50).forEach((c, i) => setCon(`CON_C${String(i + 1).padStart(2, "0")}`, c));
  const request = { objVN_EDA: tk, objVN_EDA_CON: p.containers.length ? con : null, objVN_EDA_HANG: items(p, warnings) };
  const parsed = EdaRequestSchema.safeParse(request);
  return { request: (parsed.success ? parsed.data : request) as EdaRequest, warnings, issues: parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
}
