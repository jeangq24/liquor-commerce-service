import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { CheckoutService } from './../src/modules/commerce/checkout.service.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CheckoutService)
      .useValue({
        checkout: vi.fn().mockResolvedValue({
          orderId: '00000000-0000-4000-8000-000000000003',
          status: 'PENDING',
          inventoryReservationStatus: 'PENDING',
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/commerce');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    const swaggerConfig = new DocumentBuilder()
      .setTitle('API de Commerce de LicoresYaaa')
      .setDescription(
        'API REST de Commerce. Las operaciones de pedidos y pagos requieren un cliente interno de confianza. El checkout para recogida se procesa de forma asíncrona.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
    await app.init();
  });

  it('/api/commerce (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/commerce')
      .expect(200)
      .expect('Hello World!');
  });

  it('rejects unknown cart fields before accessing persistence', () => {
    return request(app.getHttpServer())
      .post('/api/commerce/carts')
      .send({ unexpected: true })
      .expect(400);
  });

  it('requires trusted authentication for order operations', () => {
    return request(app.getHttpServer()).get('/api/commerce/orders').expect(401);
  });

  it('rejects authenticated callers without the required order permission', () => {
    return request(app.getHttpServer())
      .get('/api/commerce/orders')
      .set('Authorization', `Bearer ${process.env.COMMERCE_INTERNAL_API_TOKEN}`)
      .set('x-actor-id', '00000000-0000-4000-8000-000000000004')
      .set('x-actor-permissions', 'commerce.payments.read')
      .expect(403);
  });

  it('accepts checkout while inventory reservation is pending', () => {
    return request(app.getHttpServer())
      .post('/api/commerce/checkout')
      .set('Idempotency-Key', 'checkout-deferred-test')
      .send({
        cartId: '00000000-0000-4000-8000-000000000002',
        customerName: 'Test Customer',
        customerPhone: '3000000000',
        fulfillmentType: 'PICKUP',
        paymentMethod: 'CASH',
      })
      .expect(202)
      .expect(({ body }) => {
        expect(body.inventoryReservationStatus).toBe('PENDING');
      });
  });

  it.each([
    ['RESERVED', 200],
    ['FAILED', 409],
  ] as const)(
    'reports %s checkout reservation with HTTP %i',
    (inventoryReservationStatus, httpStatus) => {
      vi.spyOn(app.get(CheckoutService), 'checkout').mockResolvedValue({
        orderId: '00000000-0000-4000-8000-000000000003',
        status:
          inventoryReservationStatus === 'FAILED' ? 'CANCELLED' : 'PENDING',
        inventoryReservationStatus,
      });
      return request(app.getHttpServer())
        .post('/api/commerce/checkout')
        .set('Idempotency-Key', 'checkout-test')
        .send({
          cartId: '00000000-0000-4000-8000-000000000002',
          customerName: 'Test Customer',
          customerPhone: '3000000000',
          fulfillmentType: 'PICKUP',
          paymentMethod: 'CASH',
        })
        .expect(httpStatus)
        .expect(({ body }) => {
          expect(body.inventoryReservationStatus).toBe(
            inventoryReservationStatus,
          );
        });
    },
  );

  it('serves the generated OpenAPI document', () => {
    return request(app.getHttpServer())
      .get('/docs-json')
      .expect(200)
      .expect(({ body }) => {
        expect(body.paths['/api/commerce/checkout']).toBeDefined();
        expect(body.paths['/api/commerce/orders/{orderId}']).toBeDefined();
        expect(body.info.title).toBe('API de Commerce de LicoresYaaa');
        const checkout = body.paths['/api/commerce/checkout'].post;
        expect(checkout.summary).toBe(
          'Crear o consultar una compra para recogida',
        );
        expect(checkout.parameters).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'Idempotency-Key',
              required: true,
            }),
          ]),
        );
        expect(checkout.responses['202'].description).toContain('pendiente');
        expect(
          body.components.schemas.CheckoutDto.properties.customerName
            .description,
        ).toContain('cliente');
        expect(
          body.paths['/api/commerce/orders/{orderId}/actions'].post.responses[
            '201'
          ],
        ).toBeDefined();
      });
  });

  it('serves the Swagger interface', () => {
    return request(app.getHttpServer())
      .get('/docs/')
      .expect(200)
      .expect('Content-Type', /html/)
      .expect(/swagger-ui/i);
  });

  afterEach(async () => {
    await app.close();
  });
});
