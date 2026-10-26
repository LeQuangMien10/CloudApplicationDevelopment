import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Account } from '../src/accounts/entities/account.entity.js';
import { setupApp } from '../src/app.setup.js';
import { AppModule } from '../src/app.module.js';
import { IdempotencyKey } from '../src/transactions/entities/idempotency-key.entity.js';
import { LedgerEntry } from '../src/transactions/entities/ledger-entry.entity.js';
import { Transaction, TransactionType } from '../src/transactions/entities/transaction.entity.js';
import { User } from '../src/users/entities/user.entity.js';
import {
  openOwnerDataSource,
  withLedgerMaintenance,
} from './support/owner-data-source.js';

describe('POST /api/transactions/transfer - chống deadlock', () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let ownerDataSource: DataSource;
    let accountA: Account; // của an@example.com
    let accountB: Account; // account 100000000002
    let tokenA: string;
    let tokenB: string;
    let userAId: string;
    let userBId: string;
    let balanceA: string;
    let balanceB: string;

    const transferPath = '/api/transactions/transfer';
    const key = () => `e2e-${crypto.randomUUID()}`;
    const DESCRIPTION = 'E2E transfer: deadlock test';

    const send = (token: string, from: Account, to: Account, amount = '1.00') =>
        request(app.getHttpServer())
            .post(transferPath)
            .set('Authorization', `Bearer ${token}`)
            .set('Idempotency-Key', key())
            .send({
                fromAccountId: from.id,
                toAccountNumber: to.accountNumber,
                amount,
                description: DESCRIPTION,
            });

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        setupApp(app);
        await app.init();

        dataSource = app.get(DataSource);

        ownerDataSource = await openOwnerDataSource();
        const userA = await dataSource
            .getRepository(User)
            .findOneByOrFail({ email: 'an@example.com' });
        accountA = await dataSource
            .getRepository(Account)
            .findOneByOrFail({ userId: userA.id });
        accountB = await dataSource
            .getRepository(Account)
            .findOneByOrFail({ accountNumber: '100000000002' });
        const userB = await dataSource
            .getRepository(User)
            .findOneByOrFail({ id: accountB.userId });

        userAId = userA.id;
        userBId = userB.id;
        balanceA = accountA.balance;
        balanceB = accountB.balance;

        const jwt = app.get(JwtService);
        tokenA = await jwt.signAsync({ sub: userA.id, role: userA.role });
        tokenB = await jwt.signAsync({ sub: userB.id, role: userB.role });
    });

    afterEach(async () => {
        await withLedgerMaintenance(ownerDataSource, async (manager) => {
            await manager
                .createQueryBuilder()
                .delete()
                .from(IdempotencyKey)
                .where('user_id IN (:...userIds) AND key LIKE :keyPrefix', {
                    userIds: [userAId, userBId],
                    keyPrefix: 'e2e-%',
                })
                .execute();
            await manager
                .createQueryBuilder()
                .delete()
                .from(LedgerEntry)
                .where(
                    'transaction_id IN (SELECT id FROM transactions WHERE initiated_by IN (:...userIds) AND type = :type AND description = :description)',
                    {
                        userIds: [userAId, userBId],
                        type: TransactionType.TRANSFER,
                        description: DESCRIPTION,
                    },
                )
                .execute();
            await manager
                .createQueryBuilder()
                .delete()
                .from(Transaction)
                .where('initiated_by IN (:...userIds) AND type = :type AND description = :description', {
                    userIds: [userAId, userBId],
                    type: TransactionType.TRANSFER,
                    description: DESCRIPTION,
                })
                .execute();
            await manager.update(Account, accountA.id, { balance: balanceA });
            await manager.update(Account, accountB.id, { balance: balanceB });
        });
    });

    afterAll(async () => {
        await ownerDataSource.destroy();
        await app.close();
    });

    it('1. chuyển tiền chéo A→B và B→A đồng thời không bị deadlock', async () => {
        const ROUNDS = 5;
        const PER_DIRECTION = 10;

        for (let round = 0; round < ROUNDS; round++) {
            const requests = Array.from({ length: PER_DIRECTION }, () => [
                send(tokenA, accountA, accountB),
                send(tokenB, accountB, accountA),
            ]).flat();

            const responses = await Promise.all(requests);

            // Không request nào bị Postgres hủy vì deadlock (sẽ là 500)
            const statuses = responses.map((r) => r.status);
            expect(statuses.filter((s) => s !== 201)).toEqual([]);
        }

        // Hai chiều bù trừ nhau nên số dư phải về đúng như ban đầu
        await expect(
            dataSource.getRepository(Account).findOneByOrFail({ id: accountA.id }),
        ).resolves.toMatchObject({ balance: balanceA });
        await expect(
            dataSource.getRepository(Account).findOneByOrFail({ id: accountB.id }),
        ).resolves.toMatchObject({ balance: balanceB });

        // Đủ số bản ghi giao dịch: 2 chiều × 10 request × 5 vòng
        const count = await dataSource.getRepository(Transaction).countBy({
            type: TransactionType.TRANSFER,
            description: DESCRIPTION,
        });
        expect(count).toBe(2 * PER_DIRECTION * ROUNDS);
    }, 60_000);
});
