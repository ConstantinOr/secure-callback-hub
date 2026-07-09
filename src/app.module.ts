import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { trace } from '@opentelemetry/api';
import { IncomingMessage } from 'http';
import { LoggerModule } from 'nestjs-pino';
import {
  CORRELATION_ID_HEADER,
  CorrelationIdMiddleware,
} from './common/middleware/correlation-id.middleware';
import ormConfig from './ormconfig';
import { PersistenceModule } from './persistence/persistence.module';
import { CallbackModule } from './callbacks/callback.module';
import { IdentityModule } from './identity/identity.module';

const THROTTLER_TTL_MS = Number(process.env.THROTTLER_TTL_MS ?? 60_000);
const THROTTLER_LIMIT = Number(process.env.THROTTLER_LIMIT ?? 10);
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const isDevelopment = process.env.NODE_ENV === 'development';

const getTraceContext = () => {
  const span = trace.getActiveSpan();

  if (!span) {
    return {};
  }

  const { traceId, spanId, traceFlags } = span.spanContext();

  return {
    trace_id: traceId,
    span_id: spanId,
    trace_flags: traceFlags,
  };
};

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: LOG_LEVEL,
        transport: isDevelopment
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
        mixin: () => getTraceContext(),
        customProps: (req: IncomingMessage) => ({
          correlation_id: req.headers[CORRELATION_ID_HEADER],
        }),
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: THROTTLER_TTL_MS,
        limit: THROTTLER_LIMIT,
      },
    ]),
    TypeOrmModule.forRoot(ormConfig),
    PersistenceModule,
    CallbackModule,
    IdentityModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
