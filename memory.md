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
