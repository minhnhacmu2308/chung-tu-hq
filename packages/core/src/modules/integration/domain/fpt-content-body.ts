// Body nội dung tờ khai gửi FPT (IDA/EDA, IDA01/EDA01) – một chỗ duy nhất cho gateway (gửi thật) và xem trước (FPT_DEBUG_TRACE) để hai bên không lệch.
// IDA/EDA: output của schema cổng (Zod bỏ key lạ, đổi kiểu theo đặc tả). Có số tờ khai (IDA01/EDA01, hoặc khai tạm lại IDA/EDA sau gọi sửa IDB/EDB)
// → số ở đầu tờ khai (tK_ICN/tK_ECN) + chỉ thị Hải quan objVN_<KIND>_CTHQ (nếu có) gửi lại NGUYÊN VĂN (không qua schema – không trim, không đổi kiểu).
// `ref` = mã tờ phía ta → tK_ID ở đầu tờ khai (khai tạm lần đầu chọn kết quả của tờ theo TK_ID). Thuần.
import { EdaRequestSchema, IdaRequestSchema, shapeEdaBody, shapeIdaBody } from "@kb/contracts";
import { describeSchemaIssue, type SchemaIssueView } from "./schema-issues.js";

type Obj = Record<string, unknown>;
export const fptNumberField = (kind: "IDA" | "EDA") => (kind === "IDA" ? "tK_ICN" : "tK_ECN");

export function fptContentBody(
  kind: "IDA" | "EDA",
  request: unknown,
  opts: { declarationNo?: string | null; ref?: string | null } = {},
): { ok: true; body: Obj } | { ok: false; issues: SchemaIssueView[] } {
  const parsed = (kind === "IDA" ? IdaRequestSchema : EdaRequestSchema).safeParse(request);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map(describeSchemaIssue) };
  // Đủ mọi key theo mẫu request FPT, ô trống gửi ""/null (thiếu key → S0049) – shapeIdaBody / shapeEdaBody.
  const shape = (b: Obj) => (kind === "IDA" ? shapeIdaBody(b) : shapeEdaBody(b));
  const headKey = `objVN_${kind}`;
  const withRef = (b: Obj): Obj => (opts.ref ? { ...b, [headKey]: { ...((b[headKey] ?? {}) as Obj), tK_ID: opts.ref } } : b);
  if (!opts.declarationNo) return { ok: true, body: withRef(shape(parsed.data as Obj)) };
  const cthqKey = `objVN_${kind}_CTHQ`;
  const cthq = (request as Obj | undefined)?.[cthqKey];
  const body = { ...(parsed.data as Obj), ...(cthq && typeof cthq === "object" ? { [cthqKey]: cthq } : {}) };
  const head = { ...((body[headKey] ?? {}) as Obj), [fptNumberField(kind)]: Number(opts.declarationNo) };
  return { ok: true, body: withRef(shape({ ...body, [headKey]: head })) };
}
