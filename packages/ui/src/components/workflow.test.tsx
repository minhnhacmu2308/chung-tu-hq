import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { layoutWorkflow, Stepper, WorkflowDiagram, type FlowEdge, type FlowNode } from "./workflow.js";

const NODES: FlowNode[] = [
  { id: "start", kind: "start", title: "Bắt đầu", status: "done" },
  { id: "upload", kind: "step", title: "Upload chứng từ", description: "4 file", status: "done" },
  { id: "check", kind: "decision", title: "Còn lỗi BLOCKER?", status: "done" },
  { id: "fix", kind: "step", title: "Sửa dữ liệu", status: "current" },
  { id: "agent", kind: "step", title: "AI Agent xử lý", status: "pending" },
  { id: "end", kind: "end", title: "Hoàn tất", status: "pending" },
];
const EDGES: FlowEdge[] = [
  { from: "start", to: "upload" },
  { from: "upload", to: "check" },
  { from: "check", to: "fix", label: "Có lỗi" },
  { from: "check", to: "agent", label: "Mặc định" },
  { from: "fix", to: "agent" },
  { from: "agent", to: "end" },
];

describe("layoutWorkflow", () => {
  const g = layoutWorkflow(NODES, EDGES);

  it("xếp trên → dưới theo thứ tự quy trình", () => {
    const y = (id: string) => g.nodes.find((n) => n.id === id)!.y;
    expect(y("start")).toBeLessThan(y("upload"));
    expect(y("upload")).toBeLessThan(y("check"));
    expect(y("agent")).toBeLessThan(y("end"));
  });

  it("không có hai nút chồng lên nhau", () => {
    for (const a of g.nodes)
      for (const b of g.nodes) {
        if (a.id >= b.id) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.id} chồng ${b.id}`).toBe(false);
      }
  });

  it("nút rẽ nhánh tách điểm ra riêng cho từng nhánh", () => {
    const out = g.edges.filter((e) => e.from === "check").map((e) => e.start.x);
    expect(new Set(out).size).toBe(2);
  });

  it("đường đã đi qua được đánh dấu active", () => {
    const active = g.edges.filter((e) => e.active).map((e) => `${e.from}->${e.to}`);
    expect(active).toEqual(["start->upload", "upload->check", "check->fix"]);
  });

  it("đường nối chỉ gồm đoạn ngang/dọc và không cắt qua nút không liên quan", () => {
    for (const e of g.edges) {
      // Đọc path dạng "M x,y V y H x …" thành các đoạn thẳng.
      const segs: [number, number, number, number][] = [];
      let x = 0, y = 0;
      for (const [, cmd, v] of e.d.matchAll(/([MVH])\s*([\d.,-]+)/g)) {
        if (cmd === "M") [x, y] = v!.split(",").map(Number) as [number, number];
        else {
          const [nx, ny] = cmd === "V" ? [x, Number(v)] : [Number(v), y];
          segs.push([x, y, nx, ny]);
          [x, y] = [nx, ny];
        }
      }
      expect(segs.length, `${e.from}->${e.to}: đọc được các đoạn của path`).toBeGreaterThanOrEqual(3);
      for (const n of g.nodes) {
        if (n.id === e.from || n.id === e.to) continue;
        for (const [x1, y1, x2, y2] of segs) {
          expect(x1 === x2 || y1 === y2).toBe(true);
          const hit = Math.max(x1, x2) > n.x + 1 && Math.min(x1, x2) < n.x + n.w - 1 && Math.max(y1, y2) > n.y + 1 && Math.min(y1, y2) < n.y + n.h - 1;
          expect(hit, `${e.from}->${e.to} cắt qua ${n.id}`).toBe(false);
        }
      }
    }
  });

  it("các nhánh từ cùng một nút rẽ không bắt chéo / chồng đoạn ngang lên nhau", () => {
    const branches = g.edges.filter((e) => e.from === "check");
    // Đoạn ngang đầu tiên: từ điểm ra (start.x) tới làn (giá trị H đầu tiên)
    const spans = branches.map((e) => {
      const lane = Number(/H([\d.-]+)/.exec(e.d)![1]);
      return [Math.min(e.start.x, lane), Math.max(e.start.x, lane)] as const;
    });
    const [a, b] = spans as [readonly [number, number], readonly [number, number]];
    expect(a[1] <= b[0] || b[1] <= a[0], `chồng nhau: ${a} vs ${b}`).toBe(true);
  });
});

describe("WorkflowDiagram", () => {
  it("liệt kê các bước kèm trạng thái cho trình đọc màn hình; đánh dấu bước hiện tại", () => {
    render(<WorkflowDiagram label="Quy trình hồ sơ" nodes={NODES} edges={EDGES} />);
    const list = screen.getByRole("list", { name: "Quy trình hồ sơ" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(NODES.length);
    const current = within(list).getAllByRole("listitem").find((li) => li.getAttribute("aria-current") === "step")!;
    expect(current.firstElementChild).toHaveAccessibleName("Sửa dữ liệu (đang thực hiện)");
    expect(screen.getByText("Đang ở bước này")).toBeInTheDocument();
    expect(screen.getByText("Có lỗi")).toBeInTheDocument();
  });

  it("bấm vào bước gọi onNodeClick", async () => {
    const onNodeClick = vi.fn();
    render(<WorkflowDiagram label="Quy trình" nodes={NODES} edges={EDGES} onNodeClick={onNodeClick} />);
    await userEvent.click(screen.getByRole("button", { name: /AI Agent xử lý/ }));
    expect(onNodeClick).toHaveBeenCalledWith("agent");
  });

  it("phóng to / thu nhỏ", async () => {
    const { container } = render(<WorkflowDiagram label="Quy trình" nodes={NODES} edges={EDGES} />);
    const scaled = () => Number(container.querySelector("[data-scale]")!.getAttribute("data-scale"));
    const before = scaled();
    await userEvent.click(screen.getByRole("button", { name: "Thu nhỏ" }));
    expect(scaled()).toBeLessThan(before);
    await userEvent.click(screen.getByRole("button", { name: "Phóng to" }));
    expect(scaled()).toBeCloseTo(before);
  });

  it("không vi phạm a11y", async () => {
    const { container } = render(<WorkflowDiagram label="Quy trình" nodes={NODES} edges={EDGES} onNodeClick={() => {}} />);
    await expectNoA11yViolations(container);
  });
});

describe("Stepper", () => {
  const STEPS = [
    { id: "create", label: "Tạo hồ sơ" },
    { id: "upload", label: "Upload chứng từ" },
    { id: "ocr", label: "OCR & kiểm tra" },
    { id: "agent", label: "AI Agent xử lý" },
  ];

  it("đánh dấu bước hiện tại; chỉ bước đã qua bấm được", async () => {
    const onStepClick = vi.fn();
    render(<Stepper steps={STEPS} currentId="ocr" onStepClick={onStepClick} />);
    const nav = screen.getByRole("navigation", { name: "Các bước xử lý hồ sơ" });
    expect(within(nav).getAllByRole("listitem")[2]).toHaveAttribute("aria-current", "step");
    await userEvent.click(within(nav).getByRole("button", { name: /Upload chứng từ/ }));
    expect(onStepClick).toHaveBeenCalledWith("upload");
    expect(within(nav).queryByRole("button", { name: /AI Agent xử lý/ })).not.toBeInTheDocument();
  });

  it("viewingId: đang xem lại bước đã qua – bước hiện tại bấm được để quay về, bước đang xem không bấm", async () => {
    const onStepClick = vi.fn();
    render(<Stepper steps={STEPS} currentId="ocr" viewingId="upload" onStepClick={onStepClick} />);
    const nav = screen.getByRole("navigation", { name: "Các bước xử lý hồ sơ" });
    expect(within(nav).getAllByRole("listitem")[2]).toHaveAttribute("aria-current", "step");
    expect(within(nav).queryByRole("button", { name: /Upload chứng từ/ })).not.toBeInTheDocument();
    expect(within(nav).getByText("(đang xem)")).toBeInTheDocument();
    await userEvent.click(within(nav).getByRole("button", { name: /OCR & kiểm tra/ }));
    expect(onStepClick).toHaveBeenCalledWith("ocr");
    expect(within(nav).queryByRole("button", { name: /AI Agent xử lý/ })).not.toBeInTheDocument();
  });

  it("không vi phạm a11y", async () => {
    const { container } = render(<Stepper steps={STEPS} currentId="upload" onStepClick={() => {}} action={<button type="button">Xem cây quy trình</button>} />);
    await expectNoA11yViolations(container);
  });
});

describe("layoutWorkflow – quy trình hồ sơ đầy đủ (2 điểm rẽ nhánh, đường dài)", () => {
  const ids = ["start", "create", "upload", "ocr", "blocker", "fix", "agent", "review", "submit", "channel", "inspect", "end"] as const;
  const kind = (id: string): FlowNode["kind"] => (id === "start" ? "start" : id === "end" ? "end" : id === "blocker" || id === "channel" ? "decision" : "step");
  const nodes: FlowNode[] = ids.map((id) => ({ id, kind: kind(id), title: id, description: "mô tả", status: "pending" }));
  const edges: FlowEdge[] = [
    ["start", "create"], ["create", "upload"], ["upload", "ocr"], ["ocr", "blocker"], ["blocker", "fix"], ["blocker", "agent"],
    ["fix", "agent"], ["agent", "review"], ["review", "submit"], ["submit", "channel"], ["channel", "inspect"], ["channel", "end"], ["inspect", "end"],
  ].map(([from, to]) => ({ from: from!, to: to! }));
  const g = layoutWorkflow(nodes, edges);

  it("không đường nào cắt qua nút không liên quan", () => {
    for (const e of g.edges) {
      const segs: [number, number, number, number][] = [];
      let x = 0, y = 0;
      for (const [, cmd, v] of e.d.matchAll(/([MVH])\s*([\d.,-]+)/g)) {
        if (cmd === "M") [x, y] = v!.split(",").map(Number) as [number, number];
        else {
          const [nx, ny] = cmd === "V" ? [x, Number(v)] : [Number(v), y];
          segs.push([x, y, nx, ny]);
          [x, y] = [nx, ny];
        }
      }
      expect(segs.length).toBeGreaterThanOrEqual(3);
      for (const n of g.nodes) {
        if (n.id === e.from || n.id === e.to) continue;
        for (const [x1, y1, x2, y2] of segs) {
          const hit = Math.max(x1, x2) > n.x + 1 && Math.min(x1, x2) < n.x + n.w - 1 && Math.max(y1, y2) > n.y + 1 && Math.min(y1, y2) < n.y + n.h - 1;
          expect(hit, `${e.from}->${e.to} cắt qua ${n.id}`).toBe(false);
        }
      }
    }
  });
});

describe("Stepper", () => {
  it("vùng cuộn ngang là khung định vị – chữ ẩn sr-only (absolute) của bước bị cắt theo vùng cuộn, không đẩy trang tràn ngang", () => {
    const steps = Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, label: `Bước số ${i + 1}` }));
    render(<Stepper steps={steps} currentId="s6" label="Các bước" />);
    const nav = screen.getByRole("navigation", { name: "Các bước" });
    expect(nav).toHaveClass("overflow-x-auto", "relative");
  });
});

describe("Stepper – cuộn tới bước đang xem", () => {
  it("bước đang xem nằm ngoài vùng cuộn thì được cuộn vào tầm nhìn (theo chiều ngang)", () => {
    const spy = vi.fn();
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = spy;
    try {
      const steps = Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, label: `Bước số ${i + 1}` }));
      render(<Stepper steps={steps} currentId="s6" viewingId="s6" label="Các bước" />);
      expect(spy).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
      expect(spy.mock.contexts.at(-1)).toHaveTextContent("Bước số 7");
    } finally {
      Element.prototype.scrollIntoView = orig;
    }
  });
});
