import { defineMessages } from "@kb/ui";

export const FORMAT_MESSAGES = defineMessages({
  vi: { justNow: "vừa xong", minutesAgo: "{n} phút trước", hoursAgo: "{n} giờ trước", daysAgo: "{n} ngày trước", overdue: "Quá hạn {n} ngày", dueToday: "Hạn hôm nay", dueIn: "Còn {n} ngày" },
  en: { justNow: "just now", minutesAgo: "{n} min ago", hoursAgo: "{n} h ago", daysAgo: "{n} days ago", overdue: "Overdue {n} days", dueToday: "Due today", dueIn: "{n} days left" },
  zh: { justNow: "刚刚", minutesAgo: "{n} 分钟前", hoursAgo: "{n} 小时前", daysAgo: "{n} 天前", overdue: "已逾期 {n} 天", dueToday: "今天到期", dueIn: "剩余 {n} 天" },
});
