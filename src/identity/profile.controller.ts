import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { PublicUserResponse } from './auth.service';
import { SessionAuthGuard } from './guards/session-auth.guard';
import type { AuthenticatedUser } from './types/authenticated-user.type';

@ApiTags('profile')
@ApiBearerAuth('access-token')
@Controller('profile')
export class ProfileController {
  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Return current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  @ApiResponse({
    status: 401,
    description: 'Missing, invalid, or expired session',
  })
  me(@CurrentUser() user: AuthenticatedUser): PublicUserResponse {
    return {
      id: user.id,
      brandId: user.brandId,
      email: user.email,
    };
  }
}
