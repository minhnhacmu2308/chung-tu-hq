// Hộp thư chứng từ: kết nối Gmail / Outlook, lấy email chứng từ, xếp file vào hồ sơ. Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/mailbox";
import * as http from "./http/mailbox";

export const mailboxKeys = mock.mailboxKeys;
export const inboxKeys = mock.inboxKeys;

export const getMailboxOverview = pick(mock.getMailboxOverview, http.getMailboxOverview);
export const startMailConnect = pick(mock.startMailConnect, http.startMailConnect);
export const disconnectMailbox = pick(mock.disconnectMailbox, http.disconnectMailbox);
export const updateMailFilters = pick(mock.updateMailFilters, http.updateMailFilters);
export const requestMailSync = pick(mock.requestMailSync, http.requestMailSync);

export const listInbox = pick(mock.listInbox, http.listInbox);
export const addInboxToDossier = pick(mock.addInboxToDossier, http.addInboxToDossier);
export const setInboxMessageStatus = pick(mock.setInboxMessageStatus, http.setInboxMessageStatus);
/** Đường dẫn mở / xem trước file đính kèm (tab mới). */
export const inboxAttachmentUrl = pick(mock.inboxAttachmentUrl, http.inboxAttachmentUrl);
