# Sequence diagram: Chuyển khoản

> Phụ trách: TV3 Nhật. Luồng `POST /api/transactions/transfer`: xác thực, idempotency, khóa tài khoản, ghi sổ cái, commit hoặc rollback, lưu giao dịch `failed` (F4).

```mermaid
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
        Auth-->>API: RequestUser (id, role)
        API->>Service: transfer(user, key, dto)

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
                    Service-->>Client: response_code + response_body đã lưu<br/>(201 thành công hoặc 422 lần trước thất bại)
                end
            else Key mới được reserve
                Service->>DB: SELECT tài khoản nguồn theo fromAccountId + userId
                alt Không có nguồn hoặc chuyển đến chính mình
                    Service->>DB: ROLLBACK
                    Service-->>Client: 404 SENDER_ACCOUNT_NOT_FOUND / 422 SAME_ACCOUNT
                else Hợp lệ sơ bộ
                    Service->>DB: SELECT hai tài khoản FOR UPDATE<br/>theo thứ tự accountNumber
                    Note over Service,DB: Khóa pessimistic_write tránh race condition và deadlock
                    Service->>Service: Kiểm tra đích tồn tại, hai account ACTIVE, đủ số dư

                    alt Không có tài khoản đích
                        Service->>DB: ROLLBACK
                        Service-->>Client: 404 TARGET_ACCOUNT_NOT_FOUND
                    else Account không active hoặc không đủ số dư
                        Service->>DB: ROLLBACK
                        Note over Service,DB: F4: lưu giao dịch failed trong transaction riêng,<br/>sau khi đã rollback và trả connection
                        Service->>DB: BEGIN
                        Service->>DB: INSERT idempotency_keys ... ON CONFLICT DO NOTHING
                        Service->>DB: SELECT hai tài khoản FOR KEY SHARE<br/>theo cùng thứ tự accountNumber
                        Service->>DB: INSERT transactions (FAILED, failure_reason)
                        Service->>DB: UPDATE idempotency_keys SET transaction_id,<br/>response_code = 422, response_body
                        Service->>DB: INSERT audit_logs (transfer_failed)
                        Service->>DB: COMMIT
                        Service-->>Client: 422 SENDER_/TARGET_ACCOUNT_NOT_ACTIVE /<br/>INSUFFICIENT_FUNDS
                    else Đủ điều kiện chuyển tiền
                        Service->>DB: UPDATE accounts SET balance = balance - amount<br/>RETURNING balance nguồn
                        Service->>DB: UPDATE accounts SET balance = balance + amount
                        Service->>DB: INSERT transactions (COMPLETED)
                        Service->>DB: INSERT ledger_entries (debit nguồn, credit đích)
                        Service->>DB: UPDATE idempotency_keys SET transaction_id,<br/>response_code, response_body
                        Service->>DB: INSERT audit_logs (transfer_completed)
                        Service->>DB: COMMIT
                        Service-->>Client: 201 transaction + new_balance
                    end
                end
            end
        end
    end
```
