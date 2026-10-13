# Frontend

Phụ trách: **TV4 Tú**. Thư mục đang trống, Tú khởi tạo project tại đây.

## Việc Phase 1

- React + Vite (TypeScript khuyến khích): `npm create vite@latest . -- --template react-ts`
- Chặn trang khi chưa đăng nhập, Axios tự gắn JWT vào header `Authorization: Bearer <token>`
- Các trang: Login/Register, Dashboard (số dư), Chuyển khoản, Lịch sử giao dịch
- Chuyển khoản: sinh `Idempotency-Key` (UUID) khi mở form, giữ nguyên khi gửi lại; khóa nút khi đang gửi
- Chọn thư viện quản lý state (React Query, Zustand, Redux Toolkit) và ghi lý do vào đây

## Kết nối backend

- API: `http://localhost:3000/api`, nên đặt trong biến `VITE_API_URL`
- Xem API contract tại Swagger: `http://localhost:3000/api/docs`
- Backend cho phép CORS từ `http://localhost:5173`, cổng mặc định của Vite
- Lỗi luôn có dạng `{ code, message, requestId, details? }`, hiển thị `message` cho người dùng
- Tài khoản test: xem bảng trong README gốc
