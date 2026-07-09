import { Injectable, NestMiddleware } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

export const resolveCorrelationId = (value?: string): string => {
  const normalized = value?.trim();

  return normalized && normalized.length > 0 ? normalized : randomUUID();
};

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId = resolveCorrelationId(
      req.header(CORRELATION_ID_HEADER) ?? undefined,
    );

    req.headers[CORRELATION_ID_HEADER] = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    trace.getActiveSpan()?.setAttribute('correlation_id', correlationId);

    next();
  }
}
