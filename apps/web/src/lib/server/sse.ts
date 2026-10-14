// Server-Sent Events: nguồn sự kiện (Redis pub/sub) → luồng text/event-stream, heartbeat để proxy không cắt.
export type SseSource = {
  /** Đăng ký nhận message; trả hàm hủy đăng ký. */
  subscribe(onMessage: (data: string) => void): () => void;
  /** Gọi fn khi nguồn muốn đóng luồng (vd test hoặc shutdown). */
  onClose?(fn: () => void): void;
  heartbeatMs?: number;
};

export function sseResponse(source: SseSource): Response {
  const enc = new TextEncoder();
  let unsubscribe = () => {};
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          /* luồng đã đóng */
        }
      };
      send("event: ready\ndata: {}\n\n");
      unsubscribe = source.subscribe((data) => send(`data: ${data}\n\n`));
      timer = setInterval(() => send(": ping\n\n"), source.heartbeatMs ?? 20_000);
      source.onClose?.(() => {
        clearInterval(timer);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* đã đóng */
        }
      });
    },
    cancel() {
      clearInterval(timer);
      unsubscribe();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
