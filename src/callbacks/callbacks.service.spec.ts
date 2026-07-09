import { DataSource, EntityManager } from 'typeorm';
import { IdempotencyKeyEntity } from '../persistence/entities/idempotency-key.entity';
import { RawEventEntity } from '../persistence/entities/raw-event.entity';
import { CallbacksService } from './callbacks.service';

const brandId = '550e8400-e29b-41d4-a716-446655440000';
const correlationId = 'corr-test-1';

const createUniqueViolationError = () => {
  const error = new Error('unique violation') as Error & { code?: string };
  error.code = '23505';

  return error;
};

describe('CallbacksService', () => {
  let dataSource: {
    manager: { findOne: jest.Mock };
    transaction: jest.Mock;
  };
  let service: CallbacksService;

  const input = {
    brandId,
    providerType: 'psp' as const,
    provider: 'stripe',
    externalEventId: 'evt_001',
    payload: { type: 'payment.succeeded', eventId: 'evt_001', amount: 1000 },
    headers: {
      'x-brand-id': brandId,
      'x-correlation-id': correlationId,
      'content-type': 'application/json',
    },
    correlationId,
  };

  beforeEach(() => {
    dataSource = {
      manager: {
        findOne: jest.fn(),
      },
      transaction: jest.fn(),
    };
    service = new CallbacksService(dataSource as unknown as DataSource);
  });

  it('persists a new raw event and idempotency key', async () => {
    dataSource.manager.findOne.mockResolvedValue(null);

    const savedEvent = { id: 'raw-event-id' };
    const manager = {
      create: jest.fn((_entity: unknown, value: unknown) => value),
      save: jest
        .fn()
        .mockResolvedValueOnce(savedEvent)
        .mockResolvedValueOnce({ rawEventId: savedEvent.id }),
    };

    dataSource.transaction.mockImplementation(
      async (callback: (entityManager: EntityManager) => Promise<unknown>) =>
        callback(manager as unknown as EntityManager),
    );

    const result = await service.saveCallback(input);

    expect(result).toEqual({
      duplicate: false,
      rawEventId: 'raw-event-id',
      correlationId,
    });
    expect(manager.create).toHaveBeenCalledWith(
      RawEventEntity,
      expect.objectContaining({
        brandId,
        providerType: 'PSP',
        provider: 'stripe',
        externalEventId: 'evt_001',
        status: 'received',
        headers: input.headers,
        correlationId,
      }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      IdempotencyKeyEntity,
      expect.objectContaining({
        brandId,
        scope: 'PSP:stripe',
        rawEventId: 'raw-event-id',
      }),
    );
  });

  it('returns duplicate when the idempotency key already exists', async () => {
    dataSource.manager.findOne.mockResolvedValue({
      rawEventId: 'existing-raw-event-id',
    });

    const result = await service.saveCallback(input);

    expect(result).toEqual({
      duplicate: true,
      rawEventId: 'existing-raw-event-id',
      correlationId,
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('treats concurrent unique violations as duplicates', async () => {
    dataSource.manager.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        rawEventId: 'race-raw-event-id',
      });
    dataSource.transaction.mockRejectedValue(createUniqueViolationError());

    const result = await service.saveCallback(input);

    expect(result).toEqual({
      duplicate: true,
      rawEventId: 'race-raw-event-id',
      correlationId,
    });
  });

  it('rethrows unexpected transaction errors', async () => {
    dataSource.manager.findOne.mockResolvedValue(null);
    dataSource.transaction.mockRejectedValue(new Error('db down'));

    await expect(service.saveCallback(input)).rejects.toThrow('db down');
  });
});
