import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('sessions')
@Index('idx_sessions_user_id', ['userId'])
@Index('idx_sessions_brand_id', ['brandId'])
@Index('uq_sessions_token_hash', ['tokenHash'], { unique: true })
@Index('idx_sessions_user_id_brand', ['userId', 'brandId'])
@Index('idx_sessions_expires_revoked', ['expiresAt', 'revokedAt'])
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'brand_id', type: 'varchar', length: 64 })
  brandId: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 255 })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
