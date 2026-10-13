"use client";
// Trợ lý AI (mock): trả lời theo từ khóa, có độ trễ như AI thật. Khi có backend → gọi API trợ lý (stream).
import { AssistantWelcome, ChatComposer, ChatMessage, Stack, SuggestionChips } from "@kb/ui";
import { useState } from "react";

type Msg = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  "Hồ sơ nào sắp quá hạn khai?",
  "Vì sao HS-NK-021 cần duyệt?",
  "Tính trị giá tính thuế khi Incoterm là FCA",
];

function reply(q: string): string {
  const t = q.toLowerCase();
  if (t.includes("hạn")) return "Có 3 hồ sơ cần chú ý: 1 hồ sơ xuất khẩu đã quá hạn 1 ngày (NORDIC TOOLING), 1 hồ sơ hạn hôm nay (SHENZHEN KAIDA) và 1 hồ sơ hạn ngày mai (HANSOL PRECISION).";
  if (t.includes("021") || t.includes("duyệt")) return "HS-NK-021 còn 16 trường nghi ngờ. Quan trọng nhất: Incoterm FCA nhưng chưa có cước vận chuyển trong trị giá (BLOCKER) – hóa đơn cước GTGT đã có trong bộ chứng từ, cần xác nhận khoản cộng 1.150 USD.";
  if (t.includes("fca") || t.includes("trị giá")) return "Với FCA/EXW/FOB, trị giá tính thuế = trị giá hóa đơn + cước vận chuyển quốc tế + bảo hiểm (nếu có) đến cửa khẩu nhập đầu tiên. Cước lấy từ hóa đơn cước hoặc Arrival Notice; quy đổi theo tỷ giá tính thuế của ngày đăng ký tờ khai.";
  return "Tôi là bản mô phỏng – câu trả lời đang là dữ liệu mẫu. Bản thật sẽ đọc hồ sơ của doanh nghiệp để trả lời.";
}

export function useAssistantChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);

  const send = (text: string, files: File[]) => {
    const q = text || files.map((f) => f.name).join(", ");
    if (!q) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    setTimeout(() => {
      setMessages((m) => [...m, { role: "assistant", text: reply(q) }]);
      setBusy(false);
    }, 900);
  };

  const content =
    messages.length === 0 ? (
      <Stack gap="lg">
        <AssistantWelcome
          name="Trợ lý KhaiBáo"
          role="Trợ lý chứng từ xuất nhập khẩu"
          description="Hỏi về hồ sơ hoặc kéo bộ chứng từ vào đây – tôi chỉ ra chỗ thiếu, chỗ lệch và bước làm tiếp."
        />
        <SuggestionChips suggestions={SUGGESTIONS} onPick={(s) => send(s, [])} />
      </Stack>
    ) : (
      <Stack gap="sm">
        {messages.map((m, i) => (
          <ChatMessage key={i} role={m.role}>{m.text}</ChatMessage>
        ))}
        {busy && <ChatMessage role="assistant" pending>Đang trả lời…</ChatMessage>}
      </Stack>
    );

  const composer = <ChatComposer onSend={send} busy={busy} accept=".pdf,.zip,.jpg,.png" />;
  return { content, composer, busy };
}
