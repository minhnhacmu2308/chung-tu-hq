// Đầu trang in tờ khai (không in). Nội dung bản in là văn bản Hải quan – chỉ tiếng Việt, theo @kb/contracts print-layout.
import { defineMessages } from "@kb/ui";

export const DECLARATION_PRINT_PAGE_MESSAGES = defineMessages({
  vi: {
    title: "In tờ khai",
    titleNo: "In tờ khai {no}",
    description: "Xem bản in rồi chọn In / Lưu PDF trên thanh công cụ (khổ A4 dọc). Tờ khai chưa có số in kèm chữ chìm \"BẢN NHÁP\".",
    backToSubmit: "Về bước Khai báo Hải quan",
    backToReview: "Về Review tờ khai",
    loadFailed: "Không tải được tờ khai",
    emptyTitle: "Chưa có tờ khai để in",
    emptyDesc: "Hồ sơ chưa dựng tờ khai. Hoàn tất các bước trước rồi quay lại để in.",
    backToDossier: "Về hồ sơ",
    paperHeading: "Bản in tờ khai",
  },
  en: {
    title: "Print declaration",
    titleNo: "Print declaration {no}",
    description: "Check the printout, then choose Print / Save PDF on the toolbar (A4 portrait). A declaration without a number prints with a draft watermark.",
    backToSubmit: "Back to the Submit to customs step",
    backToReview: "Back to declaration review",
    loadFailed: "Could not load the declaration",
    emptyTitle: "No declaration to print yet",
    emptyDesc: "This dossier has no declaration yet. Finish the earlier steps, then come back to print.",
    backToDossier: "Back to dossier",
    paperHeading: "Declaration printout",
  },
  zh: {
    title: "打印报关单",
    titleNo: "打印报关单 {no}",
    description: "查看打印预览后，在工具栏选择打印 / 保存 PDF（A4 纵向）。尚无编号的报关单打印时带草稿水印。",
    backToSubmit: "返回提交海关步骤",
    backToReview: "返回报关单审核",
    loadFailed: "无法加载报关单",
    emptyTitle: "尚无可打印的报关单",
    emptyDesc: "该档案尚未生成报关单。请先完成前面的步骤，再回来打印。",
    backToDossier: "返回档案",
    paperHeading: "报关单打印件",
  },
});
