// Dữ liệu lô hàng nhập tay (ADR 0013 – Khai trước: chưa có chứng từ để AI đọc). Số invoice KHÔNG nhập ở đây – cấp khi phát hành (GĐ2b).
import { z } from "zod";
import { DecimalStringSchema, IsoDateSchema } from "../common.js";

/** Chuỗi tùy chọn: rỗng → null (form gửi ""). Mã định danh luôn là string (bất biến 2). */
const text = (max: number) => z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable().optional();
const decimal = () => z.union([z.literal(""), DecimalStringSchema]).transform((v) => (v === "" ? null : v)).nullable().optional();
const date = () => z.union([z.literal(""), IsoDateSchema]).transform((v) => (v === "" ? null : v)).nullable().optional();
// So bằng chuỗi (không dùng number cho tiền/lượng – bất biến 3).
const isZero = (v: string) => /^-?0+(\.0+)?$/.test(v);
const positive = (label: string) => DecimalStringSchema.refine((v) => !v.startsWith("-") && !isZero(v), `${label} phải lớn hơn 0`);

export const ManualShipmentItemSchema = z.object({
  description: z.string().trim().min(1, "Nhập tên hàng").max(500),
  quantity: positive("Số lượng"),
  unit: z.string().trim().min(1, "Nhập đơn vị tính").max(20),
  unitPrice: DecimalStringSchema.refine((v) => !v.startsWith("-") || isZero(v), "Đơn giá không được âm"),
  origin: text(2),
  hsOnInvoice: text(12),
  partNo: text(50),
  /** Mặt hàng chọn từ danh mục hàng hóa (chỉ để biết nguồn; HS vẫn phải xác nhận ở bước HS). */
  catalogItemId: z.string().max(64).nullable().optional(),
});
export type ManualShipmentItem = z.infer<typeof ManualShipmentItemSchema>;

export const ManualShipmentSchema = z.object({
  buyer: z.object({ name: text(255), address: text(500), country: text(2), taxCode: text(20) }).default({}),
  invoice: z.object({ date: date(), incoterm: text(3), incotermPlace: text(100), currency: text(3), paymentTerms: text(255), poNo: text(50) }).default({}),
  transport: z
    .object({
      portOfLoading: text(100), portOfDischarge: text(100), finalDestination: text(100), departureDate: date(), vessel: text(100),
      packages: decimal(), packageUnit: text(20), grossWeightKg: decimal(), netWeightKg: decimal(),
      containers: z.array(z.object({ no: z.string().trim().min(1).max(15), sealNo: z.string().trim().max(20).nullable().optional(), size: z.string().trim().max(10).nullable().optional() })).max(200).default([]),
    })
    .default({ containers: [] }),
  origin: z.object({ country: text(2) }).default({}),
  /** Ký mã hiệu (shipping marks) in trên hóa đơn thương mại. */
  marks: text(500),
  items: z.array(ManualShipmentItemSchema).max(500).default([]),
});
export type ManualShipment = z.infer<typeof ManualShipmentSchema>;
export type ManualShipmentInput = z.input<typeof ManualShipmentSchema>;

export const ManualShipmentViewSchema = z.object({
  data: ManualShipmentSchema.nullable(),
  updatedAt: z.string().nullable(),
  /** Hồ sơ đã duyệt/truyền/hủy → chỉ xem. */
  editable: z.boolean(),
});
export type ManualShipmentView = z.infer<typeof ManualShipmentViewSchema>;
