export type {
  BlobStore, Cipher, DossierIntake, InboxAttachmentRow, InboxMessageRow, MailboxDeps, MailboxRepos, MailboxUow, MailConnectionRow, MailProviderAdapter, MailTokens, OAuthState,
  RemoteAttachment, RemoteMessage, StateSigner,
} from "./application/ports.js";
export { MailAuthError } from "./application/ports.js";
export {
  completeMailConnect, disconnectMailbox, failMailSync, failStaleMailSyncs, getMailboxOverview, MailboxSyncPayload, requestMailSync, STALE_MAIL_SYNC_MS, startMailConnect, SYNC_BATCH, syncMailConnection,
  updateMailFilters,
} from "./application/connections.js";
export { addInboxToDossier, getInboxAttachmentFile, listInbox, setInboxMessageStatus } from "./application/inbox.js";
export { matchesMailFilters, senderAllowed } from "./domain/filters.js";
export { suggestDossier, type SuggestDossier } from "./domain/suggest.js";
