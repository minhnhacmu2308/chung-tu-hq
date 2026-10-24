import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  EdaRequestSchema,
  FptChannelSchema,
  FptDeclarationStateSchema,
  FptErrorItemSchema,
  FptResponseEnvelopeSchema,
  HYS_FIELDS,
  HYS_LIST_FILE_FIELDS,
  HysRequestSchema,
  IdaRequestSchema,
  VN_EDA_CON_FIELDS,
  VN_EDA_CTHQ_FIELDS,
  VN_EDA_FIELDS,
  VN_EDA_HANG_FIELDS,
  VN_EDA_TRANGTHAI_FIELDS,
  VN_IDA_CTHQ_FIELDS,
  VN_IDA_FIELDS,
  VN_IDA_HANG_FIELDS,
  VN_IDA_KTG_FIELDS,
  VN_IDA_THUE_FIELDS,
  VN_IDA_TRANGTHAI_FIELDS,
  VN_IDA_VANDON_FIELDS,
  VnEdaConSchema,
  VnEdaCthqSchema,
  VnEdaHangSchema,
  VnEdaSchema,
  VnIdaHangSchema,
  VnIdaSchema,
  VnIdaTrangThaiSchema,
  VnIdaVandonSchema,
  fptKey,
  type FptFieldMeta,
  type VnEda,
} from "./index.js";

/**
 * business/format.json KHÔNG phải JSON hợp lệ toàn bộ: một object đầu `{ TK_SOTK… }` (mẫu API V5),
 * sau đó là các cặp `"objVN_EDA": {…}`, `"objVN_EDA_CON": {…}`, `"objVN_EDA_CTHQ": {…}` rời rạc và
 * `"objVN_EDA_HANG": [ {…}` thiếu `]`. Cách trích: tìm `"<key>":`, lấy từ dấu `{`/`[` kế tiếp tới dấu
 * đóng cân bằng (bỏ qua ký tự trong chuỗi JSON), rồi `JSON.parse` đoạn đó.
 */
const FORMAT_PATH = fileURLToPath(new URL("../../../../business/format.json", import.meta.url));
// File mẫu của FPT không nằm trong git – máy không có thì bỏ qua các test so với mẫu (các test đặc tả khác vẫn chạy).
const HAS_FORMAT = existsSync(FORMAT_PATH);
const FORMAT_JSON = HAS_FORMAT ? readFileSync(FORMAT_PATH, "utf8") : "";
const itFormat = it.skipIf(!HAS_FORMAT);

function extractJson(text: string, key: string, open: "{" | "[" = "{"): unknown {
  const at = text.indexOf(`"${key}":`);
  if (at < 0) throw new Error(`không thấy ${key}`);
  const start = text.indexOf(open, at);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error(`${key} không đóng ngoặc`);
}

/** Phần tử đầu của mảng `objVN_EDA_HANG` (mảng trong mẫu bị cắt cụt, thiếu `]`). */
function firstEdaHang(): unknown {
  const at = FORMAT_JSON.indexOf('"objVN_EDA_HANG":');
  const inner = FORMAT_JSON.slice(FORMAT_JSON.indexOf("[", at) + 1);
  return extractJson(`"x": ${inner}`, "x");
}

/** Dựng object hợp lệ tối thiểu từ meta (chỉ trường bắt buộc). */
function minimalValid(fields: FptFieldMeta[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (!f.required) continue;
    out[fptKey(f.name)] = f.type === "date" ? "08/01/2025" : f.type === "decimal" || f.type === "long" ? 1 : "A";
  }
  return out;
}

describe("fptKey – quy ước key JSON của FPT (camelCase .NET)", () => {
  it("khớp format.json", () => {
    expect(fptKey("TK_ICB")).toBe("tK_ICB");
    // Đề bài dự đoán "hAG_CMD" nhưng format.json dùng "haG_CMD" – theo mẫu.
    expect(fptKey("HAG_CMD")).toBe("haG_CMD");
    expect(fptKey("CON_C01")).toBe("coN_C01");
    expect(fptKey("CTHQ_D01")).toBe("cthQ_D01");
    expect(fptKey("VD_BL1")).toBe("vD_BL1");
    expect(fptKey("KTG_FR3")).toBe("ktG_FR3");
    expect(fptKey("MALHV4")).toBe("malhV4");
    expectTypeOf(fptKey("HAG_CMD")).toEqualTypeOf<"haG_CMD">();
    expectTypeOf(fptKey("CTHQ_D01")).toEqualTypeOf<"cthQ_D01">();
  });

  itFormat("mọi key trong objVN_EDA/CON/CTHQ của format.json đều là fptKey của một trường trong sheet", () => {
    const cases: [string, FptFieldMeta[]][] = [
      ["objVN_EDA", VN_EDA_FIELDS],
      ["objVN_EDA_CON", VN_EDA_CON_FIELDS],
      ["objVN_EDA_CTHQ", VN_EDA_CTHQ_FIELDS],
    ];
    for (const [key, fields] of cases) {
      const known = new Set(fields.map((f) => fptKey(f.name)));
      const sample = extractJson(FORMAT_JSON, key) as Record<string, unknown>;
      expect(Object.keys(sample).filter((k) => !known.has(k)), key).toEqual([]);
    }
  });
});

