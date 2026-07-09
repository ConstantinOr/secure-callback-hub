import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { AuthenticatedUser } from '../types/authenticated-user.type';

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accessToken = this.extractBearerToken(request);

    request.user = await this.authService.resolveSession(accessToken);

    return true;
  }

  private extractBearerToken(request: Request): string {
    const authorization = request.header('authorization');

    if (!authorization) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const [tokenType, accessToken, ...rest] = authorization.split(' ');

    if (tokenType !== 'Bearer' || !accessToken || rest.length > 0) {
      throw new UnauthorizedException('Invalid authorization header');
    }

    return accessToken;
  }
}
