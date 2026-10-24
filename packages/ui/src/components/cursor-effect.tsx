// Hiệu ứng con trỏ: vòng sáng màu thương hiệu đi theo chuột, phóng to khi rê lên phần tử bấm được, co lại khi nhấn.
// Chỉ bật với chuột thật (pointer: fine) và khi người dùng không yêu cầu giảm chuyển động. Không chặn thao tác (pointer-events: none).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const INTERACTIVE =
  'a[href],button,input,select,textarea,label,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="option"],[role="radio"],[role="checkbox"],[role="switch"],[data-cursor="hover"]';
/** Hệ số đuổi theo mỗi khung hình (0–1): càng lớn vòng càng bám sát con trỏ. */
const FOLLOW = 0.28;

function supported(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CursorEffect() {
  const [enabled, setEnabled] = useState(false);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => setEnabled(supported()), []);

  useEffect(() => {
    if (!enabled) return;
    const el = ring.current;
    if (!el) return;
    const target = { x: 0, y: 0 };
    const pos = { x: 0, y: 0 };
    let frame = 0;
    let shown = false;

    const paint = () => {
      el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    };
    const tick = () => {
      pos.x += (target.x - pos.x) * FOLLOW;
      pos.y += (target.y - pos.y) * FOLLOW;
      paint();
      frame = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y) > 0.3 ? requestAnimationFrame(tick) : 0;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      target.x = e.clientX;
      target.y = e.clientY;
      if (!shown) {
        // Lần đầu (hoặc quay lại cửa sổ): đặt ngay tại con trỏ, không trượt từ góc màn hình vào.
        pos.x = target.x;
        pos.y = target.y;
        paint();
        shown = true;
        el.dataset.visible = "true";
      }
      const t = e.target instanceof Element ? e.target : null;
      el.dataset.hover = t?.closest(INTERACTIVE) ? "true" : "false";
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onDown = () => void (el.dataset.down = "true");
    const onUp = () => void (el.dataset.down = "false");
    const onLeave = (e: PointerEvent) => {
      if (e.relatedTarget) return;
      shown = false;
      el.dataset.visible = "false";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointerout", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerout", onLeave);
    };
  }, [enabled]);

  if (!enabled) return null;
  return createPortal(
    <div
      ref={ring}
      aria-hidden="true"
      data-slot="cursor-effect"
      data-visible="false"
      className="group pointer-events-none fixed left-0 top-0 z-[100] opacity-0 transition-opacity duration-200 data-[visible=true]:opacity-100"
    >
      <span
        className={
          "block size-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/50 bg-primary/15 " +
          "transition-[scale,background-color,border-color] duration-200 ease-out " +
          "group-data-[hover=true]:scale-150 group-data-[hover=true]:border-primary/70 group-data-[hover=true]:bg-primary/10 " +
          "group-data-[down=true]:scale-75 group-data-[down=true]:bg-primary/25"
        }
      />
    </div>,
    document.body,
  );
}
