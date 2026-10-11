# Project Tasks

Tệp này dùng để quản lý các task (nhiệm vụ) trong dự án LeadPurify.
Mỗi khi cần thực hiện một tính năng mới, fix bug, hay thay đổi code, các bước thực hiện chi tiết phải được ghi chép vào đây trước khi bắt đầu code thực tế.

## Các Task Đang Thực Hiện
- [ ] Chưa có task nào.

## Task Đã Hoàn Thành
- [x] Thêm chức năng tạm dừng toàn bộ, dừng toàn bộ, và xóa toàn bộ tiến trình trong hàng đợi:
  - [x] Backend (`server.js`): Thêm endpoint `POST /api/queue/batch-pause` tạm dừng an toàn tất cả các tiến trình đang chạy và chờ.
  - [x] Backend (`server.js`): Thêm endpoint `POST /api/queue/batch-stop` dừng toàn bộ các tiến trình, đóng browser, lưu kết quả tạm thời partial CSV và chuyển sang Lịch sử.
  - [x] Backend (`server.js`): Thêm endpoint `POST /api/queue/batch-clear` xóa toàn bộ tiến trình trong hàng đợi và dọn dẹp các tệp liên quan.
  - [x] Backend (`server.js`): Cập nhật endpoint `POST /api/queue/batch-resume` và action `resume` để tiếp tục mượt mà cả tiến trình đang chạy tạm dừng và tiến trình đang chờ.
  - [x] Frontend (`App.jsx`): Thêm các nút "Tạm dừng toàn bộ", "Dừng toàn bộ", "Xóa toàn bộ tiến trình", "Tiếp tục toàn bộ" trên thanh công cụ Hàng đợi (`Queue Actions Toolbar`) kèm dialog xác nhận bảo vệ an toàn.
- [x] Nén hàng loạt kết quả Link Sống và Link Chết thành 1 file ZIP:
  - [x] Backend (`zipHelper.js`): Xây dựng bộ tạo kho lưu trữ chuẩn PKZIP (.zip) bằng Node.js `zlib` (Deflate & Store mode, CRC-32 table, hỗ trợ UTF-8 filename), không phụ thuộc thư viện ngoài.
  - [x] Backend (`server.js`): Thêm endpoint `GET /api/download-batch-zip/:type` (hỗ trợ `type=alive` hoặc `type=dead`), tự động lọc dữ liệu CSV, xóa cột thừa bằng `cleanRowForDownload` và tạo file ZIP gắn nhãn thời gian.
  - [x] Frontend (`App.jsx`): Cập nhật 2 nút "Tải Link Sống" và "Tải Link Chết" trên thanh công cụ Lịch sử để tải trọn gói 1 file ZIP duy nhất, hiển thị trạng thái "Đang nén ZIP..." kèm icon xoay mượt mà khi đang xử lý.
- [x] Tích hợp cơ chế tự động xóa file kết quả (outputs) & file tải lên (uploads) khi xóa lịch sử / xóa tiến trình và bổ sung chức năng dọn dẹp ổ cứng:
  - [x] Backend (`server.js`): Thêm các hàm `getJobFilePaths`, `deleteJobFiles`, `cleanAllOrphanedFiles` để tìm và xóa an toàn các tệp CSV kết quả, tệp gốc upload, và checkpoint liên quan.
  - [x] Backend (`server.js`): Cập nhật endpoint `POST /api/clear-history` tự động xóa tất cả file liên quan đến các job lịch sử và dọn sạch file mồ côi; trả về số lượng tệp đã xóa và dung lượng giải phóng.
  - [x] Backend (`server.js`): Cập nhật action `remove` (`POST /api/queue/:id/remove`) tự động xóa file của job khi người dùng xóa khỏi danh sách.
  - [x] Backend (`server.js`): Bổ sung endpoint `POST /api/clean-storage` để quét và dọn dẹp tất cả các file mồ côi trong `outputs/` và `uploads/`.
  - [x] Frontend (`App.jsx`): Cập nhật hộp thoại xác nhận khi xóa tiến trình và xóa toàn bộ lịch sử; bổ sung nút "Dọn dẹp ổ cứng" trên thanh công cụ Lịch sử.
- [x] Nâng cấp độ phân giải ảnh Avatar từ Apify API lên chuẩn HD:
  - [x] Phân tích cơ chế URL từ Apify (`post.user.profilePic`): Facebook CDN sinh mặc định `ctp=s50x50` (50x50 thumbnail).
  - [x] Xây dựng hàm `optimizeFacebookAvatarUrl`: Loại bỏ tham số thumbnail `ctp` để Facebook CDN tự động trả về ảnh gốc độ phân giải cao theo tỷ lệ `cstp` (từ 720x720 đến 2000x2000 px, dung lượng từ ~800 bytes tăng lên 40KB - 250KB).
  - [x] Cập nhật Backend (`server.js`): Tự động tối ưu hóa URL avatar sang HD khi quét bằng Apify và Puppeteer, đồng thời áp dụng khi người dùng tải CSV.
  - [x] Di chuyển & cập nhật hàng loạt (Migration) 25 file kết quả và checkpoint hiện có trong `outputs/` với 211 URL ảnh đại diện được nâng cấp lên HD hoàn chỉnh.
