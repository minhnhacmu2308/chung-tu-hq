// API "gửi → nhận REF_ID → hỏi kết quả" của FPT (Postman API-VNACCS NEW 21/04/2026 + Excel đặc tả):
// chứng từ bổ sung V5 (V5Bill…V5OtherDoc → V5Response), định danh (V5IdentifierReq/Res), tách vận đơn (TachVanDonReq/Res),
// danh sách container (ContainerReq/Res, V5ContainerReq/Res), KVGS (một lời gọi đồng bộ – đặc tả API-KVGS), in (Print*), ký file (KyFile), danh mục (SyncCategory).
// GIẢ ĐỊNH: hình dạng phản hồi (chưa có mẫu thật) – lấy theo cột Response của Excel, key camelCase .NET như request trong Postman.
// Trạng thái tiếp nhận (Excel): 0 nhập mới · 10 từ chối · 11 chưa có phản hồi · 12 Hải quan chấp nhận · 15 đã duyệt (có mã định danh).
import { randomUUID } from "node:crypto";
import { loadCodeList } from "@kb/contracts";
import { mockError, type FptError } from "./envelope.js";
import { vnDate } from "./vn-time.js";

type Rec = Record<string, unknown>;
/** Lấy giá trị không phân biệt hoa thường tên key (Postman: V5Bill viết HOA `TK_SOTK`, nơi khác `tK_SOTK`). */
export const pick = (b: Rec, name: string): unknown => {
  const k = Object.keys(b).find((x) => x.toLowerCase() === name.toLowerCase());
  return k === undefined ? undefined : b[k];
};
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

export const V5_DOCS = {
  V5Bill: { loai: "VD", file: "VD_FILE", name: "VD_NAME", no: "VD_SO", label: "vận đơn" },
  V5Invoice: { loai: "HDN", file: "HDN_FILE", name: "HDN_NAME", no: "HDN_SO", label: "hóa đơn" },
  V5Permit: { loai: "GP", file: "GP_FILE", name: "GP_NAME", no: "GP_SO", label: "giấy phép" },
  V5Contract: { loai: "HD", file: "HD_FILE", name: "HD_NAME", no: "HD_SO", label: "hợp đồng" },
  V5Co: { loai: "CO", file: "CO_FILE", name: "CO_NAME", no: "CO_SO", label: "C/O" },
  V5Container: { loai: "CON", file: "CON_FILE", name: "CON_NAME", no: "CON_SO", label: "container" },
  V5OtherDoc: { loai: "CTK", file: "CTK_FILE", name: "CTK_NAME", no: "CTK_SO", label: "chứng từ khác" },
} as const;
export type V5Doc = keyof typeof V5_DOCS;

type RefKind = "V5" | "IDENTIFIER" | "TACHVANDON" | "CONTAINER" | "V5CONTAINER";

/** Ảnh mã vạch container mô phỏng: QR "MSCU1234566" (PNG 84×84, bwip-js) Base64 thuần – như `barcodeImage` của API KVGS. */
export const KVGS_QR_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAFQAAABUCAYAAAAcaxDBAAAAHnRFWHRTb2Z0d2FyZQBid2lwLWpzLm1ldGFmbG9vci5jb21Tnbi0AAABi0lEQVR4nO3VSw7CMBAE0dz/0rBnEWvUNWOTVEvZ4DCfZwmu67o+w89v6O+n9eP9BBVU0FeD0qnWT4HT/tUICkdQOILCKYOmC9IL0aD4foIKKqignQ2LAGl9QQUVVNDO/XaD0heS1hd0EUGL56sIWjxf5TjQNOlC9Pvt+wkK7ycovJ+g8H6rAemnujB93r6foIIK+irQ03L8gP8WQeEICudxoKf9iNN/At31yg0Fva9Xbijofb1yQ0Hv640PtPuC0nlW38cHoBcQFF5AUHiBx4NWC04DpPOm+8URVFBByXrtoGmDbqDufvg8gsLzCArPIyg8T3Xg9P3qedq/mnh/QbN5BS3WL/cXNJuX7h+HvpDdz/YICkdQOI8D3X2D0+/T59tvWFBBBT0KlM70Qt0XvjwXVNBSP0GL56v3jwOdHogGGY+gcASFIyic00HT+en98YKCwgUFhQsKChfsBqXnna4nqKBn1xN0GjTNNHg6TzyfoPD8gsLzCwrP//tB99MNUj3H5xVUUEFfA/oFjUASs1R8sn4AAAAASUVORK5CYII=";
type RefRecord = { kind: RefKind; refId: string; userId: string; createdAt: Date; polls: number; reject: boolean; loaiCt?: string; head: Rec; receiptNo?: string; identifierNo?: string };

