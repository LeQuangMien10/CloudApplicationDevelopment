import { Injectable } from '@nestjs/common';

/**
 * Phụ trách: TV3 Nhật (đọc tài khoản), TV2 Châu Anh dùng để tạo tài khoản khi đăng ký.
 * Gợi ý: hàm tạo tài khoản nhận EntityManager để chạy chung transaction với việc tạo user.
 */
@Injectable()
export class AccountsService {}
