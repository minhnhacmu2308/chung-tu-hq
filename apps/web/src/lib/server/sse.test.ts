import { describe, expect, it } from "vitest";
import { sseResponse } from "./sse";

describe("sseResponse", () => {
  it("trả text/event-stream, gửi sự kiện ready rồi các sự kiện từ nguồn, đóng khi nguồn đóng", async () => {
    let push: (data: string) => void = () => {};
    let close: () => void = () => {};
    const res = sseResponse({
      subscribe: (onMessage) => {
        push = onMessage;
        return () => {};
      },
      onClose: (fn) => {
        close = fn;
      },
      heartbeatMs: 60_000,
    });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    const first = dec.decode((await reader.read()).value);
    expect(first).toContain("event: ready");
    push(JSON.stringify({ type: "fields.updated" }));
    const second = dec.decode((await reader.read()).value);
    expect(second).toContain('data: {"type":"fields.updated"}');
    close();
    expect((await reader.read()).done).toBe(true);
  });
});
