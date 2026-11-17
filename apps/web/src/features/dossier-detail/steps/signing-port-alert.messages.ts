import { defineMessages } from "@kb/ui";

export const SIGNING_PORT_MESSAGES = defineMessages({
  vi: {
    title: "Chưa mở cổng ký số – chưa khai báo được",
    body: "Máy ký chưa khởi động cổng ký. Cắm chữ ký số vào máy ký và khởi động cổng ký Internet, rồi gửi lại. Không cần sửa dữ liệu đã khai.",
  },
  en: {
    title: "Signing port not started – cannot declare yet",
    body: "The signing machine has not started its signing port. Plug the digital signature into the signing machine and start the Internet signing port, then send again. The declared data does not need changes.",
  },
  zh: {
    title: "签名端口未启动 – 暂时无法申报",
    body: "签名服务器尚未启动签名端口。请将数字签名插入签名服务器并启动互联网签名端口，然后重新发送。已申报的数据无需修改。",
  },
});
