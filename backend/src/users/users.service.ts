import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from './entities/user.entity.js';

/** Phụ trách: TV2 Châu Anh */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** Lấy cả passwordHash (mặc định cột này bị ẩn) để AuthService kiểm tra mật khẩu. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: email.toLowerCase() })
      .getOne();
  }

  /** Dùng bởi JwtStrategy để kiểm tra trạng thái mỗi request. */
  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  /** Danh sách user mới nhất trước. passwordHash bị ẩn sẵn bởi select:false. */
  async findPaginated(
    page: number,
    limit: number,
  ): Promise<{ items: User[]; total: number; page: number; limit: number }> {
    const [items, total] = await this.users.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { items, total, page, limit };
  }

  /** Trả null nếu không có user với id tương ứng. preload() chỉ merge trong memory nên phải save(). */
  async updateStatus(id: string, status: UserStatus): Promise<User | null> {
    const user = await this.users.preload({ id, status });
    return user ? this.users.save(user) : null;
  }
}
