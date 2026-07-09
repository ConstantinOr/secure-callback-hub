import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('idempotency_keys')
@Unique('uq_idempotency_keys_brand_scope_key', [
  'brandId',
  'scope',
  'idempotencyKey',
])
@Index('idx_idempotency_keys_brand_scope', ['brandId', 'scope'])
export class IdempotencyKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'brand_id', type: 'varchar', length: 64 })
  brandId: string;

  @Column({ type: 'varchar', length: 64 })
  scope: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 255 })
  idempotencyKey: string;

  @Column({ name: 'raw_event_id', type: 'uuid', nullable: true })
  rawEventId?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
