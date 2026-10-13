// Thanh các bước (Stepper) + sơ đồ cây quy trình (WorkflowDiagram).
import { graphlib, layout } from "@dagrejs/dagre";
import { Check, CircleAlert, GitBranch, Minus, Plus, Scan } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";

const STEPPER_MESSAGES = {
  vi: { nav: "Các bước xử lý hồ sơ", done: "(đã xong)", current: "(đang thực hiện)", todo: "(chưa tới)", viewing: "(đang xem)", stepOf: "Bước {n}/{total}" },
  en: { nav: "Dossier steps", done: "(done)", current: "(in progress)", todo: "(upcoming)", viewing: "(viewing)", stepOf: "Step {n} of {total}" },
} satisfies Messages<"nav" | "done" | "current" | "todo" | "viewing" | "stepOf">;

const DIAGRAM_MESSAGES = {
  vi: { zoomIn: "Phóng to", zoomOut: "Thu nhỏ", fit: "Vừa khung", currentBadge: "Đang ở bước này",
    done: "đã xong", current: "đang thực hiện", pending: "chưa tới", skipped: "không đi qua", error: "có lỗi" },
  en: { zoomIn: "Zoom in", zoomOut: "Zoom out", fit: "Fit", currentBadge: "You are here",
    done: "done", current: "in progress", pending: "upcoming", skipped: "not taken", error: "error" },
} satisfies Messages<"zoomIn" | "zoomOut" | "fit" | "currentBadge" | "done" | "current" | "pending" | "skipped" | "error">;

/* ===================== Stepper ===================== */

export type StepperStep = { id: string; label: string };

export type StepperProps = {
  steps: readonly StepperStep[];
  currentId: string;
  /** Bước đang xem khi quay lại xem bước đã qua (mặc định = currentId). Bước hiện tại khi đó bấm được để quay về. */
  viewingId?: string;
  /** Bấm vào bước đã qua để quay lại xem. Bước chưa tới không bấm được. */
  onStepClick?: (id: string) => void;
  /** Vùng bên phải, vd nút "Xem cây quy trình". */
  action?: ReactNode;
  label?: string;
  className?: string;
};

export function Stepper({ steps, currentId, viewingId, onStepClick, action, label, className }: StepperProps) {
  const t = useMessages(STEPPER_MESSAGES);
  const currentIndex = Math.max(0, steps.findIndex((s) => s.id === currentId));
  const viewing = viewingId ?? currentId;
  const viewingIndex = Math.max(0, steps.findIndex((s) => s.id === viewing));
  return (
    <div className={cn("flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2", className)}>
      {/* Màn nhỏ: gọn thành 1 dòng "Bước 3/6 · OCR & kiểm tra" (ẩn với trình đọc màn hình vì danh sách đầy đủ vẫn đọc được) */}
      <p aria-hidden="true" className="min-w-0 flex-1 truncate text-sm sm:hidden">
        <span className="text-fg-muted">{t.stepOf.replace("{n}", String(viewingIndex + 1)).replace("{total}", String(steps.length))} · </span>
        <span className="font-medium text-fg">{steps[viewingIndex]?.label}</span>
      </p>
      <nav aria-label={label ?? t.nav} className="min-w-0 flex-1 overflow-x-auto max-sm:sr-only">
        <ol className="flex items-center gap-1">
          {steps.map((s, i) => {
            const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "todo";
            const isViewing = s.id === viewing;
            const clickable = state !== "todo" && !isViewing && !!onStepClick;
            const inner = (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    state === "done" && "border-primary bg-primary text-primary-fg",
                    state === "current" && "border-primary text-primary",
                    state === "todo" && "border-border-strong text-fg-subtle",
                  )}
                >
                  {state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={cn("whitespace-nowrap text-sm", state === "current" ? "font-medium text-fg" : "text-fg-muted")}>{s.label}</span>
                <span className="sr-only">{state === "done" ? t.done : state === "current" ? t.current : t.todo}</span>
                {isViewing && viewing !== currentId && <span className="sr-only">{t.viewing}</span>}
              </>
            );
            return (
              <li key={s.id} className="flex items-center gap-1" aria-current={state === "current" ? "step" : undefined}>
                {clickable ? (
                  <button type="button" onClick={() => onStepClick(s.id)} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                    {inner}
                  </button>
                ) : (
                  <span className={cn("flex items-center gap-2 rounded-md px-2 py-1", isViewing && "bg-primary-subtle")}>{inner}</span>
                )}
                {i < steps.length - 1 && <span aria-hidden="true" className={cn("mx-0.5 h-px w-3 shrink-0 xl:mx-1 xl:w-6", i < currentIndex ? "bg-primary" : "bg-border-strong")} />}
              </li>
            );
          })}
        </ol>
      </nav>
      {action}
    </div>
  );
}

