export type {
  BlobStore, Cipher, DossierIntake, InboxAttachmentRow, InboxMessageRow, MailboxDeps, MailboxRepos, MailboxUow, MailConnectionRow, MailProviderAdapter, MailTokens, OAuthState,
  RemoteAttachment, RemoteMessage, StateSigner,
} from "./application/ports.js";
export { MailAuthError } from "./application/ports.js";
export {
  completeMailConnect, disconnectMailbox, failMailSync, getMailboxOverview, MailboxSyncPayload, requestMailSync, startMailConnect, SYNC_BATCH, syncMailConnection,
} from "./application/connections.js";
export { addInboxToDossier, getInboxAttachmentFile, listInbox, setInboxMessageStatus } from "./application/inbox.js";
export { suggestDossier, type SuggestDossier } from "./domain/suggest.js";
