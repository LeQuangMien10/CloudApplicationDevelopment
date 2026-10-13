import bcrypt from 'bcrypt';
import { config } from 'dotenv';
import { DataSource, type EntityManager } from 'typeorm';
import { SYSTEM_ACCOUNT_NUMBER } from '../accounts/account-number.util.js';
import { Account } from '../accounts/entities/account.entity.js';
import {
  LedgerDirection,
  LedgerEntry,
} from '../transactions/entities/ledger-entry.entity.js';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../transactions/entities/transaction.entity.js';
import { User, UserRole } from '../users/entities/user.entity.js';
import { buildDataSourceOptions } from './typeorm.config.js';

config({ path: ['.env', '../.env'], quiet: true });

/** Dữ liệu mẫu cho môi trường dev. Chạy: npm run seed */
const ADMIN = {
  fullName: 'Quản trị viên',
  email: 'admin@bank.local',
  password: 'Admin@123',
};
const CUSTOMERS = [
  {
    fullName: 'Nguyễn Văn An',
    email: 'an@example.com',
    accountNumber: '100000000001',
    deposit: '10000000.00',
  },
  {
    fullName: 'Trần Thị Bình',
    email: 'binh@example.com',
    accountNumber: '100000000002',
    deposit: '5000000.00',
  },
  {
    fullName: 'Lê Văn Chi',
    email: 'chi@example.com',
    accountNumber: '100000000003',
    deposit: '0.00',
  },
];
const CUSTOMER_PASSWORD = 'Password@123';

/** Cộng/trừ số dư bằng SQL (không tính bằng number trong JS), trả về số dư mới. */
async function changeBalance(
  m: EntityManager,
  accountId: string,
  op: '+' | '-',
  amount: string,
): Promise<string> {
  const result = await m
    .createQueryBuilder()
    .update(Account)
    .set({ balance: () => `balance ${op} :amount` })
    .setParameter('amount', amount)
    .where('id = :id', { id: accountId })
    .returning('balance')
    .execute();
  return (result.raw as { balance: string }[])[0].balance;
}

/** Nạp tiền từ tài khoản quỹ: 1 giao dịch DEPOSIT + 2 bút toán, giống luồng chuyển khoản thật. */
async function deposit(
  m: EntityManager,
  system: Account,
  target: Account,
  amount: string,
  adminId: string,
) {
  const tx = await m.save(
    m.create(Transaction, {
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.COMPLETED,
      fromAccountId: system.id,
      toAccountId: target.id,
      amount,
      description: 'Nạp tiền ban đầu (seed)',
      initiatedBy: adminId,
      completedAt: new Date(),
    }),
  );

  const systemBalance = await changeBalance(m, system.id, '-', amount);
  const targetBalance = await changeBalance(m, target.id, '+', amount);

  await m.save([
    m.create(LedgerEntry, {
      transactionId: tx.id,
      accountId: system.id,
      direction: LedgerDirection.DEBIT,
      amount,
      balanceAfter: systemBalance,
    }),
    m.create(LedgerEntry, {
      transactionId: tx.id,
      accountId: target.id,
      direction: LedgerDirection.CREDIT,
      amount,
      balanceAfter: targetBalance,
    }),
  ]);
}

async function main() {
  const ds = await new DataSource(buildDataSourceOptions()).initialize();
  try {
    if ((await ds.getRepository(User).count()) > 0) {
      console.log(
        'Database đã có dữ liệu, bỏ qua seed. Muốn seed lại: npm run db:reset',
      );
      return;
    }

    await ds.transaction(async (m) => {
      const admin = await m.save(
        m.create(User, {
          fullName: ADMIN.fullName,
          email: ADMIN.email,
          passwordHash: await bcrypt.hash(ADMIN.password, 12),
          role: UserRole.ADMIN,
        }),
      );
      const system = await m.save(
        m.create(Account, {
          userId: admin.id,
          accountNumber: SYSTEM_ACCOUNT_NUMBER,
          isSystem: true,
        }),
      );

      const customerHash = await bcrypt.hash(CUSTOMER_PASSWORD, 12);
      for (const c of CUSTOMERS) {
        const user = await m.save(
          m.create(User, {
            fullName: c.fullName,
            email: c.email,
            passwordHash: customerHash,
          }),
        );
        const account = await m.save(
          m.create(Account, {
            userId: user.id,
            accountNumber: c.accountNumber,
          }),
        );
        if (Number(c.deposit) > 0)
          await deposit(m, system, account, c.deposit, admin.id);
      }
    });

    console.log('Seed xong:');
    console.log(`  admin    ${ADMIN.email} / ${ADMIN.password}`);
    for (const c of CUSTOMERS)
      console.log(
        `  customer ${c.email} / ${CUSTOMER_PASSWORD}  STK ${c.accountNumber}  số dư ${c.deposit}`,
      );
  } finally {
    await ds.destroy();
  }
}

await main();