/* ===================== WorkflowDiagram ===================== */

export type FlowNodeKind = "start" | "end" | "step" | "decision";
export type FlowNodeStatus = "done" | "current" | "pending" | "skipped" | "error";

export type FlowNode = {
  id: string;
  kind: FlowNodeKind;
  title: string;
  description?: string;
  status?: FlowNodeStatus;
};
export type FlowEdge = { from: string; to: string; label?: string };

export type WorkflowDiagramProps = {
  nodes: readonly FlowNode[];
  edges: readonly FlowEdge[];
  /** Tên sơ đồ cho trình đọc màn hình. */
  label: string;
  onNodeClick?: (id: string) => void;
  className?: string;
  labels?: Partial<Record<FlowNodeStatus | "zoomIn" | "zoomOut" | "fit" | "currentBadge", string>>;
};

const SIZE: Record<FlowNodeKind, { w: number; h: number }> = {
  start: { w: 88, h: 88 },
  end: { w: 88, h: 88 },
  step: { w: 232, h: 64 },
  decision: { w: 232, h: 56 },
};
const PAD = 32;

type Pt = { x: number; y: number };
type Placed = FlowNode & { x: number; y: number; w: number; h: number };
type Routed = FlowEdge & { d: string; label?: string; labelAt?: Pt; active: boolean; dimmed: boolean; start: Pt; end: Pt };

/** Bố cục bằng dagre (trên → dưới), rồi vẽ đường gấp khúc vuông góc qua các điểm dagre trả về. */
export function layoutWorkflow(nodes: readonly FlowNode[], edges: readonly FlowEdge[]) {
  const g = new graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: "TB", nodesep: 48, ranksep: 56, edgesep: 24, marginx: PAD, marginy: PAD });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: SIZE[n.kind].w, height: SIZE[n.kind].h });
  edges.forEach((e, i) => g.setEdge(e.from, e.to, {}, `e${i}`));
  layout(g);

  const placed = new Map<string, Placed>();
  for (const n of nodes) {
    const p = g.node(n.id);
    const { w, h } = SIZE[n.kind];
    placed.set(n.id, { ...n, x: p.x - w / 2, y: p.y - h / 2, w, h });
  }

  // Làn đi dọc của mỗi cạnh: nối thẳng nếu đích ở ngay dưới; đường dài đi theo cột "nút ảo"
  // dagre chừa sẵn nên không cắt qua nút khác.
  const lanes = edges.map((e, i) => {
    const t = placed.get(e.to)!;
    const mids = (g.edge({ v: e.from, w: e.to, name: `e${i}` })?.points ?? []).slice(1, -1);
    return mids.length > 2 ? mids[Math.floor(mids.length / 2)]!.x : t.x + t.w / 2;
  });

  // Nút rẽ nhánh: chia điểm ra ở đáy theo THỨ TỰ LÀN trái → phải, để các nhánh không bắt chéo nhau.
  const handleX = new Map<number, number>();
  const bySource = new Map<string, number[]>();
  edges.forEach((e, i) => bySource.set(e.from, [...(bySource.get(e.from) ?? []), i]));
  for (const [from, idx] of bySource) {
    const s = placed.get(from)!;
    if (idx.length < 2 || s.kind !== "decision") continue;
    [...idx].sort((a, b) => lanes[a]! - lanes[b]!).forEach((edgeIdx, k) => handleX.set(edgeIdx, s.x + (s.w * (k + 1)) / (idx.length + 1)));
  }

  const status = (id: string) => placed.get(id)?.status ?? "pending";
  const routed: Routed[] = edges.map((e, i) => {
    const s = placed.get(e.from)!;
    const t = placed.get(e.to)!;
    const start = { x: handleX.get(i) ?? s.x + s.w / 2, y: s.y + s.h };
    const end = { x: t.x + t.w / 2, y: t.y };
    const lane = lanes[i]!;
    const y1 = start.y + 20; // rẽ ngay dưới điểm ra
    const y2 = end.y - 16; // nhập vào ngay trên nút đích
    const d = `M${start.x},${start.y} V${y1} H${lane} V${y2} H${end.x} V${end.y}`;
    const labelAt: Pt | undefined = e.label ? { x: lane, y: y1 + 14 } : undefined;
    const fromS = status(e.from);
    const toS = status(e.to);
    return {
      ...e,
      d,
      start,
      end,
      ...(labelAt ? { labelAt } : {}),
      active: fromS === "done" && (toS === "done" || toS === "current"),
      dimmed: toS === "skipped",
    };
  });

  const graph = g.graph();
  return { nodes: [...placed.values()], edges: routed, width: graph.width ?? 0, height: graph.height ?? 0 };
}

