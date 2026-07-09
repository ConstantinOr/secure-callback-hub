import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RawEventEntity } from '../src/persistence/entities/raw-event.entity';

const brandA = '550e8400-e29b-41d4-a716-446655440000';
const brandB = '660e8400-e29b-41d4-a716-446655440001';
const email = 'shared@example.com';
const password = 'StrongPassword123!';

interface LoginResponseBody {
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: string;
}

interface WebhookResponseBody {
  status: 'accepted' | 'duplicate';
  duplicate: boolean;
  rawEventId: string;
  correlationId: string;
}

interface ProfileResponseBody {
  id: string;
  brandId: string;
  email: string;
}

describe('Secure Callback Hub (e2e)', () => {
  let app: INestApplication;
  let server: App;
  let dataSource: DataSource;
  let rawEvents: Repository<RawEventEntity>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    server = app.getHttpServer() as App;
    dataSource = app.get(DataSource);
    rawEvents = dataSource.getRepository(RawEventEntity);
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE idempotency_keys, raw_events, sessions, users CASCADE',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('deduplicates repeated PSP callbacks and persists the original payload', async () => {
    const payload = {
      eventId: 'evt_idempotent_001',
      type: 'payment.succeeded',
      amount: 1000,
    };

    const firstResponse = await request(server)
      .post('/webhooks/psp/stripe')
      .set('x-brand-id', brandA)
      .set('x-correlation-id', 'test-correlation-id')
      .send(payload)
      .expect(201);

    const firstBody = firstResponse.body as WebhookResponseBody;
    expect(firstBody).toMatchObject({
      status: 'accepted',
      duplicate: false,
      correlationId: 'test-correlation-id',
    });
    expect(firstBody.rawEventId).toEqual(expect.any(String));

    const secondResponse = await request(server)
      .post('/webhooks/psp/stripe')
      .set('x-brand-id', brandA)
      .send(payload)
      .expect(201);

    const secondBody = secondResponse.body as WebhookResponseBody;
    expect(secondBody.status).toBe('duplicate');
    expect(secondBody.duplicate).toBe(true);
    expect(secondBody.rawEventId).toBe(firstBody.rawEventId);

    const storedEvents = await rawEvents.find({
      where: {
        brandId: brandA,
        providerType: 'PSP',
        provider: 'stripe',
        externalEventId: payload.eventId,
      },
    });

    expect(storedEvents).toHaveLength(1);
    expect(storedEvents[0].payload).toMatchObject(payload);
    expect(storedEvents[0].headers).toMatchObject({
      'x-brand-id': brandA,
      'x-correlation-id': 'test-correlation-id',
    });
  });

  it('rejects callbacks without a valid UUID tenant context', async () => {
    await request(server)
      .post('/webhooks/gsp/game-provider')
      .set('x-brand-id', 'brand-a')
      .send({ eventId: 'gsp_evt_001', type: 'round.finished' })
      .expect(400);
  });

  it('persists unknown event type when callbacks omit the type discriminator', async () => {
    const payload = {
      eventId: 'evt_without_type',
      amount: 500,
    };

    await request(server)
      .post('/webhooks/psp/stripe')
      .set('x-brand-id', brandA)
      .send(payload)
      .expect(201);

    const storedEvent = await rawEvents.findOneByOrFail({
      brandId: brandA,
      providerType: 'PSP',
      provider: 'stripe',
      externalEventId: payload.eventId,
    });

    expect(storedEvent.payload).toMatchObject({
      ...payload,
      type: 'unknown',
    });
  });

  it('rejects callbacks before persistence when provider or eventId exceed database limits', async () => {
    await request(server)
      .post(`/webhooks/psp/${'a'.repeat(65)}`)
      .set('x-brand-id', brandA)
      .send({ eventId: 'evt_001', type: 'payment.succeeded' })
      .expect(400);

    await request(server)
      .post('/webhooks/psp/stripe')
      .set('x-brand-id', brandA)
      .send({ eventId: 'e'.repeat(129), type: 'payment.succeeded' })
      .expect(400);

    await expect(rawEvents.count()).resolves.toBe(0);
  });

  it('isolates the same callback eventId across brands and persists request headers', async () => {
    const payload = {
      eventId: 'evt_shared_across_brands',
      type: 'payment.succeeded',
      amount: 2500,
    };

    const brandAResponse = await request(server)
      .post('/webhooks/psp/stripe')
      .set('x-brand-id', brandA)
      .set('x-correlation-id', 'brand-a-corr')
      .send(payload)
      .expect(201);

    const brandBResponse = await request(server)
      .post('/webhooks/psp/stripe')
      .set('x-brand-id', brandB)
      .set('x-correlation-id', 'brand-b-corr')
      .send(payload)
      .expect(201);

    const brandABody = brandAResponse.body as WebhookResponseBody;
    const brandBBody = brandBResponse.body as WebhookResponseBody;

    expect(brandABody.status).toBe('accepted');
    expect(brandBBody.status).toBe('accepted');
    expect(brandABody.rawEventId).not.toBe(brandBBody.rawEventId);

    const storedEvents = await rawEvents.find({
      where: {
        providerType: 'PSP',
        provider: 'stripe',
        externalEventId: payload.eventId,
      },
      order: { brandId: 'ASC' },
    });

    expect(storedEvents).toHaveLength(2);
    expect(storedEvents.map((event) => event.brandId).sort()).toEqual(
      [brandA, brandB].sort(),
    );
    expect(typeof storedEvents[0].headers?.['x-brand-id']).toBe('string');
    expect(typeof storedEvents[0].headers?.['x-correlation-id']).toBe('string');
    expect(storedEvents[0].headers).not.toHaveProperty('authorization');
  });

  it('keeps identity profile isolated by brandId when the same email exists in multiple brands', async () => {
    await request(server)
      .post('/auth/register')
      .send({ brandId: brandA, email, password })
      .expect(201);

    await request(server)
      .post('/auth/register')
      .send({ brandId: brandB, email, password })
      .expect(201);

    const loginResponse = await request(server)
      .post('/auth/login')
      .send({ brandId: brandA, email, password })
      .expect(200);

    const loginBody = loginResponse.body as LoginResponseBody;
    expect(loginBody.tokenType).toBe('Bearer');
    expect(loginBody.accessToken).toEqual(expect.any(String));
    expect(loginResponse.headers['x-correlation-id']).toEqual(
      expect.any(String),
    );

    const profileResponse = await request(server)
      .get('/profile/me')
      .set('Authorization', `Bearer ${loginBody.accessToken}`)
      .expect(200);

    const profileBody = profileResponse.body as ProfileResponseBody;
    expect(typeof profileBody.id).toBe('string');
    expect(profileBody.brandId).toBe(brandA);
    expect(profileBody.email).toBe(email);

    const brandBLoginResponse = await request(server)
      .post('/auth/login')
      .send({ brandId: brandB, email, password })
      .expect(200);

    const brandBLoginBody = brandBLoginResponse.body as LoginResponseBody;
    const brandBProfileResponse = await request(server)
      .get('/profile/me')
      .set('Authorization', `Bearer ${brandBLoginBody.accessToken}`)
      .expect(200);

    const brandBProfileBody = brandBProfileResponse.body as ProfileResponseBody;
    expect(brandBProfileBody.brandId).toBe(brandB);
    expect(brandBProfileBody.id).not.toBe(profileBody.id);
  });
});
