import { defineMessages } from "@kb/ui";

export const AVATAR_CARD_MESSAGES = defineMessages({
  vi: {
    title: "Ảnh đại diện",
    description: "Hiện ở menu người dùng và danh sách thành viên. Chưa có ảnh thì hiện chữ viết tắt tên.",
    hint: "PNG/JPG/WebP, tối đa 1 MB, nên ảnh vuông",
    saved: "Đã cập nhật ảnh đại diện",
    removed: "Đã gỡ ảnh đại diện",
    error: "Không cập nhật được ảnh đại diện",
    removeTitle: "Gỡ ảnh đại diện?",
    removeBody: "Menu và danh sách thành viên sẽ hiện chữ viết tắt tên của bạn thay cho ảnh.",
    removeConfirm: "Gỡ ảnh",
  },
  en: {
    title: "Profile picture",
    description: "Shown in the user menu and the member list. Without a picture, your initials are shown.",
    hint: "PNG/JPG/WebP, up to 1 MB, square works best",
    saved: "Profile picture updated",
    removed: "Profile picture removed",
    error: "Couldn't update the profile picture",
    removeTitle: "Remove your profile picture?",
    removeBody: "The menu and member list will show your initials instead of the picture.",
    removeConfirm: "Remove picture",
  },
  zh: {
    title: "头像",
    description: "显示在用户菜单和成员列表中。没有头像时显示姓名缩写。",
    hint: "PNG/JPG/WebP，最大 1 MB，建议使用正方形图片",
    saved: "头像已更新",
    removed: "头像已移除",
    error: "无法更新头像",
    removeTitle: "移除头像？",
    removeBody: "菜单和成员列表将显示您的姓名缩写而不是图片。",
    removeConfirm: "移除头像",
  },
});
