// Đầu robot hoạt hình (robot-heads, vẽ canvas) dùng làm linh vật trợ lý AI. Màu lấy từ token primary nên tự đổi theo theme/màu thương hiệu.
import { useEffect, useRef, useState } from "react";
import { RobotHead, type RobotHeadState } from "robot-heads";
import { cn } from "../lib/cn.js";

export type RobotAvatarState = RobotHeadState;

export interface RobotAvatarProps {
  /** Robot đang làm gì: idle · thinking · searching · listening · speaking · working · happy · error · sleeping. */
  state?: RobotAvatarState;
  /** Cạnh ô vuông chứa robot (px). Hiệu ứng nhảy/bóng vẽ tràn ra ngoài ô, không ảnh hưởng layout. */
  size?: number;
  /** Quay đầu theo con trỏ, click thì nhảy. */
  interactive?: boolean;
  /** Ẩn ăng-ten khi kích thước nhỏ. */
  antenna?: boolean;
  className?: string;
}

const TOKENS = ["primary", "primary-fg", "primary-subtle"] as const;
type Token = (typeof TOKENS)[number];
type TokenColors = Partial<Record<Token, string>>;

/** Canvas không hiểu `var()`/`light-dark()` nên đọc màu đã resolve qua `color` của các span dò. */
function readTokenColors(root: HTMLElement): TokenColors {
  const out: TokenColors = {};
  for (const token of TOKENS) {
    const probe = root.querySelector<HTMLElement>(`[data-token="${token}"]`);
    const color = probe && getComputedStyle(probe).color;
    if (color) out[token] = color;
  }
  return out;
}

export function RobotAvatar({ state = "idle", size = 72, interactive = true, antenna = true, className }: RobotAvatarProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  // null = chưa mount (SSR không có canvas) → chỉ render ô trống đúng kích thước.
  const [colors, setColors] = useState<TokenColors | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const read = () => setColors(readTokenColors(root));
    read();
    // Theme đổi qua data-* trên <html>; màu thương hiệu đổi qua <style> trong <head>; mode "system" đổi theo hệ điều hành.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener?.("change", read);
    return () => {
      observer.disconnect();
      media?.removeEventListener?.("change", read);
    };
  }, []);

  return (
    <span aria-hidden="true" ref={rootRef} className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }}>
      <span data-token="primary" className="sr-only text-primary" />
      <span data-token="primary-fg" className="sr-only text-primary-fg" />
      <span data-token="primary-subtle" className="sr-only text-primary-subtle" />
      {colors && (
        <RobotHead
          state={state}
          size={size}
          interactive={interactive}
          antenna={antenna}
          {...(colors.primary ? { color: colors.primary } : {})}
          {...(colors["primary-fg"] ? { screenColor: colors["primary-fg"] } : {})}
          {...(colors["primary-subtle"] ? { trimColor: colors["primary-subtle"] } : {})}
        />
      )}
    </span>
  );
}
