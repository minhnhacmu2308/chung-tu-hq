"use client";
// File gốc (PDF/ảnh) dựng thành ảnh từng trang + tô vùng từng trường: rê chuột/focus vào trường bên phải → tô đúng chỗ trên
// trang; bấm vùng trên trang → nhảy tới trường. Vị trí: tọa độ AI trả (file scan/ảnh) hoặc tự tìm trong lớp chữ của PDF chuẩn.
// Không dựng được (PDF lạ, trình duyệt cũ) → `fallback` (trình xem PDF của trình duyệt, không tô được vùng).
// Chế độ "chỉ trên file" (`picking`): người dùng kéo chọn (hoặc bấm) vùng chứa giá trị → chữ trong vùng + nhãn in cạnh đó (PDF có lớp chữ).
import { Button, DocumentViewer, Spinner, cn, useMessages, type DocumentArea, type DocumentRegion } from "@kb/ui";
import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Region } from "@kb/contracts";
import { createLocator, labelNear, textIn } from "@/lib/pdf-locate";
import { RenderCancelled, renderImage, renderPdf, type RenderedFile } from "@/lib/pdf-render";
import type { DossierDocument, ExtractedField } from "@/mocks/types";
import { DOCUMENT_PREVIEW_MESSAGES } from "./common.messages";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; file: RenderedFile };

/** Lớp chữ của file đã dựng – để màn kiểm tra tìm vị trí/nhãn của giá trị người dùng sửa. `hasText` = PDF chuẩn (có lớp chữ). */
export type DocumentTextApi = { hasText: boolean; locate: (value: string) => Region | null; labelAt: (region: Region, value: string) => string | null };
export type PickResult = { text: string; label: string | null; region: Region };

/** Chữ trong vùng chọn + nhãn in cạnh đó (lớp chữ của trang; trang ảnh/scan không có chữ → rỗng). */
function pickFrom(pages: RenderedFile["pages"], a: DocumentArea): PickResult {
  const text = pages.find((p) => p.text.page === a.page)?.text;
  const value = text ? textIn(text, a) : "";
  return { text: value, label: text && value ? labelNear(text, a, value) : null, region: a };
}

export type OriginalDocumentViewerProps = {
  document: DossierDocument;
  /** Link file (presigned). Link được làm mới định kỳ – chỉ dựng lại khi đổi chứng từ, không dựng lại khi đổi link. */
  src: string;
  kind: "pdf" | "image";
  label: string;
  fields: ExtractedField[];
  highlightFieldId?: string | null;
  onFieldClick?: (fieldId: string) => void;
  fallback: ReactNode;
  className?: string;
  /** Đang chỉ trên file cho một trường: trang nhận kéo chọn thay cho bấm vùng. */
  picking?: boolean;
  onPick?: (r: PickResult) => void;
  /** Báo lớp chữ khi file dựng xong (null khi đổi file / lỗi). */
  onTextReady?: (api: DocumentTextApi | null) => void;
};

export function OriginalDocumentViewer({ document, src, kind, label, fields, highlightFieldId = null, onFieldClick, fallback, className, picking = false, onPick, onTextReady }: OriginalDocumentViewerProps) {
  const t = useMessages(DOCUMENT_PREVIEW_MESSAGES);
  const [state, setState] = useState<State>({ status: "loading" });
  const srcRef = useRef(src);
  srcRef.current = src;

  useEffect(() => {
    let cancelled = false;
    let file: RenderedFile | null = null;
    setState({ status: "loading" });
    (kind === "pdf" ? renderPdf(srcRef.current, () => cancelled) : renderImage(srcRef.current)).then(
      (f) => {
        if (cancelled) return f.dispose();
        file = f;
        setState({ status: "ready", file: f });
      },
      (e: unknown) => {
        if (!cancelled && !(e instanceof RenderCancelled)) setState({ status: "error" });
      },
    );
    return () => {
      cancelled = true;
      file?.dispose();
    };
  }, [document.id, kind]);

  const pages = state.status === "ready" ? state.file.pages : null;
  const locate = useMemo(() => (pages ? createLocator(pages.map((p) => p.text)) : null), [pages]);
  const textReady = useRef(onTextReady);
  textReady.current = onTextReady;
  useEffect(() => {
    if (!pages || !locate) return textReady.current?.(null);
    textReady.current?.({
      hasText: pages.some((p) => p.text.boxes.length > 0),
      locate,
      labelAt: (r, value) => {
        const p = pages.find((x) => x.text.page === r.page);
        return p ? labelNear(p.text, r, value) : null;
      },
    });
    return () => textReady.current?.(null);
  }, [pages, locate]);
  const regions = useMemo<DocumentRegion[]>(() => {
    if (!pages || !locate) return [];
    return fields.flatMap((f) => {
      const r = f.region ?? (f.value ? locate(f.value) : null);
      return r && r.page <= pages.length ? [{ id: f.id, page: r.page, x: r.x, y: r.y, w: r.w, h: r.h, label: f.label }] : [];
    });
  }, [pages, locate, fields]);

  if (state.status === "error") return <>{fallback}</>;
  if (!pages) {
    return (
      <div className={cn("flex items-center justify-center rounded-lg border border-border bg-surface-muted", className)}>
        <Spinner label={t.renderingFile} />
      </div>
    );
  }
  return (
    <DocumentViewer
      key={document.id}
      label={label}
      pages={pages.map((p) => (
        // Ảnh trang dựng từ file gốc; nội dung cho trình đọc màn hình nằm ở cột trường bên phải.
        <img key={p.url} src={p.url} alt="" draggable={false} className="block h-full w-full select-none" />
      ))}
      pageAspects={pages.map((p) => p.aspect)}
      pageInset={false}
      regions={regions}
      {...(picking && onPick ? { onAreaSelect: (a: DocumentArea) => onPick(pickFrom(pages, a)) } : {})}
      highlightId={highlightFieldId}
      {...(onFieldClick ? { onRegionClick: onFieldClick } : {})}
      toolbarEnd={
        <>
          <span className="min-w-0 truncate text-xs text-fg-muted" title={document.fileName}>{document.fileName}</span>
          <Button asChild size="sm" variant="ghost">
            <a href={src} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
              {t.openNewTab}
            </a>
          </Button>
        </>
      }
      {...(className ? { className } : {})}
    />
  );
}