- [x] Task: Di chuyển 2 cột `Active_Within_*_Months` và `Latest_Post_Date` về cuối file CSV và xóa khi download:
  - [x] 1. Backend: Thêm hàm tiện ích `reorderRowColumns` để luôn sắp xếp 2 cột kiểm tra hoạt động (`Active_Within_*_Months`, `Latest_Post_Date`) về cuối cùng của mỗi row khi lưu file CSV (hoàn thành job & checkpoint).
  - [x] 2. Backend: Cập nhật route `GET /api/download/:filename` để tự động loại bỏ 2 cột này khi tải về (hỗ trợ `?preview=true` để phục vụ xem trước).
  - [x] 3. Frontend (`CsvEditorModal.jsx`): Tự động sắp xếp 2 cột này về cuối bảng khi xem trước; xóa bỏ 2 cột này khi xác nhận tải xuống từ modal (`mode === 'download'`).
  - [x] 4. Frontend (`App.jsx`): Cập nhật `handlePreviewHistory` truyền tham số `?preview=true` để tải đầy đủ dữ liệu khi xem trước.
  - [x] 5. Kiểm thử toàn bộ luồng: Kiểm tra xuất file, tải trực tiếp, tải hàng loạt, xem trước và tải từ modal.
- [x] Task Resilience & Crash Recovery: Xử lý pending chạy lại, server đóng đột ngột, checkpointing & khôi phục dữ liệu:
  - [x] 1. Xây dựng cơ chế Checkpoint & Lưu trữ an toàn (Safe/Atomic Write cho `queue.json`, Backup file `.bak`, lưu tiến độ trung gian `checkpoint_{jobId}.json`).
  - [x] 2. Xử lý đóng server đột ngột & Graceful Shutdown (Bắt sự kiện SIGINT, SIGTERM, uncaughtException, đóng Puppeteer browsers sạch sẽ, cập nhật trạng thái INTERRUPTED cho job đang chạy).
  - [x] 3. Cơ chế Tự động khôi phục khi Server khởi động lại (Startup Recovery: Tự động chạy lại các job PENDING, phát hiện job INTERRUPTED và cho phép tiếp tục/chạy lại, khôi phục hàng đợi từ backup nếu file hỏng).
  - [x] 4. Bổ sung API endpoints Backend (`/retry`, `/resume`, `/batch-retry`, `/batch-resume`, `/trigger`, `/shutdown`, bảo vệ `isWorkerRunning` bằng try-finally).
  - [x] 5. Nâng cấp Giao diện Frontend (`App.jsx`):
    - Hiển thị badge trạng thái `INTERRUPTED` (Bị gián đoạn) và badge Checkpoint đã lưu.
    - Bổ sung nút "Tiếp tục" (Resume from checkpoint) và "Chạy lại" (Retry from beginning) cho các job Lỗi / Gián đoạn / Đã hủy.
    - Bổ sung nút "Chạy lại tất cả lỗi / gián đoạn" và "Kích hoạt lại hàng đợi" trên thanh công cụ.
    - Tự động đồng bộ và khôi phục kết nối Socket.IO khi server restart, hiển thị trạng thái kết nối server trên Header.
  - [x] 6. Cập nhật kịch bản khởi động/tắt máy (`run.bat`, `stop.bat`) để hỗ trợ Graceful Shutdown và kiểm tra đầy đủ cổng 5173 / 5174.
  - [x] 7. Kiểm thử tổng thể qua browser subagent (không có lỗi console, giao diện phản hồi mượt mà, đầy đủ các nút chức năng).
- [x] Tạo `context.md`, `memory.md`, `task.md` và các Rule cho AI.
- [x] Gộp màn hình Hàng đợi và Kiểm tra hoạt động thành 1, bổ sung tùy chọn linh hoạt (link sống chết, avatar, Apify).
- [x] Hiển thị nhãn mô tả tiến trình đã sửa ảnh bằng Apify trong màn hình Lịch sử.
- [x] Bổ sung nút chạy sửa ảnh bằng Apify cho các tiến trình chưa sửa trong Lịch sử (đưa về hàng đợi).
- [x] Bổ sung nút "Chạy sửa ảnh bằng Apify hàng loạt" trong Tab Lịch sử (API backend batch-fix-avatar và button trên UI).
- [x] Task Redesign: Áp dụng hệ thống giao diện Liquid Glass cho toàn bộ site theo design.md:
  - [x] 1. Thiết lập hệ thống CSS Design Tokens (Liquid Glass: màu sắc, blur động, hiệu ứng ánh sáng iridescent, typography, nút bấm, inputs) trong `index.css`
  - [x] 2. Tái cấu trúc và nâng cấp giao diện toàn bộ `App.jsx` (Header, Upload, Cấu hình quét, Hàng đợi, Lịch sử, Quản lý API Key, Quick Guide) chuẩn Liquid Glass và tuân thủ Do's & Don'ts (không emoji, min-h 100dvh, micro-animations)
  - [x] 3. Nâng cấp giao diện Modal `CsvEditorModal.jsx` và `CsvEditorModal.css` theo phong cách Liquid Glass
  - [x] Fix lỗi Apify 401 (User was not found or authentication token is not valid):
  - [x] Bổ sung hàm nhận diện mã lỗi xác thực Apify `isApifyTokenError()` (hỗ trợ mã 401, 403, 429 và thông báo lỗi liên quan token).
  - [x] Tự động đánh dấu Key hết hạn (`expired`), tự động xoay vòng sang Key khả dụng tiếp theo và thử lại ngay lập tức cho dòng dữ liệu đang xử lý.
  - [x] Tự động tạm dừng tiến trình an toàn (`PAUSED`) và lưu checkpoint khi toàn bộ API Key Apify đều đã hết hạn hoặc không hợp lệ.
  - [x] Bổ sung API `/api/apify-keys/reset-usage` và nút "Đặt lại lượt dùng (Reset)" trên giao diện để tái kích hoạt các Key.
  - [x] Hiển thị banner cảnh báo đỏ nổi bật khi toàn bộ Key hết hạn trên tab Quản lý Apify Keys kèm hướng dẫn lấy Token mới.
