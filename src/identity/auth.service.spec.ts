import {
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { SessionEntity } from '../persistence/entities/session.entity';
import { UserEntity } from '../persistence/entities/user.entity';
import { AuthService } from './auth.service';

const createRepositoryMock = <T>() => ({
  findOne: jest.fn(),
  create: jest.fn((entity: Partial<T>) => entity),
  save: jest.fn(),
});

type RepositoryMock<T> = ReturnType<typeof createRepositoryMock<T>>;

const createUniqueViolationError = () => {
  const error = new Error('unique violation') as Error & { code?: string };
  error.code = '23505';

  return error;
};

describe('AuthService', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  let users: RepositoryMock<UserEntity>;
  let sessions: RepositoryMock<SessionEntity>;
  let service: AuthService;

  beforeEach(() => {
    users = createRepositoryMock<UserEntity>();
    sessions = createRepositoryMock<SessionEntity>();
    service = new AuthService(
      users as unknown as Repository<UserEntity>,
      sessions as unknown as Repository<SessionEntity>,
    );
  });

  describe('register', () => {
    it('creates a user and returns the public profile', async () => {
      users.findOne.mockResolvedValue(null);
      users.save.mockResolvedValue({
        id: 'user-id',
        brandId: '660e8400-e29b-41d4-a716-446655440001',
        email: 'user@example.com',
      });

      const result = await service.register({
        brandId: '660e8400-e29b-41d4-a716-446655440001',
        email: 'USER@example.com',
        password: 'StrongPassword123!',
      });

      expect(result).toEqual({
        id: 'user-id',
        brandId: '660e8400-e29b-41d4-a716-446655440001',
        email: 'user@example.com',
      });
      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: '660e8400-e29b-41d4-a716-446655440001',
          email: 'user@example.com',
        }),
      );
    });

    it('throws ConflictException when the email is already registered for the brand', async () => {
      users.findOne.mockResolvedValue({
        id: 'existing-user-id',
        brandId: '660e8400-e29b-41d4-a716-446655440001',
        email: 'user@example.com',
      });

      await expect(
        service.register({
          brandId: '660e8400-e29b-41d4-a716-446655440001',
          email: 'user@example.com',
          password: 'StrongPassword123!',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users.save).not.toHaveBeenCalled();
    });

    it('throws ConflictException when a concurrent registration hits the unique constraint', async () => {
      users.findOne.mockResolvedValue(null);
      users.save.mockRejectedValue(createUniqueViolationError());

      await expect(
        service.register({
          brandId: '660e8400-e29b-41d4-a716-446655440001',
          email: 'user@example.com',
          password: 'StrongPassword123!',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('creates a server-side session and returns an opaque access token on successful login', async () => {
      const passwordHash = await argon2.hash('StrongPassword123!', {
        type: argon2.argon2id,
      });

      let savedSession: Partial<SessionEntity> | undefined;

      users.findOne.mockResolvedValue({
        id: 'user-id',
        brandId: '550e8400-e29b-41d4-a716-446655440000',
        email: 'user@example.com',
        passwordHash,
      });
      sessions.save.mockImplementation((session: Partial<SessionEntity>) => {
        savedSession = session;

        return Promise.resolve({
          id: 'session-id',
          ...session,
        });
      });

      const result = await service.login({
        brandId: '550e8400-e29b-41d4-a716-446655440000',
        email: 'USER@example.com',
        password: 'StrongPassword123!',
      });

      expect(result.tokenType).toBe('Bearer');
      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.expiresAt).toEqual(expect.any(String));
      expect(users.findOne).toHaveBeenCalledWith({
        where: {
          brandId: '550e8400-e29b-41d4-a716-446655440000',
          email: 'user@example.com',
        },
      });

      expect(savedSession).toBeDefined();
      expect(savedSession?.brandId).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(savedSession?.userId).toBe('user-id');
      expect(savedSession?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(savedSession?.tokenHash).not.toBe(result.accessToken);
      expect(savedSession?.expiresAt).toBeInstanceOf(Date);
    });

    it('throws UnauthorizedException for an invalid password', async () => {
      const passwordHash = await argon2.hash('StrongPassword123!', {
        type: argon2.argon2id,
      });

      users.findOne.mockResolvedValue({
        id: 'user-id',
        brandId: '550e8400-e29b-41d4-a716-446655440000',
        email: 'user@example.com',
        passwordHash,
      });

      await expect(
        service.login({
          brandId: '550e8400-e29b-41d4-a716-446655440000',
          email: 'user@example.com',
          password: 'WrongPassword123!',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the user does not exist', async () => {
      users.findOne.mockResolvedValue(null);

      await expect(
        service.login({
          brandId: '660e8400-e29b-41d4-a716-446655440001',
          email: 'unknown@example.com',
          password: 'StrongPassword123!',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('resolveSession', () => {
    it('resolves profile identity by session userId and brandId for tenant isolation', async () => {
      const accessToken = 'opaque-token';
      const tokenHash = createHash('sha256').update(accessToken).digest('hex');

      sessions.findOne.mockResolvedValue({
        id: 'session-id',
        userId: 'user-id',
        brandId: '660e8400-e29b-41d4-a716-446655440001',
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      });
      users.findOne.mockResolvedValue({
        id: 'user-id',
        brandId: '660e8400-e29b-41d4-a716-446655440001',
        email: 'user@example.com',
        passwordHash: 'argon2-hash',
      });

      const user = await service.resolveSession(accessToken);

      expect(sessions.findOne).toHaveBeenCalledWith({
        where: { tokenHash },
      });
      expect(users.findOne).toHaveBeenCalledWith({
        where: {
          id: 'user-id',
          brandId: '660e8400-e29b-41d4-a716-446655440001',
        },
      });
      expect(user).toEqual({
        id: 'user-id',
        brandId: '660e8400-e29b-41d4-a716-446655440001',
        email: 'user@example.com',
        sessionId: 'session-id',
      });
    });

    it('throws UnauthorizedException for an expired session', async () => {
      const accessToken = 'expired-token';
      const tokenHash = createHash('sha256').update(accessToken).digest('hex');

      sessions.findOne.mockResolvedValue({
        id: 'session-id',
        userId: 'user-id',
        brandId: '660e8400-e29b-41d4-a716-446655440001',
        tokenHash,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(service.resolveSession(accessToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(users.findOne).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException for a revoked session', async () => {
      const accessToken = 'revoked-token';
      const tokenHash = createHash('sha256').update(accessToken).digest('hex');

      sessions.findOne.mockResolvedValue({
        id: 'session-id',
        userId: 'user-id',
        brandId: '660e8400-e29b-41d4-a716-446655440001',
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
      });

      await expect(service.resolveSession(accessToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(users.findOne).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the session user does not exist', async () => {
      const accessToken = 'orphaned-token';
      const tokenHash = createHash('sha256').update(accessToken).digest('hex');

      sessions.findOne.mockResolvedValue({
        id: 'session-id',
        userId: 'user-id',
        brandId: '660e8400-e29b-41d4-a716-446655440001',
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      });
      users.findOne.mockResolvedValue(null);

      await expect(service.resolveSession(accessToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
