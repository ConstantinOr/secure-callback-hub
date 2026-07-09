import {
  CorrelationIdMiddleware,
  MAX_CORRELATION_ID_LENGTH,
  resolveCorrelationId,
} from './correlation-id.middleware';

describe('CorrelationIdMiddleware', () => {
  it('reuses a provided correlation id and sets response/trace headers', () => {
    const middleware = new CorrelationIdMiddleware();
    const req = {
      header: jest.fn().mockReturnValue('client-corr-id'),
      headers: {} as Record<string, string>,
    };
    const res = {
      setHeader: jest.fn(),
    };
    const next = jest.fn();

    middleware.use(req as never, res as never, next);

    expect(req.headers['x-correlation-id']).toBe('client-corr-id');
    expect(res.setHeader).toHaveBeenCalledWith(
      'x-correlation-id',
      'client-corr-id',
    );
    expect(next).toHaveBeenCalled();
  });

  it('generates a correlation id when the header is missing', () => {
    const middleware = new CorrelationIdMiddleware();
    const req = {
      header: jest.fn().mockReturnValue(undefined),
      headers: {} as Record<string, string>,
    };
    const res = {
      setHeader: jest.fn(),
    };
    const next = jest.fn();

    middleware.use(req as never, res as never, next);

    expect(req.headers['x-correlation-id']).toEqual(expect.any(String));
    expect(res.setHeader).toHaveBeenCalledWith(
      'x-correlation-id',
      req.headers['x-correlation-id'],
    );
    expect(next).toHaveBeenCalled();
  });

  it('truncates oversized correlation ids to the DB column limit', () => {
    const oversized = 'c'.repeat(MAX_CORRELATION_ID_LENGTH + 40);

    expect(resolveCorrelationId(oversized)).toHaveLength(
      MAX_CORRELATION_ID_LENGTH,
    );
  });
});
