# Project Memory

Tệp này ghi nhớ những điều quan trọng cần chú ý trong quá trình phát triển dự án LeadPurify.
AI và các Developer nên ghi lại các quy ước mã nguồn, các lỗi đã giải quyết nhưng dễ lặp lại, hoặc các lưu ý đặc biệt về môi trường, triển khai tại đây.

## Các lưu ý quan trọng
- Hệ thống UI sử dụng ngôn ngữ thiết kế Liquid Glass (theo tài liệu `design.md`).

## Quy ước dự án
- Giao diện: Toàn bộ thành phần UI tuân thủ chuẩn Liquid Glass với hiệu ứng blur động (backdrop-filter: blur(20px)), viền kính bán trong suốt, gradient quang học iridescent.
- Biểu tượng: Nghiêm cấm sử dụng emoji trong UI; bắt buộc sử dụng bộ icon Lucide React đồng bộ.
- Màu sắc: Không sử dụng màu đen thuần (`#000000`), thay thế bằng các sắc thái than chì/off-black (`#0c1017`, `#121722`); độ bão hòa màu accent tối đa 80%.
- Phông chữ: Sử dụng System UI stack cho nội dung chính và JetBrains Mono cho code, terminal log và các thông số kỹ thuật.
- Chiều cao khung nhìn: Luôn sử dụng `min-h-[100dvh]` để hỗ trợ tốt trên thiết bị di động.
- Quản lý hàng đợi & Chống Crash:
  - Lưu trữ an toàn: Mọi thao tác ghi `queue.json` phải thực hiện atomic (`.tmp` rồi rename) và luôn duy trì file backup `queue.json.bak` để tránh mất dữ liệu khi mất điện hoặc tắt máy đột ngột.
  - Checkpoint: Tiến trình quét lưu checkpoint sau mỗi chunk (`outputs/checkpoint_{jobId}.json`) chứa danh sách hàng đã quét, vị trí dừng, và kết quả sống/chết. Khi server tắt hoặc gặp sự cố, tiến trình được chuyển sang `INTERRUPTED` và cho phép "Tiếp tục" quét tiếp từ điểm dừng mà không bị mất dữ liệu hay tốn quota Apify.
  - Graceful Shutdown: Bắt các tín hiệu SIGINT, SIGTERM, SIGHUP, SIGBREAK, uncaughtException để đóng Puppeteer browser sạch sẽ và lưu trạng thái hàng đợi trước khi thoát process.
  - Tự động chạy lại: Khi server khởi động lại, các tiến trình `PENDING` được tự động kích hoạt xử lý sau 1.2s.

