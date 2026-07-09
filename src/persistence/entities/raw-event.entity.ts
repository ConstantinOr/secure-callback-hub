import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type RawEventStatus =
  'received' | 'duplicate' | 'processing' | 'processed' | 'failed';

export type RawEventProviderType = 'PSP' | 'GSP';

export interface RawEventPayload {
  /** Event type discriminator used by domain handlers. */
  type: string;

  [key: string]: unknown;
}

export type RawEventHeaders = Record<string, string | string[] | undefined>;

@Entity('raw_events')
@Check('chk_raw_events_provider_type', `"provider_type" IN ('PSP', 'GSP')`)
@Check(
  'chk_raw_events_status',
  `"status" IN ('received', 'duplicate', 'processing', 'processed', 'failed')`,
)
@Index('idx_raw_events_brand_id', ['brandId'])
@Index('idx_raw_events_provider', ['providerType', 'provider'])
@Index('idx_raw_events_external_event_id', ['externalEventId'])
@Index('idx_raw_events_idempotency_key', ['brandId', 'idempotencyKey'])
@Index('idx_raw_events_status_created_at', ['status', 'createdAt'])
export class RawEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'brand_id', type: 'varchar', length: 64 })
  brandId: string;

  @Column({ name: 'provider_type', type: 'varchar', length: 16 })
  providerType: RawEventProviderType;

  @Column({ type: 'varchar', length: 64 })
  provider: string;

  @Column({
    name: 'external_event_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  externalEventId?: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 255 })
  idempotencyKey: string;

  @Column({
    name: 'correlation_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  correlationId?: string;

  @Column({ type: 'jsonb' })
  payload: RawEventPayload;

  @Column({ type: 'jsonb', nullable: true })
  headers?: RawEventHeaders;

  @Column({ type: 'varchar', length: 32, default: 'received' })
  status: RawEventStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt?: Date;
}