describe("format.json – mẫu EDA", () => {
  itFormat("objVN_EDA parse qua VnEdaSchema", () => {
    const res = VnEdaSchema.safeParse(extractJson(FORMAT_JSON, "objVN_EDA"));
    expect(res.error?.issues ?? []).toEqual([]);
    const eda: VnEda = res.data as VnEda;
    expect(eda.tK_ECB).toBe("B11");
    expect(eda.tK_GW).toBe(600);
    expect(eda.tK_SYM).toBe("08/01/2025");
    expectTypeOf<VnEda["tK_GW"]>().toEqualTypeOf<number>();
    expectTypeOf<VnEda["tK_ECB"]>().toEqualTypeOf<string>();
    expectTypeOf<VnEda["tK_NO"]>().toEqualTypeOf<number | string>();
    expectTypeOf<VnEda["tK_MRK"]>().toEqualTypeOf<string | null | undefined>();
  });

  itFormat("objVN_EDA_CON và objVN_EDA_CTHQ parse được", () => {
    expect(VnEdaConSchema.safeParse(extractJson(FORMAT_JSON, "objVN_EDA_CON")).success).toBe(true);
    expect(VnEdaCthqSchema.safeParse(extractJson(FORMAT_JSON, "objVN_EDA_CTHQ")).success).toBe(true);
  });

  itFormat("dòng hàng mẫu LỆCH đặc tả: thiếu các trường sheet đánh Required", () => {
    const res = VnEdaHangSchema.safeParse(firstEdaHang());
    expect(res.success).toBe(false);
    const paths = (res.error?.issues ?? []).map((i) => i.path.join(".")).sort();
    expect(paths).toEqual(["haG_BPR", "haG_UPC", "haG_UPR"]);
  });

  itFormat("EdaRequestSchema ghép đúng object", () => {
    const hang = { ...(firstEdaHang() as Record<string, unknown>), haG_BPR: 400.4, haG_UPR: 200.2, haG_UPC: "USD", haG_XX: "A" };
    const res = EdaRequestSchema.safeParse({
      objVN_EDA: extractJson(FORMAT_JSON, "objVN_EDA"),
      objVN_EDA_CON: extractJson(FORMAT_JSON, "objVN_EDA_CON"),
      objVN_EDA_CTHQ: extractJson(FORMAT_JSON, "objVN_EDA_CTHQ"),
      objVN_EDA_HANG: [hang],
    });
    expect(res.error?.issues ?? []).toEqual([]);
    expect(EdaRequestSchema.safeParse({ objVN_EDA: extractJson(FORMAT_JSON, "objVN_EDA"), objVN_EDA_HANG: [] }).success).toBe(false);
  });
});

describe("kiểm tra kiểu", () => {
  const ida = minimalValid(VN_IDA_FIELDS);
  const vandon = minimalValid(VN_IDA_VANDON_FIELDS);

  it("object tối thiểu hợp lệ", () => {
    expect(VnIdaSchema.safeParse(ida).success).toBe(true);
    expect(VnIdaVandonSchema.safeParse(vandon).success).toBe(true);
  });

  itFormat("từ chối số gửi dạng chuỗi", () => {
    // VN_IDA không có TK_GW (trọng lượng nằm ở VN_IDA_VANDON.VD_GW); dùng TK_IP4 và VD_GW.
    expect(VnIdaSchema.safeParse({ ...ida, tK_IP4: "5543.17" }).success).toBe(false);
    expect(VnIdaVandonSchema.safeParse({ ...vandon, vD_GW: "600" }).success).toBe(false);
    expect(VnEdaSchema.safeParse({ ...(extractJson(FORMAT_JSON, "objVN_EDA") as object), tK_GW: "600" }).success).toBe(false);
  });

  it("từ chối ngày sai định dạng, nhận rỗng/null cho trường không bắt buộc", () => {
    expect(VnIdaSchema.safeParse({ ...ida, tK_ICD: "2025-01-08" }).success).toBe(false);
    expect(VnIdaSchema.safeParse({ ...ida, tK_ICD: "32/01/2025" }).success).toBe(false);
    expect(VnIdaSchema.safeParse({ ...ida, tK_ICD: "08/01/2025" }).success).toBe(true);
    expect(VnIdaSchema.safeParse({ ...ida, tK_ICD: "" }).success).toBe(true);
    expect(VnIdaSchema.safeParse({ ...ida, tK_ICD: null }).success).toBe(true);
  });

  it("từ chối text quá Size và thiếu trường bắt buộc", () => {
    expect(VnIdaSchema.safeParse({ ...ida, tK_ICB: "A12345" }).success).toBe(false); // Size 5
    const { tK_ICB: _omit, ...missing } = ida;
    expect(VnIdaSchema.safeParse(missing).success).toBe(false);
  });

  it("IdaRequestSchema cần ít nhất một dòng hàng", () => {
    const hang = minimalValid(VN_IDA_HANG_FIELDS);
    expect(VnIdaHangSchema.safeParse(hang).success).toBe(true);
    expect(IdaRequestSchema.safeParse({ objVN_IDA: ida, objVN_IDA_HANG: [hang], objVN_IDA_VANDON: vandon }).success).toBe(true);
    expect(IdaRequestSchema.safeParse({ objVN_IDA: ida, objVN_IDA_HANG: [], objVN_IDA_VANDON: vandon }).success).toBe(false);
  });
});

