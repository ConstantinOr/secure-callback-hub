import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKeyEntity } from './entities/idempotency-key.entity';
import { RawEventEntity } from './entities/raw-event.entity';
import { SessionEntity } from './entities/session.entity';
import { UserEntity } from './entities/user.entity';

const entities = [
  IdempotencyKeyEntity,
  RawEventEntity,
  SessionEntity,
  UserEntity,
];

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  exports: [TypeOrmModule],
})
export class PersistenceModule {}
