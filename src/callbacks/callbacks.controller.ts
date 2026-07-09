import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import { CORRELATION_ID_HEADER } from '../common/middleware/correlation-id.middleware';
import {
  RawEventHeaders,
  RawEventPayload,
} from '../persistence/entities/raw-event.entity';
import { CallbacksService } from './callbacks.service';

interface CallbackBody {
  eventId: string;
  type?: string;
  [key: string]: unknown;
}

/** Fits `idempotency_keys.scope` varchar(64): "PSP:" / "GSP:" (4) + provider. */
const MAX_PROVIDER_LENGTH = 60;
const MAX_EXTERNAL_EVENT_ID_LENGTH = 128;
const PROVIDER_PATTERN = /^[a-zA-Z0-9._-]+$/;

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
]);

const isCallbackBody = (body: unknown): body is Record<string, unknown> =>
  typeof body === 'object' && body !== null && !Array.isArray(body);

const parseCallbackBody = (body: unknown): CallbackBody => {
  if (!isCallbackBody(body)) {
    throw new BadRequestException('request body is required');
  }

  const eventId =
    typeof body.eventId === 'string' ? body.eventId.trim() : undefined;

  if (!eventId) {
    throw new BadRequestException('eventId is required');
  }

  if (eventId.length > MAX_EXTERNAL_EVENT_ID_LENGTH) {
    throw new BadRequestException(
      `eventId must be at most ${MAX_EXTERNAL_EVENT_ID_LENGTH} characters`,
    );
  }

  return {
    ...body,
    eventId,
    type: typeof body.type === 'string' ? body.type : undefined,
  };
};

const getProvider = (provider: string): string => {
  const normalizedProvider = provider.trim();

  if (!normalizedProvider) {
    throw new BadRequestException('provider is required');
  }

  if (normalizedProvider.length > MAX_PROVIDER_LENGTH) {
    throw new BadRequestException(
      `provider must be at most ${MAX_PROVIDER_LENGTH} characters`,
    );
  }

  if (!PROVIDER_PATTERN.test(normalizedProvider)) {
    throw new BadRequestException(
      'provider may contain only letters, numbers, dot, underscore, and hyphen',
    );
  }

  return normalizedProvider;
};

const getBrandId = (brandId?: string): string => {
  const normalizedBrandId = brandId?.trim();

  if (!normalizedBrandId || !isUUID(normalizedBrandId)) {
    throw new BadRequestException('valid x-brand-id header is required');
  }

  return normalizedBrandId;
};

const buildPayload = (body: CallbackBody): RawEventPayload => ({
  ...body,
  type: body.type ?? 'unknown',
});

const sanitizeHeaders = (headers: Request['headers']): RawEventHeaders => {
  const sanitized: RawEventHeaders = {};

  for (const [name, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_NAMES.has(name.toLowerCase())) {
      continue;
    }

    sanitized[name] = value;
  }

  return sanitized;
};

@ApiTags('callbacks')
@SkipThrottle()
@Controller('webhooks')
export class CallbacksController {
  constructor(private readonly callbacksService: CallbacksService) {}

  @Post('psp/:provider')
  @ApiOperation({ summary: 'Receive PSP callback' })
  @ApiParam({ name: 'provider', example: 'stripe' })
  @ApiHeader({ name: 'x-brand-id', required: true })
  @ApiHeader({ name: 'x-correlation-id', required: false })
  @ApiBody({
    schema: {
      example: {
        eventId: 'evt_001',
        type: 'payment.succeeded',
        amount: 1000,
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Callback accepted or deduplicated',
  })
  async handlePspCallback(
    @Param('provider') provider: string,
    @Headers('x-brand-id') brandId: string | undefined,
    @Headers(CORRELATION_ID_HEADER) correlationId: string,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.handleCallback({
      providerType: 'psp',
      provider,
      brandId,
      correlationId,
      req,
      body,
    });
  }

  @Post('gsp/:provider')
  @ApiOperation({ summary: 'Receive GSP callback' })
  @ApiParam({ name: 'provider', example: 'game-provider' })
  @ApiHeader({ name: 'x-brand-id', required: true })
  @ApiHeader({ name: 'x-correlation-id', required: false })
  @ApiBody({
    schema: {
      example: {
        eventId: 'gsp_evt_001',
        type: 'round.finished',
        roundId: 'round_123',
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Callback accepted or deduplicated',
  })
  async handleGspCallback(
    @Param('provider') provider: string,
    @Headers('x-brand-id') brandId: string | undefined,
    @Headers(CORRELATION_ID_HEADER) correlationId: string,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.handleCallback({
      providerType: 'gsp',
      provider,
      brandId,
      correlationId,
      req,
      body,
    });
  }

  private async handleCallback(input: {
    providerType: 'psp' | 'gsp';
    provider: string;
    brandId: string | undefined;
    correlationId: string;
    req: Request;
    body: unknown;
  }) {
    const resolvedBrandId = getBrandId(input.brandId);
    const provider = getProvider(input.provider);
    const callbackBody = parseCallbackBody(input.body);

    const result = await this.callbacksService.saveCallback({
      brandId: resolvedBrandId,
      providerType: input.providerType,
      provider,
      externalEventId: callbackBody.eventId,
      payload: buildPayload(callbackBody),
      headers: sanitizeHeaders(input.req.headers),
      correlationId: input.correlationId,
    });

    return {
      status: result.duplicate ? 'duplicate' : 'accepted',
      duplicate: result.duplicate,
      rawEventId: result.rawEventId,
      correlationId: result.correlationId,
    };
  }
}
