import { useMemo } from "react";
import bwipjs from "bwip-js/generic";
import { cva } from "class-variance-authority";
import { cn } from "../lib/cn.js";

// Mã vạch 2 chiều (QR) / 1 chiều (Code128) dạng SVG cho bản in cán bộ hải quan quét.
// Màu luôn `currentColor` (trang in tự ép đen trên trắng). KHÔNG dùng CSS làm méo tỉ lệ:
// svg giữ `preserveAspectRatio="xMidYMid meet"`, vùng yên tĩnh (quiet zone) nằm trong viewBox.

export type BarcodeType = "qr" | "code128";
export type BarcodeSize = "sm" | "md" | "lg";

export interface BarcodeProps {
  type: BarcodeType;
  /** Nội dung mã hóa. Rỗng → không render. */
  value: string;
  /** Tên truy cập (aria-label) – bắt buộc. */
  label: string;
  size?: BarcodeSize;
  className?: string;
}

// Code128: kích thước theo SỐ MODULE, không theo hộp cố định. 1 module = 2 đơn vị viewBox (bwip scale 2).
// px/đơn vị viewBox: sm 0.75 (vạch hẹp 1,5px) · md 1 (2px) · lg 1,5 (3px). Cao cố định, không co theo bề rộng.
const CODE128_PX_PER_UNIT: Record<BarcodeSize, number> = { sm: 0.75, md: 1, lg: 1.5 };
const CODE128_HEIGHT_PX: Record<BarcodeSize, number> = { sm: 40, md: 56, lg: 80 };

const barcodeVariants = cva("inline-block shrink-0 max-w-none text-current", {
  variants: {
    type: { qr: "", code128: "" },
    size: { sm: "", md: "", lg: "" },
  },
  compoundVariants: [
    { type: "qr", size: "sm", className: "h-24 w-24" },
    { type: "qr", size: "md", className: "h-32 w-32" },
    { type: "qr", size: "lg", className: "h-48 w-48" },
  ],
  defaultVariants: { type: "qr", size: "md" },
});

interface Shape {
  viewBox: string;
  paths: { d: string; strokeWidth?: string | undefined }[];
}

// Chỉ nhận lại các giá trị số/lệnh đường vẽ từ chuỗi SVG của thư viện; không bao giờ chèn HTML thô.
const VIEWBOX_RE = /viewBox="(\d+(?: \d+){3})"/;
const PATH_RE = /<path\b([^>]*)>/g;
const D_RE = /\sd="([MLZ0-9. -]*)"/;
const SW_RE = /stroke-width="(\d+(?:\.\d+)?)"/;

function parseSvg(svg: string): Shape | null {
  const viewBox = VIEWBOX_RE.exec(svg)?.[1];
  if (!viewBox) return null;
  const paths: Shape["paths"] = [];
  for (const m of svg.matchAll(PATH_RE)) {
    const attrs = m[1] ?? "";
    const d = D_RE.exec(attrs)?.[1];
    if (!d) continue;
    paths.push({ d, strokeWidth: SW_RE.exec(attrs)?.[1] });
  }
  return paths.length > 0 ? { viewBox, paths } : null;
}

function build(type: BarcodeType, value: string): Shape | null {
  try {
    const svg =
      type === "qr"
        ? bwipjs.toSVG({ bcid: "qrcode", text: value, eclevel: "M", paddingwidth: 8, paddingheight: 8 } as Parameters<typeof bwipjs.toSVG>[0])
        : bwipjs.toSVG({ bcid: "code128", text: value, height: 12, includetext: false, paddingwidth: 10, paddingheight: 2 });
    return parseSvg(svg);
  } catch {
    return null; // giá trị không mã hóa được → không dựng, không làm sập trang
  }
}

export function Barcode({ type, value, label, size = "md", className }: BarcodeProps) {
  const shape = useMemo(() => (value === "" ? null : build(type, value)), [type, value]);
  if (!shape) return null;
  // Code128: width/height tường minh; preserveAspectRatio="none" chỉ giãn trục Y của vạch dọc (không đổi
  // bề rộng vạch – thứ quét dựa vào). Rộng hơn khung chứa thì tràn/cuộn (max-w-none), không bị nén.
  const dims =
    type === "code128"
      ? {
          width: Math.round(Number(shape.viewBox.split(" ")[2]) * CODE128_PX_PER_UNIT[size]),
          height: CODE128_HEIGHT_PX[size],
        }
      : null;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={shape.viewBox}
      width={dims?.width}
      height={dims?.height}
      preserveAspectRatio={dims ? "none" : "xMidYMid meet"}
      shapeRendering="crispEdges"
      className={cn(barcodeVariants({ type, size }), className)}
    >
      {shape.paths.map((p, i) =>
        p.strokeWidth ? (
          <path key={i} d={p.d} fill="none" stroke="currentColor" strokeWidth={p.strokeWidth} />
        ) : (
          <path key={i} d={p.d} fill="currentColor" fillRule="evenodd" />
        ),
      )}
    </svg>
  );
}
