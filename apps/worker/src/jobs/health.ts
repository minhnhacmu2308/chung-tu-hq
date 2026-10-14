import { z } from "zod";

const Payload = z.object({ ping: z.string() });

/** Job kiểm tra đường ống queue → worker. */
export async function healthJob(raw: unknown) {
  const { ping } = Payload.parse(raw);
  return { pong: ping };
}
