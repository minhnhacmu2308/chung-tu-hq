import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CursorEffect } from "./cursor-effect.js";

function media({ fine = true, reduce = false } = {}) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("pointer: fine") ? fine : q.includes("reduce") ? reduce : false }));
}
const ring = () => document.querySelector<HTMLElement>('[data-slot="cursor-effect"]');
function move(x: number, y: number, target: EventTarget = document.body) {
  const e = new MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(e, "pointerType", { value: "mouse" });
  act(() => void target.dispatchEvent(e));
}

describe("CursorEffect", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("chuột thật: vòng sáng xuất hiện đúng vị trí con trỏ ở lần di chuyển đầu", () => {
    media();
    render(<CursorEffect />);
    expect(ring()).not.toBeNull();
    expect(ring()!.dataset.visible).toBe("false");
    move(120, 80);
    expect(ring()!.dataset.visible).toBe("true");
    expect(ring()!.style.transform).toBe("translate3d(120px, 80px, 0)");
    expect(ring()!.getAttribute("aria-hidden")).toBe("true");
  });

  it("rê lên nút → phóng to; nhấn → co lại", () => {
    media();
    render(<CursorEffect />);
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    move(10, 10, btn);
    expect(ring()!.dataset.hover).toBe("true");
    act(() => void window.dispatchEvent(new MouseEvent("pointerdown")));
    expect(ring()!.dataset.down).toBe("true");
    move(20, 20, document.body);
    expect(ring()!.dataset.hover).toBe("false");
    btn.remove();
  });

  it("giảm chuyển động hoặc màn cảm ứng → không vẽ gì", () => {
    media({ reduce: true });
    const a = render(<CursorEffect />);
    expect(ring()).toBeNull();
    a.unmount();
    media({ fine: false });
    render(<CursorEffect />);
    expect(ring()).toBeNull();
  });
});
