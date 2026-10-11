# Kế Hoạch Phát Triển Chức Năng "Kiểm Tra Hoạt Động 6 Tháng" (Apify API)

## Mô tả chung
Chức năng này cho phép người dùng click vào nút "Kiểm tra 6 tháng" trên các file kết quả "Sống" trong phần Lịch sử (History). Hệ thống sẽ tự động gửi request lên Apify API kèm theo thời gian delay ngẫu nhiên để xác định xem bài viết mới nhất trên fanpage/post có nằm trong phạm vi 6 tháng gần nhất hay không. 

## Task 1: Cấu hình và Quản lý API Key Apify [HOÀN THÀNH]
*   **Mô tả:** Tạo cơ chế lưu trữ và tự động xoay vòng API token của Apify để tránh hết credit.
*   **Chi tiết:** 
    *   [x] Tạo file `backend/apify_keys.json` lưu trữ mảng các token.
    *   [x] Thêm hàm `getApifyKey()`, `incrementKeyUsage()`, `markKeyAsExpired()` trong `backend/server.js` để đọc token còn khả dụng.
*   **Nhánh:** `feature/task-1-apify-keys`

## Task 2: Phát triển Backend API Endpoint [HOÀN THÀNH]
*   **Mô tả:** Xây dựng endpoint nhận yêu cầu từ frontend và khởi chạy tiến trình kiểm tra.
*   **Chi tiết:** 
    *   [x] Tạo endpoint `POST /api/queue/:id/check-activity` trong `backend/server.js`.
    *   [x] Thiết lập logic đọc file `Alive_...csv` để lấy danh sách URL.
    *   [x] Tạo Job mới đẩy vào hàng đợi với `type = 'CHECK_ACTIVITY'`.
*   **Nhánh:** `feature/task-2-backend-api`

## Task 3: Core Logic gọi Apify API & Delay ngẫu nhiên [HOÀN THÀNH]
*   **Mô tả:** Viết vòng lặp thực hiện check từng URL.
*   **Chi tiết:**
    *   [x] Viết hàm `runCheckActivityJob(job)` xử lý job queue.
    *   [x] Tích hợp độ trễ ngẫu nhiên (dựa trên `minDelay` và `maxDelay` truyền từ client).
    *   [x] Dùng module `https` (hoặc `axios`) gọi `https://api.apify.com/v2/actors/apify~facebook-posts-scraper/run-sync-get-dataset-items`.
    *   [x] So sánh `time` của post trả về với `Date.now() - 180 days`.
    *   [x] Lưu kết quả xuất ra file CSV mới.
*   **Nhánh:** `feature/task-3-core-apify-logic`

## Task 4: Cập nhật giao diện Frontend (App.jsx) [HOÀN THÀNH]
*   **Mô tả:** Thêm UI để người dùng kích hoạt và tải kết quả.
*   **Chi tiết:**
    *   [x] Thêm icon `Calendar` (Kiểm tra 6 tháng) vào các Job hoàn thành trên tab Lịch sử.
    *   [x] Thêm hàm gọi API `handleCheckActivity(jobId)`.
    *   [x] Thêm nút `Tải Kết quả 6 tháng` khi có file `job.downloadLinks.checkedFile`.
    *   [x] Tách màn hình Cấu hình API và Kiểm tra 6 tháng thành tab riêng biệt.
*   **Nhánh:** `feature/task-4-frontend-ui`

## Task 5: Bổ sung Lấy Avatar từ Apify API [HOÀN THÀNH]
*   **Mô tả:** Lấy link ảnh đại diện từ kết quả trả về của Apify và cập nhật vào file kết quả.
*   **Chi tiết:**
    *   [x] Tách hoặc tạo mới cột Avatar/Image.
    *   [x] Trích xuất `profilePic` / `profileUrl` từ object trả về (nếu có).
    *   [x] Hiển thị Note ở giao diện Frontend tab Check 6 Months.
*   **Nhánh:** `feature/task-5-apify-avatar`
