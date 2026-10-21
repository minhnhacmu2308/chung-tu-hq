"use client";
// Trợ lý AI (mock): trả lời theo từ khóa, có độ trễ như AI thật. Khi có backend → gọi API trợ lý (stream).
import { AssistantWelcome, ChatComposer, ChatMessage, Stack, SuggestionChips, useMessages } from "@kb/ui";
import { useState } from "react";
import { ASSISTANT_MESSAGES } from "./assistant.messages";

type Msg = { role: "user" | "assistant"; text: string };

type Labels = (typeof ASSISTANT_MESSAGES)["vi"];

const hasAny = (text: string, keywords: string) => keywords.split("|").some((k) => text.includes(k));

function reply(q: string, t: Labels): string {
  const text = q.toLowerCase();
  if (hasAny(text, t.kwDeadline)) return t.replyDeadline;
  if (hasAny(text, t.kwReview)) return t.replyReview;
  if (hasAny(text, t.kwValue)) return t.replyValue;
  return t.replyDefault;
}

export function useAssistantChat() {
  const t = useMessages(ASSISTANT_MESSAGES);
  const suggestions = [t.suggestDeadline, t.suggestReview, t.suggestValue];
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);

  const send = (text: string, files: File[]) => {
    const q = text || files.map((f) => f.name).join(", ");
    if (!q) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    setTimeout(() => {
      setMessages((m) => [...m, { role: "assistant", text: reply(q, t) }]);
      setBusy(false);
    }, 900);
  };

  const content =
    messages.length === 0 ? (
      <Stack gap="lg">
        <AssistantWelcome
          name={t.name}
          role={t.role}
          description={t.description}
        />
        <SuggestionChips suggestions={suggestions} onPick={(s) => send(s, [])} />
      </Stack>
    ) : (
      <Stack gap="sm">
        {messages.map((m, i) => (
          <ChatMessage key={i} role={m.role}>{m.text}</ChatMessage>
        ))}
        {busy && <ChatMessage role="assistant" pending>{t.pending}</ChatMessage>}
      </Stack>
    );

  const composer = <ChatComposer onSend={send} busy={busy} accept=".pdf,.zip,.jpg,.png" />;
  return { content, composer, busy };
}
