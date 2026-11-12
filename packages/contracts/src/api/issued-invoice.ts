// Hóa đơn thương mại do hệ thống phát hành SAU KHI TỜ KHAI THÔNG QUAN (ADR 0013 mục 3, quyết định 2026-11-12).
// Cách A: cấp (giữ) số trước → số điền vào chỉ tiêu Số hóa đơn của tờ khai; thông quan rồi mới phát hành/in theo mẫu doanh nghiệp.
// Một hồ sơ một hóa đơn. Số là string (bất biến 2), tiền là chuỗi thập phân (bất biến 3).
import { z } from "zod";
import { DecimalStringSchema, IsoDateSchema, IsoDateTimeSchema } from "../common.js";
import { InvoiceLayoutSchema } from "./invoice-template.js";

const party = z.object({ name: z.string().nullable(), address: z.string().nullable(), country: z.string().nullable(), taxCode: z.string().nullable() });
const opt = (max: number) => z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable().default(null);

/** Thông tin bổ sung lúc phát hành – tờ khai không có (L/C, vận đơn, hợp đồng). In nguyên văn, không đối chiếu. */
export const ReleaseExtraSchema = z.object({
  contractNo: opt(50),
  lcNo: opt(35),
  lcDate: IsoDateSchema.nullable().default(null),
  lcIssuingBank: opt(255),
  blNo: opt(35),
  blDate: IsoDateSchema.nullable().default(null),
});
export type ReleaseExtra = z.infer<typeof ReleaseExtraSchema>;
export const EMPTY_RELEASE_EXTRA: ReleaseExtra = { contractNo: null, lcNo: null, lcDate: null, lcIssuingBank: null, blNo: null, blDate: null };
export type ReleaseExtraInput = z.input<typeof ReleaseExtraSchema>;

/** Nội dung hóa đơn – đóng băng lúc phát hành (in lấy từ đây, không lấy shipment hiện tại; sửa mẫu về sau không đổi bản đã phát hành). */
export const IssuedInvoiceSnapshotSchema = z.object({
  seller: z.object({ name: z.string(), taxCode: z.string(), address: z.string().nullable().optional(), phone: z.string().nullable().optional() }),
  buyer: party,
  invoice: z.object({
    date: IsoDateSchema, incoterm: z.string().nullable(), incotermPlace: z.string().nullable(), currency: z.string(),
    paymentTerms: z.string().nullable(), poNo: z.string().nullable(), totalAmount: DecimalStringSchema,
  }),
  transport: z.object({
    portOfLoading: z.string().nullable(), portOfDischarge: z.string().nullable(), finalDestination: z.string().nullable(), departureDate: z.string().nullable(),
    vessel: z.string().nullable(), packages: z.string().nullable(), packageUnit: z.string().nullable(), grossWeightKg: z.string().nullable(), netWeightKg: z.string().nullable(),
    containers: z.array(z.object({ no: z.string(), sealNo: z.string().nullable(), size: z.string().nullable() })),
  }),
  originCountry: z.string().nullable(),
  /** Số tờ khai xuất khẩu đã thông quan. */
  declarationNo: z.string().nullable().default(null),
  marks: z.string().nullable().default(null),
  extra: ReleaseExtraSchema.default(EMPTY_RELEASE_EXTRA),
  signatory: z.object({ name: z.string().nullable(), title: z.string().nullable() }).nullable().default(null),
  /** Mẫu in chép vào lúc phát hành. */
  layout: InvoiceLayoutSchema,
  items: z.array(z.object({
    lineNo: z.number().int().positive(), description: z.string(), partNo: z.string().nullable(), hsCode: z.string().nullable(),
    quantity: DecimalStringSchema, unit: z.string(), unitPrice: DecimalStringSchema, amount: DecimalStringSchema, origin: z.string().nullable(),
  })).min(1),
});
export type IssuedInvoiceSnapshot = z.infer<typeof IssuedInvoiceSnapshotSchema>;

