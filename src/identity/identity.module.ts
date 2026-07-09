import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { ProfileController } from './profile.controller';

@Module({
  imports: [PersistenceModule],
  controllers: [AuthController, ProfileController],
  providers: [AuthService, SessionAuthGuard],
  exports: [AuthService],
})
export class IdentityModule {}
