import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { SessionEntity } from '../persistence/entities/session.entity';
import { UserEntity } from '../persistence/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedUser } from './types/authenticated-user.type';

const DEFAULT_SESSION_TTL_HOURS = 24;
const SESSION_TOKEN_BYTES = 32;

const getSessionTtlMs = (): number => {
  const configuredHours = Number(process.env.SESSION_TTL_HOURS);

  if (Number.isFinite(configuredHours) && configuredHours > 0) {
    return configuredHours * 60 * 60 * 1000;
  }

  const configuredMs = Number(process.env.SESSION_TTL_MS);

  if (Number.isFinite(configuredMs) && configuredMs > 0) {
    return configuredMs;
  }

  return DEFAULT_SESSION_TTL_HOURS * 60 * 60 * 1000;
};

export interface PublicUserResponse {
  id: string;
  brandId: string;
  email: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(SessionEntity)
    private readonly sessions: Repository<SessionEntity>,
  ) {}

  async register(input: RegisterDto): Promise<PublicUserResponse> {
    const brandId = input.brandId;
    const email = this.normalizeEmail(input.email);

    const existingUser = await this.users.findOne({
      where: { brandId, email },
    });

    if (existingUser) {
      this.logger.warn({
        message: 'Duplicate registration attempt',
        brandId,
      });

      throw new ConflictException('User already exists for this brand');
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });

    const user = this.users.create({
      brandId,
      email,
      passwordHash,
    });

    try {
      const savedUser = await this.users.save(user);

      this.logger.log({
        message: 'User registered',
        userId: savedUser.id,
        brandId: savedUser.brandId,
      });

      return this.toPublicUser(savedUser);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        this.logger.warn({
          message: 'Duplicate registration attempt',
          brandId,
        });

        throw new ConflictException('User already exists for this brand');
      }

      throw error;
    }
  }

  async login(input: LoginDto): Promise<LoginResponse> {
    const brandId = input.brandId;
    const email = this.normalizeEmail(input.email);

    const user = await this.users.findOne({
      where: { brandId, email },
    });

    if (!user) {
      this.logger.warn({
        message: 'Failed login attempt: user not found',
        brandId,
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      input.password,
    );

    if (!isPasswordValid) {
      this.logger.warn({
        message: 'Failed login attempt: invalid password',
        userId: user.id,
        brandId,
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.generateSessionToken();
    const tokenHash = this.hashSessionToken(accessToken);
    const expiresAt = new Date(Date.now() + getSessionTtlMs());

    const session = this.sessions.create({
      brandId: user.brandId,
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const savedSession = await this.sessions.save(session);

    this.logger.log({
      message: 'User logged in',
      userId: user.id,
      brandId,
      sessionId: savedSession.id,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresAt: expiresAt.toISOString(),
    };
  }

  async resolveSession(accessToken: string): Promise<AuthenticatedUser> {
    const tokenHash = this.hashSessionToken(accessToken);
    const session = await this.sessions.findOne({
      where: { tokenHash },
    });

    if (!session || session.expiresAt <= new Date() || session.revokedAt) {
      this.logger.warn({
        message: 'Invalid or expired session resolved',
        reason: !session
          ? 'not_found'
          : session.revokedAt
            ? 'revoked'
            : 'expired',
      });

      throw new UnauthorizedException('Invalid or expired session');
    }

    const user = await this.users.findOne({
      where: {
        id: session.userId,
        brandId: session.brandId,
      },
    });

    if (!user) {
      this.logger.warn({
        message: 'Invalid session: user not found',
        sessionId: session.id,
        userId: session.userId,
        brandId: session.brandId,
      });

      throw new UnauthorizedException('Invalid or expired session');
    }

    this.logger.debug({
      message: 'Session resolved',
      userId: user.id,
      brandId: user.brandId,
      sessionId: session.id,
    });

    return {
      ...this.toPublicUser(user),
      sessionId: session.id,
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private generateSessionToken(): string {
    return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  }

  // Store only a one-way hash of the opaque token so database leaks do not expose live sessions.
  private hashSessionToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toPublicUser(user: UserEntity): PublicUserResponse {
    return {
      id: user.id,
      brandId: user.brandId,
      email: user.email,
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
