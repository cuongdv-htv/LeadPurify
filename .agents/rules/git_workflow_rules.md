---
name: Git Workflow Rules
description: Quy trình làm việc với Git, tạo nhánh, và Pull Request khi làm task.
---

# Quy trình làm việc với Git (Git Workflow)

Khi được giao một task và thực hiện implement code, AI phải tuân thủ nghiêm ngặt quy trình quản lý mã nguồn bằng Git như sau:

1. **Tạo nhánh (Branch) mới trước khi làm**:
   - Không được phép code trực tiếp trên nhánh `main` (hoặc `master`).
   - Trước khi bắt đầu viết code cho một task, AI phải dùng lệnh Git để tạo và chuyển sang một nhánh mới (ví dụ: `git checkout -b feature/ten-task` hoặc `bugfix/ten-loi`). Tên nhánh phải mô tả ngắn gọn nội dung task.

2. **Commit và Push thường xuyên**:
   - Trong quá trình làm, hãy chủ động `git add` và `git commit` với thông điệp rõ ràng, tuân thủ các quy ước nếu có.
   - Khi hoàn thành task, push nhánh này lên remote repository.

3. **Tạo Pull Request (PR)**:
   - Sau khi hoàn thành và push code, AI phải chủ động tạo một Pull Request (nếu có công cụ hỗ trợ như GitHub CLI `gh pr create` hoặc hướng dẫn người dùng cách tạo). 
   - Nếu không có CLI, hãy báo cáo người dùng rằng code đã được đẩy lên nhánh mới và đề xuất nội dung (Title, Body) để mở PR.

4. **Hỏi xác nhận trước khi Merge**:
   - Tuyệt đối không được tự ý merge nhánh vào `main`.
   - AI phải hỏi User: "Bạn có muốn xem lại PR và xác nhận merge không?".
   - Chỉ khi nào User đồng ý (hoặc yêu cầu AI tự merge), AI mới được phép thực thi lệnh merge.
