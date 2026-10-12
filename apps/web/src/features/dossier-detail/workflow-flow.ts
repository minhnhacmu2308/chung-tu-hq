// Cây quy trình của một hồ sơ: trạng thái từng nút suy ra từ bước đang dở + số trường nghi ngờ + phân luồng.
import type { FlowEdge, FlowNode, FlowNodeStatus } from "@kb/ui";
import { STEP_ORDER, type Dossier, type StepId } from "@/mocks/types";

export function buildFlow(d: Dossier): { nodes: FlowNode[]; edges: FlowEdge[]; stepOf: Record<string, StepId> } {
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
    { id: "start", kind: "start", title: "Bắt đầu", status: "done" },
    { id: "create", kind: "step", title: "Tạo hồ sơ", description: `${d.typeCode} · ${d.partner}`, status: st("create") },
    { id: "upload", kind: "step", title: "Upload chứng từ", description: "Tách trang, phân loại, bỏ bản trùng", status: st("upload") },
    { id: "ocr", kind: "step", title: "OCR & kiểm tra", description: "AI đọc + đối chiếu chéo", status: ocr === "current" && needFix ? "done" : ocr },
    { id: "blocker", kind: "decision", title: "Còn trường nghi ngờ?", status: ocr === "pending" ? "pending" : "done" },
    {
      id: "fix",
      kind: "step",
      title: "Sửa & xác nhận dữ liệu",
      description: needFix ? `${d.suspectFields} trường nghi ngờ` : "Người dùng xác nhận",
      status: ocr === "current" ? (needFix ? "current" : "skipped") : ocr === "done" ? "done" : "pending",
    },
    { id: "agent", kind: "step", title: "AI Agent xử lý", description: "Tra HS · ánh xạ · số hóa", status: st("agent") },
    { id: "review", kind: "step", title: "Review tờ khai", description: "Người duyệt phê duyệt", status: st("review") },
    { id: "submit", kind: "step", title: "Khai báo Hải quan", description: `${d.direction === "NK" ? "IDA → IDC" : "EDA → EDC"} → HYS qua Customs Hub`, status: submitted ? "done" : st("submit") },
    { id: "channel", kind: "decision", title: "Phân luồng", status: channel ? "done" : "pending" },
    {
      id: "inspect",
      kind: "step",
      title: "Kiểm tra hồ sơ / hàng",
      description: "Luồng vàng hoặc đỏ",
      status: !channel ? "pending" : channel === "GREEN" ? "skipped" : finished ? "done" : "current",
    },
    { id: "end", kind: "end", title: "Thông quan", status: finished ? "done" : "pending" },
  ];
  const edges: FlowEdge[] = [
    { from: "start", to: "create" },
    { from: "create", to: "upload" },
    { from: "upload", to: "ocr" },
    { from: "ocr", to: "blocker" },
    { from: "blocker", to: "fix", label: "Có" },
    { from: "blocker", to: "agent", label: "Không" },
    { from: "fix", to: "agent" },
    { from: "agent", to: "review" },
    { from: "review", to: "submit" },
    { from: "submit", to: "channel" },
    { from: "channel", to: "inspect", label: "Vàng / Đỏ" },
    { from: "channel", to: "end", label: "Xanh" },
    { from: "inspect", to: "end" },
  ];
  return { nodes, edges, stepOf: { create: "create", upload: "upload", ocr: "ocr", fix: "ocr", agent: "agent", review: "review", submit: "submit" } };
}
