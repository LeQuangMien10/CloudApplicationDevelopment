sequenceDiagram
    autonumber
    actor Client as Client 
    participant API as TransactionsController
    participant Auth as JwtAuthGuard
    participant Service as TransactionsService
    participant DB as PostgreSQL

    Client->>API: POST /transactions/transfer<br/>Authorization, Idempotency-Key, TransferDto
    API->>Auth: Xác thực JWT
    alt JWT không hợp lệ
        Auth-->>Client: 401 Unauthorized
    else JWT hợp lệ
        Auth-->>API: RequestUser (userId)
        API->>Service: transfer(userId, key, dto)

        alt Thiếu Idempotency-Key / key dài quá 64 ký tự
            Service-->>Client: 400 IDEMPOTENCY_KEY_REQUIRED / VALIDATION_ERROR
        else Dữ liệu hợp lệ
            Service->>Service: SHA-256(JSON.stringify(dto))
            Service->>DB: BEGIN
            Service->>DB: INSERT idempotency_keys ... ON CONFLICT DO NOTHING

            alt Key đã tồn tại
                Service->>DB: SELECT idempotency key theo userId + key
                alt Request hash khác
                    Service->>DB: ROLLBACK
                    Service-->>Client: 409 IDEMPOTENCY_CONFLICT
                else Request hash giống nhau
                    Service->>DB: COMMIT
                    Service-->>Client: 201 response_body đã lưu
                end
            else Key mới được reserve
                Service->>DB: SELECT tài khoản nguồn theo fromAccountId + userId
                alt Không có nguồn hoặc chuyển đến chính mình
                    Service->>DB: ROLLBACK
                    Service-->>Client: 404 SENDER_ACCOUNT_NOT_FOUND / 422 SAME_ACCOUNT
                else Hợp lệ sơ bộ
                    Service->>DB: SELECT hai tài khoản FOR UPDATE<br/>theo thứ tự accountNumber
                    Note over Service,DB: Khóa pessimistic_write tránh race condition và deadlock
                    Service->>Service: Kiểm tra hai account ACTIVE và đủ số dư

                    alt Account không active hoặc không đủ số dư
                        Service->>DB: ROLLBACK
                        Service-->>Client: 404 TARGET_ACCOUNT_NOT_FOUND /<br/>422 SENDER_/TARGET_ACCOUNT_NOT_ACTIVE / INSUFFICIENT_FUNDS
                    else Đủ điều kiện chuyển tiền
                        Service->>DB: UPDATE accounts SET balance = balance - amount<br/>RETURNING balance nguồn
                        Service->>DB: UPDATE accounts SET balance = balance + amount
                        Service->>DB: INSERT transactions (COMPLETED)
                        Service->>DB: UPDATE idempotency_keys SET transaction_id,<br/>response_code, response_body
                        Service->>DB: COMMIT
                        Service-->>Client: 201 transaction + new_balance
                    end
                end
            end
        end
    end