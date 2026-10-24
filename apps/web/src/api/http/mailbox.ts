import {
  AddInboxToDossierResultSchema, InboxMessageSchema, InboxMessageStatusSchema, MailboxOverviewSchema, MailConnectionSchema, MailSyncResultSchema, StartMailConnectResultSchema,
  type AddInboxToDossierInput, type InboxMessageStatus, type MailProvider, type UpdateMailFiltersInput,
} from "@kb/contracts";
import { z } from "zod";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/http";

const RemovedSchema = z.object({ removed: z.literal(true) });
const StatusResultSchema = z.object({ id: z.string(), status: InboxMessageStatusSchema });

export const getMailboxOverview = () => apiGet("org/mailbox", MailboxOverviewSchema);
export const startMailConnect = (provider: MailProvider) => apiPost("org/mailbox/connect", { provider }, StartMailConnectResultSchema);
export const disconnectMailbox = (id: string) => apiDelete(`org/mailbox/connections/${encodeURIComponent(id)}`, RemovedSchema);
export const updateMailFilters = (id: string, input: UpdateMailFiltersInput) =>
  apiPut(`org/mailbox/connections/${encodeURIComponent(id)}`, input, MailConnectionSchema);
export const requestMailSync = (connectionId?: string) => apiPost("org/mailbox/sync", connectionId ? { connectionId } : {}, MailSyncResultSchema);

export const listInbox = () => apiGet("org/inbox", z.array(InboxMessageSchema));
export const addInboxToDossier = (input: AddInboxToDossierInput) => apiPost("org/inbox/add", input, AddInboxToDossierResultSchema);
export const setInboxMessageStatus = (id: string, status: Extract<InboxMessageStatus, "NEW" | "IGNORED">) =>
  apiPut(`org/inbox/${encodeURIComponent(id)}/status`, { status }, StatusResultSchema);
export const inboxAttachmentUrl = (id: string) => `/api/org/inbox/attachments/${encodeURIComponent(id)}/file`;