export function WorkflowDiagram({ nodes, edges, label, onNodeClick, className, labels }: WorkflowDiagramProps) {
  const l = useMessages(DIAGRAM_MESSAGES, labels);
  const graph = useMemo(() => layoutWorkflow(nodes, edges), [nodes, edges]);
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const fit = () => {
    const w = viewport.current?.clientWidth ?? 0;
    // Khớp theo chiều ngang, tối đa 100% – sơ đồ dài thì cuộn dọc như canvas.
    if (!w || !graph.width) return setScale(1);
    setScale(Math.max(0.4, Math.min(1, (w - 16) / graph.width)));
  };
  useLayoutEffect(fit, [graph]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn("relative flex min-h-80 flex-col overflow-hidden rounded-lg border border-border bg-dots", className)}>
      <div className="absolute right-2 top-2 z-10 flex gap-0.5 rounded-md border border-border bg-surface p-0.5 shadow-sm">
        {[
          { label: l.zoomOut, icon: <Minus className="h-4 w-4" />, on: () => setScale((s) => Math.max(0.4, +(s - 0.1).toFixed(2))) },
          { label: l.zoomIn, icon: <Plus className="h-4 w-4" />, on: () => setScale((s) => Math.min(1.6, +(s + 0.1).toFixed(2))) },
          { label: l.fit, icon: <Scan className="h-4 w-4" />, on: fit },
        ].map((b) => (
          <button key={b.label} type="button" aria-label={b.label} onClick={b.on}
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            <span aria-hidden="true">{b.icon}</span>
          </button>
        ))}
      </div>

      <div ref={viewport} className="min-h-0 flex-1 overflow-auto">
        <div
          data-scale={scale}
          className="relative mx-auto origin-top-left"
          style={{ width: graph.width * scale, height: graph.height * scale }}
        >
          <div className="absolute left-0 top-0 origin-top-left" style={{ width: graph.width, height: graph.height, transform: `scale(${scale})` }}>
            <svg aria-hidden="true" width={graph.width} height={graph.height} className="absolute inset-0 overflow-visible">
              <defs>
                <marker id="kb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" className="fill-border-strong" />
                </marker>
                <marker id="kb-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" className="fill-primary" />
                </marker>
              </defs>
              {graph.edges.map((e, i) => (
                <g key={i} data-edge={`${e.from}->${e.to}`} data-active={e.active}>
                  <path
                    d={e.d}
                    fill="none"
                    strokeWidth={e.active ? 2 : 1.5}
                    strokeDasharray={e.dimmed ? "4 4" : undefined}
                    markerEnd={`url(#${e.active ? "kb-arrow-active" : "kb-arrow"})`}
                    className={e.active ? "stroke-primary" : "stroke-border-strong"}
                  />
                  <circle cx={e.start.x} cy={e.start.y} r={4} strokeWidth={1.5} className={cn("fill-surface", e.active ? "stroke-primary" : "stroke-info")} />
                </g>
              ))}
            </svg>

            {graph.edges.map((e, i) =>
              e.label && e.labelAt ? (
                <span
                  key={`l${i}`}
                  aria-hidden="true"
                  className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm border border-border bg-surface-muted px-1.5 py-0.5 text-xs text-fg-muted"
                  style={{ left: e.labelAt.x, top: e.labelAt.y }}
                >
                  {e.label}
                </span>
              ) : null,
            )}

            {/* role tường minh: display:contents có thể làm mất ngữ nghĩa danh sách */}
            <ol role="list" aria-label={label} className="contents">
              {graph.nodes.map((n) => {
                const st = n.status ?? "pending";
                const round = n.kind === "start" || n.kind === "end";
                const Tag = onNodeClick ? "button" : "div";
                return (
                  <li key={n.id} role="listitem" className="contents" aria-current={st === "current" ? "step" : undefined}>
                    <Tag
                      {...(onNodeClick ? { type: "button" as const, onClick: () => onNodeClick(n.id) } : {})}
                      data-node={n.id}
                      data-status={st}
                      aria-label={`${n.title}${n.description ? ` – ${n.description}` : ""} (${l[st]})`}
                      className={cn(
                        "absolute flex text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                        round
                          ? "items-center justify-center rounded-full border-2 text-sm font-semibold"
                          : "flex-col justify-center gap-0.5 rounded-lg border px-4 shadow-sm",
                        n.kind === "start" && "border-success bg-success-subtle text-success-subtle-fg",
                        n.kind === "end" && (st === "done" ? "border-success bg-success-subtle text-success-subtle-fg" : "border-fg bg-surface text-fg"),
                        n.kind === "step" && "border-border bg-surface",
                        n.kind === "decision" && "flex-row items-center justify-start gap-2 border-warning bg-warning-subtle",
                        st === "current" && "ring-2 ring-primary ring-offset-2 ring-offset-bg",
                        st === "error" && "border-danger",
                        (st === "pending" || st === "skipped") && !round && "border-dashed",
                        st === "skipped" && "opacity-50",
                        onNodeClick && "cursor-pointer hover:shadow-md",
                      )}
                      style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
                    >
                      {round ? (
                        <span aria-hidden="true">{n.title}</span>
                      ) : (
                        <>
                          {n.kind === "decision" && <GitBranch aria-hidden="true" className="h-4 w-4 shrink-0 text-warning" />}
                          <span aria-hidden="true" className={cn("truncate text-sm font-semibold", st === "pending" ? "text-fg-muted" : "text-fg")}>{n.title}</span>
                          {n.description && n.kind === "step" && (
                            <span aria-hidden="true" className="truncate text-xs text-fg-subtle">{n.description}</span>
                          )}
                        </>
                      )}
                      {st === "done" && !round && (
                        <span aria-hidden="true" className="absolute -right-2 -top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-fg">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                      {st === "error" && (
                        <span aria-hidden="true" className="absolute -right-2 -top-2 text-danger"><CircleAlert className="h-5 w-5" /></span>
                      )}
                      {st === "current" && (
                        <span aria-hidden="true" className="absolute -top-3 left-3 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-fg shadow-sm">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-fg motion-reduce:animate-none" />
                          {l.currentBadge}
                        </span>
                      )}
                    </Tag>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