/** RESERVED = đã cấp số (đã điền vào tờ khai), chưa phát hành; ISSUED = đã phát hành, in được; VOID = đã hủy (số không dùng lại). */
export const IssuedStatusSchema = z.enum(["RESERVED", "ISSUED", "VOID"]);
export type IssuedStatus = z.infer<typeof IssuedStatusSchema>;

export const IssuedInvoiceSchema = z.object({
  id: z.string(),
  no: z.string(),
  status: IssuedStatusSchema,
  reservedAt: IsoDateTimeSchema,
  releasedAt: IsoDateTimeSchema.nullable(),
  voidedAt: IsoDateTimeSchema.nullable(),
  voidReason: z.string().nullable(),
  templateId: z.string().nullable(),
  snapshot: IssuedInvoiceSnapshotSchema.nullable(),
});
export type IssuedInvoice = z.infer<typeof IssuedInvoiceSchema>;

/** Lý do chưa phát hành được (dịch ở giao diện). */
export const IssueBlockerSchema = z.enum(["NOT_CLEARED", "NO_ITEMS", "NO_CURRENCY", "NO_BUYER", "ITEM_INCOMPLETE"]);
export type IssueBlocker = z.infer<typeof IssueBlockerSchema>;

export const IssuedInvoicesViewSchema = z.object({
  /** Hồ sơ XK đặt Invoice "hệ thống phát hành" (nguồn ISSUED) – false thì khối hóa đơn không hiện. */
  enabled: z.boolean(),
  /** Hóa đơn đang dùng (RESERVED hoặc ISSUED), null = chưa cấp số / đã hủy. */
  current: IssuedInvoiceSchema.nullable(),
  /** Mọi số đã cấp của hồ sơ, mới nhất trước (gồm số đã hủy). */
  history: z.array(IssuedInvoiceSchema),
  /** Số sẽ cấp nếu bấm Cấp số bây giờ (xem trước, không giữ chỗ). */
  nextNo: z.string(),
  /** Đã thông quan → phát hành được. */
  cleared: z.boolean(),
  /** Tờ khai đã có số Hải quan: hủy số thì phải sửa tờ khai (EDD/EDE trước thông quan, AMA sau thông quan). */
  declared: z.boolean(),
  /** Lý do chưa phát hành được (rỗng = phát hành được). */
  blockers: z.array(IssueBlockerSchema),
  /** Bản xem trước từ dữ liệu hiện tại và mẫu mặc định (null khi thiếu dữ liệu). */
  preview: IssuedInvoiceSnapshotSchema.nullable(),
  templates: z.array(z.object({ id: z.string(), name: z.string(), isDefault: z.boolean() })),
  /** Được cấp số / hủy số (quyền + hồ sơ chưa khóa). */
  editable: z.boolean(),
  /** Được phát hành (quyền; hồ sơ đã thông quan thì vẫn phát hành được dù đã khóa). */
  canRelease: z.boolean(),
  /** Được hủy số đang dùng – kể cả khi nguồn Invoice đã đổi sang tải lên (dọn số đã cấp). */
  canVoid: z.boolean().default(false),
});
export type IssuedInvoicesView = z.infer<typeof IssuedInvoicesViewSchema>;

export const VoidInvoiceInputSchema = z.object({ reason: z.string().trim().min(1, "Nhập lý do hủy").max(200) });
export type VoidInvoiceInput = z.infer<typeof VoidInvoiceInputSchema>;
export const IssueActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("RESERVE") }),
  /** Phát hành (hoặc phát hành lại cùng số – đổi mẫu/thông tin bổ sung). `templateId` null = mẫu mặc định. */
  z.object({ action: z.literal("RELEASE"), templateId: z.string().max(64).nullable().default(null), extra: ReleaseExtraSchema.default(EMPTY_RELEASE_EXTRA) }),
  z.object({ action: z.literal("VOID"), reason: z.string().trim().min(1, "Nhập lý do hủy").max(200) }),
]);
export type IssueAction = z.input<typeof IssueActionSchema>;
