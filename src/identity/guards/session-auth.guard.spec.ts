import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { SessionAuthGuard } from './session-auth.guard';

const createMockContext = (headers: Record<string, string | undefined>) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) => headers[name.toLowerCase()],
      }),
    }),
  }) as unknown as ExecutionContext;

describe('SessionAuthGuard', () => {
  const mockResolveSession = jest.fn();
  const authService = {
    resolveSession: mockResolveSession,
  } as unknown as AuthService;
  let guard: SessionAuthGuard;

  beforeEach(() => {
    mockResolveSession.mockReset();
    guard = new SessionAuthGuard(authService);
  });

  it('throws when the authorization header is missing', async () => {
    const context = createMockContext({});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws when the authorization header has no token', async () => {
    const context = createMockContext({ authorization: 'Bearer' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws when the token type is not Bearer', async () => {
    const context = createMockContext({ authorization: 'Basic token' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws when the authorization header has extra parts', async () => {
    const context = createMockContext({
      authorization: 'Bearer token extra',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('resolves the session and attaches the user to the request', async () => {
    const user = {
      id: 'user-id',
      brandId: '770e8400-e29b-41d4-a716-446655440002',
      email: 'user@example.com',
      sessionId: 'session-id',
    };
    mockResolveSession.mockResolvedValue(user);

    const request = { header: () => 'Bearer valid-token' };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockResolveSession).toHaveBeenCalledWith('valid-token');
    expect(request).toEqual(expect.objectContaining({ user }));
  });
});
