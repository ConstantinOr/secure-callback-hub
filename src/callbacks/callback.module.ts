import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { CallbacksController } from './callbacks.controller';
import { CallbacksService } from './callbacks.service';

@Module({
  imports: [PersistenceModule],
  controllers: [CallbacksController],
  providers: [CallbacksService],
  exports: [CallbacksService],
})
export class CallbackModule {}