export function createRefApis(opts: { now: () => Date; log: (l: string) => void; pollsToAccept: number }) {
  const refs = new Map<string, RefRecord>();
  let seq = 0;
  const now = opts.now;

  const required = (b: Rec, names: string[], label = ""): FptError[] =>
    names.filter((n) => !s(pick(b, n))).map((n) => mockError("MOCK-REQ", n, n, `${label}Chưa nhập ${n}.`));
  /** Từ chối khi ghi chú/tên doanh nghiệp chứa "REJECT" – để thử nhánh lỗi. */
  const wantsReject = (b: Rec) => JSON.stringify(b).toUpperCase().includes("REJECT");

  const create = (kind: RefKind, b: Rec, extra: Partial<RefRecord> = {}) => {
    const r: RefRecord = { kind, refId: randomUUID().toUpperCase(), userId: s(pick(b, "USER_ID")), createdAt: now(), polls: 0, reject: wantsReject(b), head: b, ...extra };
    refs.set(r.refId, r);
    opts.log(`${kind} → REF_ID ${r.refId}`);
    return r;
  };

  /** Hỏi kết quả: lần đầu "11 chưa có phản hồi"; đủ số lần → 12 chấp nhận (có số tiếp nhận) hoặc 10 từ chối. */
  const status = (r: RefRecord) => {
    r.polls++;
    if (r.polls < opts.pollsToAccept) return { trangThai: "11", ketQua: "Chưa có phản hồi từ Hải quan" };
    if (r.reject) return { trangThai: "10", ketQua: "Hải quan từ chối (kịch bản mock: dữ liệu chứa REJECT)" };
    r.receiptNo ??= `${vnDate(now()).slice(-4)}${String(++seq).padStart(8, "0")}`;
    return { trangThai: r.kind === "IDENTIFIER" ? "15" : "12", ketQua: "Hải quan chấp nhận" };
  };
  const receipt = (r: RefRecord, st: { trangThai: string; ketQua: string }) => ({
    sO_TN: st.trangThai === "12" || st.trangThai === "15" ? r.receiptNo : null,
    ngaY_TN: st.trangThai === "12" || st.trangThai === "15" ? vnDate(r.createdAt) : null,
    naM_TN: st.trangThai === "12" || st.trangThai === "15" ? vnDate(r.createdAt).slice(-4) : null,
    tranG_THAI: st.trangThai, keT_QUA: st.ketQua,
  });
  const find = (b: Rec, kind: RefKind): RefRecord | FptError => {
    const id = s(pick(b, "REF_ID"));
    const r = refs.get(id.toUpperCase());
    if (!r || r.kind !== kind) return mockError("MOCK-REQ", "REF_ID", "Reference ID", `Không tìm thấy REF_ID "${id}" (mock chỉ biết yêu cầu gửi qua chính nó).`);
    return r;
  };
  const ok = (body: Rec) => ({ ...body, errorList: null });
  const fail = (errors: FptError[]) => ({ errorList: errors });
  const isErr = (x: unknown): x is FptError => !!x && typeof x === "object" && "errorCode" in x;
  const company = (b: Rec) => ({ mA_DV: pick(b, "MA_DV") ?? null, teN_DV: pick(b, "TEN_DV") ?? null, mA_DAI_LY: pick(b, "MA_DAI_LY") ?? "", teN_DAI_LY: pick(b, "TEN_DAI_LY") ?? "" });
  const declRef = (b: Rec) => ({ tK_SOTK: pick(b, "TK_SOTK") ?? null, tK_NGAYDK: pick(b, "TK_NGAYDK") ?? null, tK_MALH: pick(b, "TK_MALH") ?? null, tK_MAHQ: pick(b, "TK_MAHQ") ?? null, tK_LOAI: pick(b, "TK_LOAI") ?? null });

  const handlers: Record<string, (b: Rec) => Promise<Rec> | Rec> = {};

  for (const [op, d] of Object.entries(V5_DOCS) as [V5Doc, (typeof V5_DOCS)[V5Doc]][]) {
    handlers[op] = (b) => {
      const errors = required(b, ["TK_SOTK", "TK_NGAYDK", "TK_MAHQ", "MA_DV", "USER_ID", d.file, d.name]);
      const file = s(pick(b, d.file));
      if (file && Buffer.from(file, "base64").length >= 2 * 1024 * 1024) errors.push(mockError("MOCK-FMT", d.file, "File", "File đính kèm phải nhỏ hơn 2MB."));
      if (errors.length) return fail(errors);
      const r = create("V5", b, { loaiCt: d.loai });
      return ok({ reF_ID: r.refId, loaI_CT: d.loai, ...declRef(b), ...company(b), useR_ID: r.userId });
    };
  }
  handlers["V5Response"] = (b) => {
    const r = find(b, "V5");
    if (isErr(r)) return fail([r]);
    return ok({ reF_ID: r.refId, loaI_CT: r.loaiCt, ...declRef(r.head), ...company(r.head), ...receipt(r, status(r)), useR_ID: r.userId });
  };

  handlers["V5IdentifierReq"] = (b) => {
    const errors = required(b, ["MA_DV", "TEN_DV", "LOAI_DT", "LOAI_HH", "MA_HQ", "USER_ID"]);
    if (!["1", "2"].includes(s(pick(b, "LOAI_DT")))) errors.push(mockError("MOCK-FMT", "LOAI_DT", "Loại đối tượng", "LOAI_DT: 1 doanh nghiệp XNK, 2 doanh nghiệp kho/bãi/cảng."));
    if (!["1", "2", "3"].includes(s(pick(b, "LOAI_HH")))) errors.push(mockError("MOCK-FMT", "LOAI_HH", "Loại hàng hóa", "LOAI_HH: 1 nhập khẩu, 2 xuất khẩu, 3 hàng nội địa."));
    if (errors.length) return fail(errors);
    const r = create("IDENTIFIER", b);
    return ok({ mA_HQ: pick(b, "MA_HQ"), ...company(b), reF_ID: r.refId, useR_ID: r.userId });
  };
  handlers["V5IdentifierRes"] = (b) => {
    const r = find(b, "IDENTIFIER");
    if (isErr(r)) return fail([r]);
    const st = status(r);
    const approved = st.trangThai === "15";
    if (approved) r.identifierNo ??= `DD${vnDate(now()).slice(-4)}${String(seq).padStart(10, "0")}`;
    return ok({
      mA_HQ: pick(r.head, "MA_HQ"), ...company(r.head), reF_ID: r.refId, ...receipt(r, st),
      sO_DD: approved ? r.identifierNo : null, ngaY_DD: approved ? vnDate(now()) : null,
      // Ảnh QR 1×1 px (PNG) – chỉ để giao diện có ảnh hiển thị.
      codE_CONTENT: approved ? "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" : null,
      useR_ID: r.userId,
    });
  };

  handlers["TachVanDonReq"] = (b) => {
    const errors = required(b, ["MA_HQ", "MA_DV", "TEN_DV", "TVD_VD_GOC", "TVD_VD_GOC_NGAY", "TVD_NGUOIPHATHANH", "TVD_VDNHANH_SOLUONG", "TVD_LOAI", "TVD_LOAIHANG", "USER_ID"]);
    const lines = (pick(b, "TVDN_HANG") as Rec[] | undefined) ?? [];
    if (!lines.length) errors.push(mockError("MOCK-REQ", "TVDN_HANG", "Vận đơn nhánh", "Chưa có vận đơn nhánh."));
    const n = Number(pick(b, "TVD_VDNHANH_SOLUONG"));
    if (lines.length && n !== lines.length) errors.push(mockError("MOCK-REQ", "TVD_VDNHANH_SOLUONG", "Số lượng vận đơn nhánh", `Khai ${n} vận đơn nhánh nhưng gửi ${lines.length}.`));
    const container = s(pick(b, "TVD_LOAIHANG")) === "1";
    lines.forEach((l, i) => {
      for (const f of ["TVDN_VD_NHANH", "TVDN_NGUOIGUI_TEN", "TVDN_NGUOINHAN_TEN", "TVDN_LUONG", "TVDN_LUONG_DVT", "TVDN_TRONGLUONG", "TVDN_TRONGLUONG_DVT"])
        if (!s(pick(l, f))) errors.push(mockError("MOCK-REQ", f, f, `Vận đơn nhánh ${i + 1}: chưa nhập ${f}.`, i + 1));
      if (container && !((pick(l, "TVDNC_HANG") as unknown[] | undefined) ?? []).length) errors.push(mockError("MOCK-REQ", "TVDNC_HANG", "Container", `Vận đơn nhánh ${i + 1}: hàng container phải có danh sách container.`, i + 1));
    });
    if (errors.length) return fail(errors);
    const r = create("TACHVANDON", b);
    return ok({ mA_HQ: pick(b, "MA_HQ"), ...company(b), reF_ID: r.refId, useR_ID: r.userId });
  };
  handlers["TachVanDonRes"] = (b) => {
    const r = find(b, "TACHVANDON");
    if (isErr(r)) return fail([r]);
    return ok({ mA_HQ: pick(r.head, "MA_HQ"), ...company(r.head), reF_ID: r.refId, ...receipt(r, status(r)), useR_ID: r.userId });
  };

  /** V5ContainerReq (Excel v1.1 – bản dùng): VD_SO, CON_SO, SEL_SO bắt buộc mỗi dòng. ContainerReq (bản cũ): số seal không bắt buộc. */
  const containerReq = (kind: "CONTAINER" | "V5CONTAINER") => (b: Rec) => {
    const errors = required(b, ["TK_SOTK", "TK_NGAYDK", "TK_MALH", "TK_MAHQ", "MA_DV", "TEN_DV", "USER_ID"]);
    const conts = (pick(b, "HANG_CONT") as Rec[] | undefined) ?? [];
    if (!conts.length) errors.push(mockError("MOCK-REQ", "HANG_CONT", "Container", "Chưa có container nào."));
    const lineFields = kind === "V5CONTAINER" ? ["VD_SO", "CON_SO", "SEL_SO"] : ["VD_SO", "CON_SO"];
    conts.forEach((c, i) => { for (const f of lineFields) if (!s(pick(c, f))) errors.push(mockError("MOCK-REQ", f, f, `Dòng ${i + 1}: chưa nhập ${f}.`, i + 1)); });
    if (errors.length) return fail(errors);
    const r = create(kind, b);
    return ok({ reF_ID: r.refId, ...declRef(b), ...company(b), useR_ID: r.userId, hanG_CONT: conts });
  };
  const containerRes = (kind: "CONTAINER" | "V5CONTAINER") => (b: Rec) => {
    const r = find(b, kind);
    if (isErr(r)) return fail([r]);
    const st = status(r);
    if (kind === "CONTAINER") return ok({ reF_ID: r.refId, ...declRef(r.head), ...company(r.head), ...receipt(r, st), useR_ID: r.userId, hanG_CONT: pick(r.head, "HANG_CONT") ?? [] });
    // V5ContainerRes (Excel v1.1): không trả lại dòng container. Từ chối → errorList theo dòng (rowPosition); seal bắt đầu bằng REJECT là dòng lỗi.
    const base = { reF_ID: r.refId, ...declRef(r.head), ...company(r.head), ...receipt(r, st), useR_ID: r.userId };
    if (st.trangThai !== "10") return ok(base);
    const rows = (pick(r.head, "HANG_CONT") as Rec[] | undefined) ?? [];
    const bad = rows.map((row, i) => ({ row, line: i + 1 })).filter(({ row }) => s(pick(row, "SEL_SO")).toUpperCase().startsWith("REJECT"));
    const errors = (bad.length ? bad : [{ row: {}, line: 0 }]).map(({ line }) => mockError("MOCK-REJ", "SEL_SO", "Số seal", line ? `Dòng ${line}: số seal không hợp lệ (kịch bản mock: seal bắt đầu bằng REJECT).` : st.ketQua, line));
    return { ...base, errorList: errors };
  };
  handlers["ContainerReq"] = containerReq("CONTAINER");
  handlers["ContainerRes"] = containerRes("CONTAINER");
  handlers["V5ContainerReq"] = containerReq("V5CONTAINER");
  handlers["V5ContainerRes"] = containerRes("V5CONTAINER");

  /**
   * KVGS (đặc tả API-KVGS): MỘT lời gọi đồng bộ, không REF_ID. Phản hồi `{ errorList, serviceMessage }` đúng tên trường của đặc tả.
   * Kịch bản mock: thiếu trường → errorList (errorCode "000", nameCode = tên trường đầu tiên thiếu theo thứ tự MA_DV, TK_SOTK, TK_NGAYDK, TK_MAHQ);
   * dữ liệu chứa REJECT → lỗi Hải quan (nameCode "000"); chữ số áp chót của TK_SOTK lẻ → hàng lẻ (…790), chẵn → hàng container (…780) – khớp 2 mẫu của đặc tả.
   */
  handlers["KVGS"] = (b) => {
    const missing = ["MA_DV", "TK_SOTK", "TK_NGAYDK", "TK_MAHQ"].find((n) => !s(pick(b, n)));
    const kvgsError = (nameCode: string, errorContent: string, proposedSolution: string) => ({ errorList: [{ errorCode: "000", indexCode: "000", nameCode, errorContent, proposedSolution, rowPosition: "0" }], serviceMessage: null });
    if (missing) return kvgsError(missing, `Không được để trống ${missing}`, `Vui lòng nhập ${missing}`);
    if (wantsReject(b)) return kvgsError("000", "Không tìm thấy thông tin tờ khai (kịch bản mock: dữ liệu chứa REJECT)", "Kiểm tra số tờ khai, ngày đăng ký, mã Hải quan");
    const no = s(pick(b, "TK_SOTK"));
    const container = Number(no.at(-2) ?? "0") % 2 === 0;
    opts.log(`KVGS ${no} → ${container ? "hàng container" : "hàng lẻ"}`);
    const [d, m, y] = vnDate(now()).split("/");
    const hms = new Date(now().getTime() + 7 * 3_600_000).toISOString().slice(11, 19);
    return {
      errorList: [],
      serviceMessage: {
        ghi_Chu: null, ngayTau: null, maPTVC: null, soDinhDanh: `${container ? "10" : "11"}${m}${y?.slice(-2)}${no.slice(-6)}`, maDDGS: "02CIS01", tenDDGS: "TONG CTY TAN CANG SG - 2 (mô phỏng)",
        isContainer: container ? 1 : 0, dvT_So_Luong_Hang: "PK", dvT_Tong_Trong_Luong_Hang: "KGM", so_Luong_Hang: container ? 120 : 25, tong_Trong_Luong_Hang: container ? 12450.5 : 680.5,
        tenChiCucHaiQuanGS: "Hải quan cửa khẩu cảng Sài Gòn khu vực 1", tenCucHaiQuan: "Chi cục Hải quan khu vực II", tenChiCucHaiQuan: "Hải quan cửa khẩu cảng Sài Gòn khu vực 1",
        tenDonViXNK: "CONG TY MO PHONG", maSoThue: s(pick(b, "MA_DV")), soToKhai: no, ngayToKhai: s(pick(b, "TK_NGAYDK")), loaiHinh: no.startsWith("3") ? "B11" : "A11",
        tenLoaiHinh: no.startsWith("3") ? "Xuất kinh doanh" : "Nhập kinh doanh tiêu dùng", maTrangThaiToKhai: null, trangThaiToKhai: "Thông quan", luongToKhai: "Xanh", thongBaoLoi: null,
        thoiGianLayDuLieu: `${d}/${m}/${y} ${hms}`,
        bangKeMaVachContainer: container
          ? [
              { soContainer: "FBIU5802429", soSeal: "SEAL0001", soSealHQ: "", barcodeImage: KVGS_QR_PNG },
              { soContainer: "MSKU1234565", soSeal: "SEAL0002", soSealHQ: "HQ0002", barcodeImage: KVGS_QR_PNG },
            ]
          : [],
      },
    };
  };

  /** Ký file: trả lại chính file (đã "ký") – giả định. */
  handlers["KyFile"] = (b) => {
    const errors = required(b, ["MA_DV", "USER_ID", "FILE_TEN", "FILE_BASE64"]);
    if (errors.length) return fail(errors);
    return ok({ mA_DV: pick(b, "MA_DV"), filE_TEN: pick(b, "FILE_TEN"), filE_BASE64: pick(b, "FILE_BASE64"), daA_KY: true, ngaY_KY: vnDate(now()) });
  };

  // In: trả một PDF nhỏ (base64) – giả định (FPT có thể trả XPS/PDF).
  const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF").toString("base64");
  const printOut = (name: string) => ok({ filE_TEN: name, filE_BASE64: PDF, filE_LOAI: "pdf" });
  handlers["PrintObjectRefIDA"] = (b) => (pick(b, "objVN_IDA") ? printOut("ToKhaiNhapKhau.pdf") : fail([mockError("MOCK-REQ", "objVN_IDA", "Tờ khai", "Thiếu objVN_IDA.")]));
  handlers["PrintObjectRef"] = (b) => (pick(b, "objVN_EDA") ? printOut("ToKhaiXuatKhau.pdf") : fail([mockError("MOCK-REQ", "objVN_EDA", "Tờ khai", "Thiếu objVN_EDA.")]));
  handlers["PrintEdiRef"] = (b) => (s(pick(b, "ediBase64")) ? printOut("ThongDiep.pdf") : fail([mockError("MOCK-REQ", "ediBase64", "EDI", "Thiếu ediBase64.")]));
  handlers["PrintXPS"] = (b) => (s(pick(b, "REF_ID")) ? printOut("BanIn.pdf") : fail([mockError("MOCK-REQ", "REF_ID", "Reference ID", "Thiếu reF_ID.")]));

  /** Danh mục: lấy từ danh mục VNACCS trong @kb/contracts, đổi sang tên cột của sheet DANH MUC CHUAN VNACCS (giả định cấu trúc). */
  handlers["SyncCategory"] = async () => {
    const ids = ["A038", "COUNTRY", "A016", "A202", "UNIT", "CURRENCY"] as const;
    const [a038, a015, a016, a202, a501, a527] = await Promise.all(ids.map((id) => loadCodeList(id)));
    const rows = (list: { code: string; name: string; inactive?: boolean }[] = [], code: string, name: string, limit = 5000) =>
      list.slice(0, limit).map((e) => ({ [code]: e.code, [name]: e.name, hieN_THI: e.inactive ? "0" : "1" }));
    return ok({
      vN_A038: rows(a038, "mA_HQ", "teN_HQ"), vN_A015: rows(a015, "mA_NUOC", "teN_NUOC"), vN_A016_FOREIGN: rows(a016, "mA_CANG", "teN_CANG", 2000),
      vN_A202: rows(a202, "mA_KHO", "teN_KHO"), vN_A501: rows(a501, "mA_DVT", "teN_DVT"), vN_A527: rows(a527, "mA_NT", "teN_NT"),
    });
  };

  return {
    ops: Object.keys(handlers),
    handle: async (op: string, body: Rec) => handlers[op]!(body),
    reset: () => { refs.clear(); seq = 0; },
    refs,
  };
}
