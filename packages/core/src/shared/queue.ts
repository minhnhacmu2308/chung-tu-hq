export const QUEUE_NAMES = ["health", "extract-document", "run-agent", "customs-send", "customs-poll", "skill-evaluate", "skill-sample-read", "cert-expiry"] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

/** Port đẩy job nền; hiện thực BullMQ nằm ở composition root của apps. `jobId` dùng để chống trùng; adapter BullMQ thay ":" bằng "_" (BullMQ cấm). */
export interface JobQueue {
  enqueue(name: QueueName, payload: unknown, opts?: { jobId?: string; delayMs?: number }): Promise<void>;
}

/** Cho test use case: ghi lại job đã đẩy. */
export class InMemoryJobQueue implements JobQueue {
  readonly jobs: { name: QueueName; payload: unknown; jobId?: string }[] = [];
  async enqueue(name: QueueName, payload: unknown, opts?: { jobId?: string }) {
    this.jobs.push({ name, payload, ...(opts?.jobId ? { jobId: opts.jobId } : {}) });
  }
}
