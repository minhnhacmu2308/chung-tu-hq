// Cây quy trình của một hồ sơ: trạng thái từng nút suy ra từ bước đang dở + số trường nghi ngờ + phân luồng.
import { fill, pickMessages, type FlowEdge, type FlowNode, type FlowNodeStatus, type UiLocale } from "@kb/ui";
import { STEP_ORDER, type Dossier, type StepId } from "@/mocks/types";
import { WORKFLOW_FLOW_MESSAGES } from "./dossier-detail.messages";

export function buildFlow(d: Dossier, locale: UiLocale = "vi"): { nodes: FlowNode[]; edges: FlowEdge[]; stepOf: Record<string, StepId> } {
  const t = pickMessages(WORKFLOW_FLOW_MESSAGES, locale);
  const at = STEP_ORDER.indexOf(d.step);
  const finished = d.status === "CLEARED";
  const st = (step: StepId): FlowNodeStatus => {
    const i = STEP_ORDER.indexOf(step);
    if (finished || i < at) return "done";
    return i === at ? (d.status === "CANCELLED" ? "error" : "current") : "pending";
  };
  const ocr = st("ocr");
  const needFix = d.suspectFields > 0;
  const submitted = d.status === "SUBMITTED" || finished;
  const channel = d.channel;

  const nodes: FlowNode[] = [
    { id: "start", kind: "start", title: t.start, status: "done" },
    { id: "create", kind: "step", title: t.create, description: `${d.typeCode} · ${d.partner}`, status: st("create") },
    { id: "upload", kind: "step", title: t.upload, description: t.uploadDesc, status: st("upload") },
    { id: "ocr", kind: "step", title: t.ocr, description: t.ocrDesc, status: ocr === "current" && needFix ? "done" : ocr },
    { id: "blocker", kind: "decision", title: t.blocker, status: ocr === "pending" ? "pending" : "done" },
    {
      id: "fix",
      kind: "step",
      title: t.fix,
      description: needFix ? fill(t.fixSuspect, { n: d.suspectFields }) : t.fixConfirm,
      status: ocr === "current" ? (needFix ? "current" : "skipped") : ocr === "done" ? "done" : "pending",
    },
    { id: "agent", kind: "step", title: t.agent, description: t.agentDesc, status: st("agent") },
    { id: "review", kind: "step", title: t.review, description: t.reviewDesc, status: st("review") },
    { id: "submit", kind: "step", title: t.submit, description: fill(t.submitDesc, { ops: d.direction === "NK" ? "IDA → IDC" : "EDA → EDC" }), status: submitted ? "done" : st("submit") },
    { id: "channel", kind: "decision", title: t.channel, status: channel ? "done" : "pending" },
    {
      id: "inspect",
      kind: "step",
      title: t.inspect,
      description: t.inspectDesc,
      status: !channel ? "pending" : channel === "GREEN" ? "skipped" : finished ? "done" : "current",
    },
    { id: "end", kind: "end", title: t.end, status: finished ? "done" : "pending" },
  ];
  const edges: FlowEdge[] = [
    { from: "start", to: "create" },
    { from: "create", to: "upload" },
    { from: "upload", to: "ocr" },
    { from: "ocr", to: "blocker" },
    { from: "blocker", to: "fix", label: t.yes },
    { from: "blocker", to: "agent", label: t.no },
    { from: "fix", to: "agent" },
    { from: "agent", to: "review" },
    { from: "review", to: "submit" },
    { from: "submit", to: "channel" },
    { from: "channel", to: "inspect", label: t.yellowRed },
    { from: "channel", to: "end", label: t.green },
    { from: "inspect", to: "end" },
  ];
  return { nodes, edges, stepOf: { create: "create", upload: "upload", ocr: "ocr", fix: "ocr", agent: "agent", review: "review", submit: "submit" } };
}
