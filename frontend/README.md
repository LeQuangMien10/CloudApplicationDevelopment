# Frontend

Phụ trách: **TV4 Tú**. Thư mục đang trống, Tú khởi tạo project tại đây.

## Việc Phase 1

- React + Vite (TypeScript khuyến khích): `npm create vite@latest . -- --template react-ts`
- Chặn trang khi chưa đăng nhập, Axios tự gắn JWT vào header `Authorization: Bearer <token>`
- Các trang: Login/Register, Dashboard (số dư), Chuyển khoản, Lịch sử giao dịch
- Chuyển khoản: sinh `Idempotency-Key` (UUID) khi mở form, giữ nguyên khi gửi lại; khóa nút khi đang gửi
- Chọn thư viện quản lý state (React Query, Zustand, Redux Toolkit) và ghi lý do vào đây:
  Lựa chọn: Zustand (kết hợp TanStack Query)
  Lý do lựa chọn:
  Tách biệt rõ ràng Client State và Server State:
  Zustand chỉ quản lý Client State thuần túy (token xác thực, thông tin user hiện tại, trạng thái UI modal, active account). Cú pháp cực kỳ gọn, không boilerplate rườm rà như Redux Toolkit, dung lượng bundle siêu nhẹ (< 1KB).
  TanStack Query chuyên xử lý Server State (số dư tài khoản, danh sách lịch sử giao dịch). Thư viện này hỗ trợ cơ chế caching mạnh mẽ, tự động refetch (làm mới số dư) ngay sau khi chuyển khoản thành công, và xử lý sẵn trạng thái isLoading, isError, phân trang pagination mà không cần tự viết code quản lý cờ rườm rà.
  Phù hợp với đặc thù ứng dụng ngân hàng: Tránh việc số dư bị stale (cũ), hỗ trợ invalidate query một cách nhất quán ngay sau các mutation chuyển khoản.

## Kết nối backend

- API: `http://localhost:3000/api`, nên đặt trong biến `VITE_API_URL`
- Xem API contract tại Swagger: `http://localhost:3000/api/docs`
- Backend cho phép CORS từ `http://localhost:5173`, cổng mặc định của Vite
- Lỗi luôn có dạng `{ code, message, requestId, details? }`, hiển thị `message` cho người dùng
- Tài khoản test: xem bảng trong README gốc

# Hướng dẫn nhanh cách setup môi trường, package, ...

Phụ trách: **TV4 - Tú**  
Stack: **React 18 + Vite + TypeScript + Tailwind CSS v4 + Zustand + Axios**

---

## 1. Hướng dẫn cài đặt & khởi chạy

### Yêu cầu

- Node.js >= 18
- Backend NestJS đang chạy tại `http://localhost:3000` (hoặc qua Docker)

### Cài đặt

Di chuyển vào thư mục `frontend` và cài dependencies:

```bash
cd frontend
npm install


- Cấu hình biến môi trường
- Tạo file .env tại thư mục frontend/ (hoặc copy từ .env.example): 'VITE_API_URL=http://localhost:3000/api'
- Chạy ứng dụng (Development): npm run dev
- Truy cập ứng dụng tại: http://localhost:5173

```
