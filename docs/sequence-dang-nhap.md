# Sequence diagram: Đăng nhập

> Phụ trách: TV2 Châu Anh. Luồng `POST /api/auth/login` và cách token được dùng ở các request sau.

```mermaid
sequenceDiagram
    autonumber
    actor C as Client (frontend)
    participant V as ValidationPipe
    participant AC as AuthController
    participant AS as AuthService
    participant US as UsersService
    participant DB as PostgreSQL
    participant JS as JwtService (JWT_SECRET)

    C->>+V: POST /api/auth/login { email, password }
    V->>V: Kiểm tra RegisterDto/LoginDto<br/>(IsEmail, MinLength...)
    alt dữ liệu sai định dạng
        V-->>C: 400 { code: "VALIDATION_ERROR", requestId }
    end
    V->>+AC: login(dto)
    AC->>+AS: login(dto)
    AS->>+US: findByEmailWithPassword(email)
    US->>+DB: SELECT * bao gồm password_hash
    DB-->>-US: user | null
    US-->>-AS: user | null

    alt user null HOẶC bcrypt.compare() sai
        Note over AS: Cùng một thông báo<br/>-> không dò được email tồn tại
        AS-->>C: 401 { code: "INVALID_CREDENTIALS" }
    else user.status !== 'active'
        Note over AS: Chỉ ai đúng mật khẩu mới thấy bị khóa
        AS-->>C: 401 { code: "USER_LOCKED" }
    else mật khẩu đúng, user active
        AS->>+JS: signAsync({ sub: user.id, role: user.role })
        Note over JS: Ký HMAC bằng JWT_SECRET<br/>expiresIn = 15 phút
        JS-->>-AS: accessToken
        AS-->>C: 200 { accessToken, expiresIn: 900 }
    end
    deactivate AC
    deactivate AS

    Note over C,DB: --- Các request sau ---
    C->>+AC: GET /api/auth/me<br/>Authorization: Bearer <accessToken>
    AC->>+JS: JwtStrategy verify chữ ký + hạn dùng
    alt token sai / giả mạo / hết hạn
        JS-->>C: 401 { code: "UNAUTHORIZED" }
    else token hợp lệ
        Note over JS,AC: payload { sub, role }<br/>gắn vào request.user<br/>không truy vấn DB
        JS-->>-AC: RequestUser { id, role }
        AC-->>-C: 200 dữ liệu của user
    end
```

## Các quyết định thiết kế

| Quyết định | Lý do |
|---|---|
| Sai email và sai mật khẩu trả **cùng một** `INVALID_CREDENTIALS` | Tránh để attacker dò được email nào đã đăng ký (user enumeration) |
| Kiểm tra `USER_LOCKED` **sau** khi so khớp mật khẩu | Chỉ người biết đúng mật khẩu mới biết tài khoản bị khóa |
| JWT thay vì session lưu DB | Server không giữ trạng thái; mọi bản copy của backend (Phase Cloud, nhiều container) chỉ cần chung `JWT_SECRET` là verify được token — không cần sticky session |
| Payload chỉ chứa `{ sub, role }` | Guard chỉ cần "ai + vai trò gì" mà không truy vấn DB mỗi request; không bao giờ chứa `passwordHash` |
| Token sống 15 phút | Giới hạn thời gian kẻ gian có thể dùng token đánh cắp. Việc gia hạn (refresh token) nằm ở Phase 2B |
| Đăng xuất làm ở frontend | Chỉ cần xóa token phía client; server không có session để hủy |
