import { z } from "zod";
import { parsePayload } from "./_payload.js";

const Payload = z.object({ ping: z.string() });

/** Job kiểm tra đường ống queue → worker. */
export async function healthJob(raw: unknown) {
  const { ping } = parsePayload(Payload, raw, "health");
  return { pong: ping };
}