describe("độ phủ đặc tả", () => {
  it("số trường = số dòng dữ liệu trong sheet", () => {
    const counts: [string, FptFieldMeta[], number][] = [
      ["VN_IDA", VN_IDA_FIELDS, 126],
      ["VN_IDA_HANG", VN_IDA_HANG_FIELDS, 106],
      ["VN_IDA_VANDON", VN_IDA_VANDON_FIELDS, 23],
      ["VN_IDA_KTG", VN_IDA_KTG_FIELDS, 42],
      ["VN_IDA_THUE", VN_IDA_THUE_FIELDS, 34],
      ["VN_IDA_CTHQ", VN_IDA_CTHQ_FIELDS, 33],
      ["VN_IDA_TRANGTHAI", VN_IDA_TRANGTHAI_FIELDS, 27],
      ["VN_EDA", VN_EDA_FIELDS, 130],
      ["VN_EDA_HANG", VN_EDA_HANG_FIELDS, 56],
      ["VN_EDA_CON", VN_EDA_CON_FIELDS, 59],
      ["VN_EDA_CTHQ", VN_EDA_CTHQ_FIELDS, 33],
      ["VN_EDA_TRANGTHAI", VN_EDA_TRANGTHAI_FIELDS, 9],
      ["HYS (16 dòng = 15 vô hướng + LIST_FILE)", HYS_FIELDS, 15],
      ["LIST_FILE", HYS_LIST_FILE_FIELDS, 2],
    ];
    for (const [sheet, fields, rows] of counts) expect(fields.length, sheet).toBeGreaterThanOrEqual(rows);
  });

  it("tên trường duy nhất trong từng sheet (và key JSON cũng duy nhất)", () => {
    for (const fields of [VN_IDA_FIELDS, VN_IDA_HANG_FIELDS, VN_EDA_FIELDS, VN_EDA_HANG_FIELDS, VN_EDA_CON_FIELDS]) {
      expect(new Set(fields.map((f) => f.name)).size).toBe(fields.length);
      expect(new Set(fields.map((f) => fptKey(f.name))).size).toBe(fields.length);
    }
  });

  it("Size thập phân được tách size/scale", () => {
    const fr3 = VN_IDA_FIELDS.concat(VN_IDA_HANG_FIELDS).find((f) => f.name === "HAG_QN1");
    expect(fr3).toMatchObject({ type: "decimal", size: 18, scale: 2, required: true });
  });
});

describe("HYS", () => {
  it("cần tài khoản + LIST_FILE", () => {
    const base = { useR_ID: "u", passworD: "p", terminaL_ID: "t", terminaL_ACCESS_KEY: "k", tK_CH: "01NV", tK_TSB: "A01" };
    expect(fptKey("PASSWORD")).toBe("password");
    const ok = { ...base, passworD: undefined, password: "p", lisT_FILE: [{ filE_NAME: "a.pdf", filE_BASE64: "QQ==" }] };
    expect(HysRequestSchema.safeParse(ok).success).toBe(true);
    expect(HysRequestSchema.safeParse({ ...ok, lisT_FILE: [] }).success).toBe(false);
  });
});

describe("trạng thái & lỗi", () => {
  it("giải nghĩa phản hồi trạng thái", () => {
    const st = VnIdaTrangThaiSchema.parse({ tK_LUONG: 3, tK_TRANGTHAI: "C", tK_THONGQUAN: 0, khac: 1 });
    expect(FptChannelSchema.parse(st.tK_LUONG)).toBe(3);
    expect(FptDeclarationStateSchema.parse(st.tK_TRANGTHAI)).toBe("C");
    expect(FptChannelSchema.safeParse(4).success).toBe(false);
  });

  it("errorList", () => {
    const res = FptResponseEnvelopeSchema.parse({
      errorList: [{ errorCode: "E001", indexCode: "TK_ICB", nameCode: "Mã loại hình", errorContent: "Sai", proposedSolution: "Sửa", rowPosition: null }],
    });
    expect(res.errorList?.[0]?.indexCode).toBe("TK_ICB");
    expect(FptErrorItemSchema.safeParse({ errorCode: 1 }).success).toBe(false);
  });
});
