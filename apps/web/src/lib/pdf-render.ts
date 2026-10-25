"use client";
// Dựng file gốc thành ảnh từng trang ngay trên trình duyệt (pdf.js) để tô được vùng của trường lên trang thật.
// PDF: lấy kèm lớp chữ (tọa độ từng mẩu chữ) cho pdf-locate. Ảnh: một trang, không có lớp chữ (vị trí chỉ từ AI).
// pdf.js chỉ tải khi mở bước OCR có file thật (import động) – không vào bundle chung.
import type { PageText, TextBox } from "./pdf-locate";

export type RenderedPage = { url: string; aspect: number; text: PageText };
export type RenderedFile = { pages: RenderedPage[]; totalPages: number; dispose: () => void };

/** Bề rộng ảnh trang (px): gấp đôi khổ hiển thị 640 px để phóng to vẫn nét. */
const RENDER_WIDTH = 1280;
/** Chứng từ rất dài: chỉ dựng chừng này trang đầu (phần còn lại xem bằng "Mở ở tab mới"). */
export const MAX_RENDER_PAGES = 30;

export class RenderCancelled extends Error {}

async function fetchBytes(src: string): Promise<ArrayBuffer> {
  const res = await fetch(src, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}

export async function renderPdf(src: string, isCancelled: () => boolean): Promise<RenderedFile> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: await fetchBytes(src) });
  const doc = await task.promise;
  const urls: string[] = [];
  const dispose = () => urls.forEach((u) => URL.revokeObjectURL(u));
  try {
    const pages: RenderedPage[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_RENDER_PAGES); n++) {
      if (isCancelled()) throw new RenderCancelled();
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: RENDER_WIDTH / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("canvas");
      const url = URL.createObjectURL(blob);
      urls.push(url);

      const boxes: TextBox[] = [];
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        // Tọa độ chữ (gốc dưới-trái, đơn vị PDF) → khung xem (gốc trên-trái) → % trang. Đường chân chữ ở ~80% chiều cao dòng.
        const tx = pdfjs.Util.transform(base.transform, item.transform) as number[];
        const fontH = Math.hypot(tx[2]!, tx[3]!);
        if (!fontH || !item.width) continue;
        boxes.push({ str: item.str, x: (tx[4]! / base.width) * 100, y: ((tx[5]! - fontH * 0.85) / base.height) * 100, w: (item.width / base.width) * 100, h: (fontH * 1.1 / base.height) * 100 });
      }
      pages.push({ url, aspect: base.width / base.height, text: { page: n, boxes } });
      page.cleanup();
    }
    return { pages, totalPages: doc.numPages, dispose };
  } catch (e) {
    dispose();
    throw e;
  } finally {
    void task.destroy();
  }
}

export async function renderImage(src: string): Promise<RenderedFile> {
  const res = await fetch(src, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const url = URL.createObjectURL(await res.blob());
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { pages: [{ url, aspect: img.naturalWidth / Math.max(1, img.naturalHeight), text: { page: 1, boxes: [] } }], totalPages: 1, dispose: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}
