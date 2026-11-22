import { EntityManager } from 'typeorm';
import { OutboxEvent, OutboxEventType } from './entities/outbox-event.entity.js';
import { OutboxService } from './outbox.service.js';

describe('OutboxService', () => {
  const manager = { insert: vi.fn() };
  const service = new OutboxService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enqueue() chèn sự kiện qua manager được truyền vào, để dùng chung transaction', async () => {
    manager.insert.mockResolvedValue({});
    const payload = {
      transactionId: 'tx-1',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: '1000.50',
    };

    await service.enqueue(
      manager as unknown as EntityManager,
      OutboxEventType.TRANSFER_COMPLETED,
      payload,
    );

    // status, attempts, available_at để DB đặt mặc định
    expect(manager.insert).toHaveBeenCalledWith(OutboxEvent, {
      eventType: OutboxEventType.TRANSFER_COMPLETED,
      payload,
    });
  });

  it('enqueue() lỗi thì ném ra để transaction của thao tác rollback', async () => {
    manager.insert.mockRejectedValue(new Error('db down'));

    await expect(
      service.enqueue(
        manager as unknown as EntityManager,
        OutboxEventType.TRANSFER_COMPLETED,
        {
          transactionId: 'tx-1',
          fromAccountId: 'acc-1',
          toAccountId: 'acc-2',
          amount: '1.00',
        },
      ),
    ).rejects.toThrow('db down');
  });
});
