#!/bin/sh
# Node x64 chạy qua Rosetta trên máy Apple Silicon kéo Chrome chạy giả lập theo → trang mất ~30 giây xử lý, e2e hết giờ.
# Ép Chrome chạy native arm64. playwright.config.ts tự dùng file này khi phát hiện trường hợp đó.
exec arch -arm64 "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "$@"
