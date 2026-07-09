import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  RawEventEntity,
  RawEventHeaders,
  RawEventPayload,
} from '../persistence/entities/raw-event.entity';
import { IdempotencyKeyEntity } from '../persistence/entities/idempotency-key.entity';

type ProviderType = 'psp' | 'gsp';
type StoredProviderType = 'PSP' | 'GSP';

interface SaveCallbackInput {
  brandId: string;
  providerType: ProviderType;
  provider: string;
  externalEventId: string;
  payload: RawEventPayload;
  headers?: RawEventHeaders;
  correlationId: string;
}

interface SaveCallbackResult {
  duplicate: boolean;
  rawEventId?: string;
  correlationId: string;
}

interface IdempotencyContext {
  providerType: StoredProviderType;
  scope: string;
  idempotencyKey: string;
}

@Injectable()
export class CallbacksService {
  constructor(private readonly dataSource: DataSource) {}

  async saveCallback(input: SaveCallbackInput): Promise<SaveCallbackResult> {
    const idempotency = this.buildIdempotencyContext(input);

    const existingKey = await this.findIdempotencyKey(input, idempotency);

    if (existingKey) {
      return this.toDuplicateResult(existingKey, input.correlationId);
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const rawEvent = manager.create(RawEventEntity, {
          brandId: input.brandId,
          providerType: idempotency.providerType,
          provider: input.provider,
          externalEventId: input.externalEventId,
          idempotencyKey: idempotency.idempotencyKey,
          payload: input.payload,
          headers: input.headers,
          status: 'received',
          correlationId: input.correlationId,
        });

        const savedEvent = await manager.save(rawEvent);

        const key = manager.create(IdempotencyKeyEntity, {
          brandId: input.brandId,
          scope: idempotency.scope,
          idempotencyKey: idempotency.idempotencyKey,
          rawEventId: savedEvent.id,
        });

        await manager.save(key);

        return {
          duplicate: false,
          rawEventId: savedEvent.id,
          correlationId: input.correlationId,
        };
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const duplicateKey = await this.findIdempotencyKey(input, idempotency);

      if (!duplicateKey) {
        throw error;
      }

      return this.toDuplicateResult(duplicateKey, input.correlationId);
    }
  }

  private buildIdempotencyContext(
    input: SaveCallbackInput,
  ): IdempotencyContext {
    const providerType = input.providerType.toUpperCase() as StoredProviderType;
    const scope = `${providerType}:${input.provider}`;
    const idempotencyKey = [
      input.brandId,
      input.providerType,
      input.provider,
      input.externalEventId,
    ].join(':');

    return {
      providerType,
      scope,
      idempotencyKey,
    };
  }

  private async findIdempotencyKey(
    input: SaveCallbackInput,
    idempotency: IdempotencyContext,
  ): Promise<IdempotencyKeyEntity | null> {
    return this.dataSource.manager.findOne(IdempotencyKeyEntity, {
      where: {
        brandId: input.brandId,
        scope: idempotency.scope,
        idempotencyKey: idempotency.idempotencyKey,
      },
    });
  }

  private toDuplicateResult(
    key: IdempotencyKeyEntity,
    correlationId: string,
  ): SaveCallbackResult {
    return {
      duplicate: true,
      rawEventId: key.rawEventId,
      correlationId,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    );
  }
}
