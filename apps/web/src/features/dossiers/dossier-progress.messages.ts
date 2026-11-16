import { defineMessages } from "@kb/ui";

/** Nhãn tiến độ hồ sơ (ProgressCode), dòng phụ (ProgressSub), luồng và cờ – spec trang-thai-ho-so §3.1, §4.2. */
export const DOSSIER_PROGRESS_MESSAGES = defineMessages({
  vi: {
    PROCESSING: "Đang xử lý chứng từ", NEEDS_REVIEW: "Cần kiểm tra", APPROVED_WAITING: "Đã duyệt, chờ truyền", SENDING: "Đang gửi",
    SEND_FAILED: "Truyền lỗi", RECALLING: "Đang gọi sửa", POST_EDITING: "Đang khai sửa sau thông quan",
    flagRejected: "Bị từ chối", flagSendFailed: "Truyền lỗi",
    tabAll: "Tất cả", tabTodo: "Việc cần làm", tabAwaitOfficial: "Chờ khai chính thức", tabChannelled: "Đã phân luồng", tabCleared: "Đã thông quan", tabAttention: "Cần chú ý",
    tabsLabel: "Lọc theo việc cần làm", channelFilter: "Luồng", channelAll: "Mọi luồng",
    emptyTodo: "Không có hồ sơ cần làm", emptyTodoDesc: "Hồ sơ chưa khai tạm (đang đọc chứng từ, cần kiểm tra, chờ truyền) sẽ hiện ở đây.",
    emptyAwaitOfficial: "Không có hồ sơ chờ khai chính thức", emptyAwaitOfficialDesc: "Hồ sơ đã khai tạm, chờ khai chính thức sẽ hiện ở đây.",
    emptyChannelled: "Không có hồ sơ đã phân luồng", emptyChannelledDesc: "Hồ sơ đã được Hải quan phân luồng, đang chờ thông quan sẽ hiện ở đây.",
    emptyCleared: "Chưa có hồ sơ thông quan", emptyClearedDesc: "Hồ sơ có mọi tờ khai đã thông quan sẽ hiện ở đây.",
    emptyAttention: "Không có hồ sơ cần chú ý", emptyAttentionDesc: "Không có tờ khai nào truyền lỗi hoặc bị Hải quan từ chối.",
  },
  en: {
    PROCESSING: "Processing documents", NEEDS_REVIEW: "Needs check", APPROVED_WAITING: "Approved, awaiting submission", SENDING: "Sending",
    SEND_FAILED: "Send failed", RECALLING: "Recalling for edit", POST_EDITING: "Amending after clearance",
    flagRejected: "Rejected", flagSendFailed: "Send failed",
    tabAll: "All", tabTodo: "To do", tabAwaitOfficial: "Awaiting official declaration", tabChannelled: "Channel assigned", tabCleared: "Cleared", tabAttention: "Needs attention",
    tabsLabel: "Filter by next action", channelFilter: "Channel", channelAll: "All channels",
    emptyTodo: "No dossiers to work on", emptyTodoDesc: "Dossiers not yet pre-declared (reading documents, needing checks, awaiting submission) appear here.",
    emptyAwaitOfficial: "No dossiers awaiting official declaration", emptyAwaitOfficialDesc: "Pre-declared dossiers waiting for the official declaration appear here.",
    emptyChannelled: "No dossiers with a channel assigned", emptyChannelledDesc: "Dossiers that Customs has assigned a channel to and that await clearance appear here.",
    emptyCleared: "No cleared dossiers yet", emptyClearedDesc: "Dossiers whose declarations have all been cleared appear here.",
    emptyAttention: "No dossiers need attention", emptyAttentionDesc: "No declaration failed to send or was rejected by Customs.",
  },
  zh: {
    PROCESSING: "正在处理单证", NEEDS_REVIEW: "需检查", APPROVED_WAITING: "已批准，待发送", SENDING: "发送中",
    SEND_FAILED: "发送失败", RECALLING: "正在调回修改", POST_EDITING: "正在通关后修改申报",
    flagRejected: "被拒绝", flagSendFailed: "发送失败",
    tabAll: "全部", tabTodo: "待办", tabAwaitOfficial: "待正式申报", tabChannelled: "已分流", tabCleared: "已通关", tabAttention: "需关注",
    tabsLabel: "按待办事项筛选", channelFilter: "通道", channelAll: "全部通道",
    emptyTodo: "没有待办档案", emptyTodoDesc: "尚未暂时申报的档案（正在读取单证、需检查、待发送）将显示在这里。",
    emptyAwaitOfficial: "没有待正式申报的档案", emptyAwaitOfficialDesc: "已暂时申报、等待正式申报的档案将显示在这里。",
    emptyChannelled: "没有已分流的档案", emptyChannelledDesc: "海关已分流、等待通关的档案将显示在这里。",
    emptyCleared: "暂无已通关档案", emptyClearedDesc: "所有报关单均已通关的档案将显示在这里。",
    emptyAttention: "没有需关注的档案", emptyAttentionDesc: "没有发送失败或被海关拒绝的报关单。",
  },
});
