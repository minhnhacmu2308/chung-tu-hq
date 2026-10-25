"use client";
// Tải file về thành object URL rồi mới hiển thị (iframe PDF / <img>): header của route file (CSP sandbox, nosniff,
// redirect sang presigned URL) giữ nguyên an toàn khi mở trực tiếp, còn trình xem PDF trong trang không bị sandbox chặn.
import { useEffect, useState } from "react";

export type FileBlob = { status: "loading" } | { status: "error" } | { status: "ready"; url: string };

export type FileKind = "pdf" | "image" | "other";
const MIME: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };
const extOf = (fileName: string) => fileName.toLowerCase().split(".").pop() ?? "";
export const fileKindOf = (fileName: string): FileKind => {
  const ext = extOf(fileName);
  return ext === "pdf" ? "pdf" : ext === "png" || ext === "jpg" || ext === "jpeg" ? "image" : "other";
};
/** MIME theo đuôi file – để trình duyệt hiển thị (không tải về) cả khi kho file lưu "application/octet-stream". */
export const fileMimeOf = (fileName: string): string | undefined => MIME[extOf(fileName)];

/** `src` null → không tải. URL `blob:` (mock) dùng thẳng. Object URL tự thu hồi khi đổi file / bỏ hiển thị. */
export function useFileBlob(src: string | null, mime?: string): FileBlob {
  const [state, setState] = useState<FileBlob>({ status: "loading" });
  useEffect(() => {
    if (!src) return;
    let url: string | null = null;
    let cancelled = false;
    setState({ status: "loading" });
    const load = src.startsWith("blob:")
      ? Promise.resolve(src)
      : fetch(src, { credentials: "same-origin" }).then(async (r) => {
          if (!r.ok) throw new Error(String(r.status));
          const blob = await r.blob();
          return URL.createObjectURL(mime && blob.type !== mime ? new Blob([blob], { type: mime }) : blob);
        });
    load.then(
      (u) => {
        url = u;
        if (cancelled) URL.revokeObjectURL(u);
        else setState({ status: "ready", url: u });
      },
      () => !cancelled && setState({ status: "error" }),
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src, mime]);
  return state;
}
