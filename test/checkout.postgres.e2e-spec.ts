import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Database } from './../src/infrastructure/database/database.types.js';
import { schema } from './../src/infrastructure/database/schema/index.js';
import {
  carts,
  orderInventoryReservations,
  orderItems,
  orders,
  outboxEvents,
  payments,
} from './../src/infrastructure/database/schema/commerce.schema.js';
import {
  CATALOG_CLIENT,
  type CatalogClient,
} from './../src/modules/catalog-client/catalog-client.contract.js';
import { CommerceModule } from './../src/modules/commerce/commerce.module.js';
import { RESERVE_STOCK_EVENT } from './../src/modules/commerce/checkout.constants.js';
import {
  INVENTORY_CLIENT,
  type InventoryClient,
} from './../src/modules/inventory-client/inventory-client.contract.js';
import { OutboxStatus } from './../src/modules/outbox/outbox.constants.js';
import { OutboxProcessor } from './../src/modules/outbox/outbox.processor.js';

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;
const originalDatabaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('Checkout HTTP with PostgreSQL', () => {
  let app: INestApplication<App>;
  let pool: Pool;
  let database: Database;
  let cartId: string | undefined;
  const key = randomUUID();
  const variantId = randomUUID();
  const reservationId = randomUUID();
  const reserve = vi.fn<InventoryClient['reserve']>().mockResolvedValue({
    reservationId,
    locationId: randomUUID(),
    status: 'ACTIVE',
  });

  beforeAll(async () => {
    if (!databaseUrl || !/test/i.test(new URL(databaseUrl).pathname)) {
      throw new Error(
        'POSTGRES_TEST_DATABASE_URL must point to a dedicated test database.',
      );
    }
    pool = new Pool({ connectionString: databaseUrl });
    database = drizzle(pool, { schema });
    await migrate(database, {
      migrationsFolder: join(process.cwd(), 'drizzle'),
    });
    const pending = await database
      .select({ id: outboxEvents.id })
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.eventType, RESERVE_STOCK_EVENT),
          inArray(outboxEvents.status, [
            OutboxStatus.PENDING,
            OutboxStatus.PROCESSING,
          ]),
        ),
      )
      .limit(1);
    if (pending.length) {
      throw new Error(
        'The dedicated test database contains pending reservation events.',
      );
    }
    process.env.DATABASE_URL = databaseUrl;
    const catalog: CatalogClient = {
      getVariant: vi.fn<CatalogClient['getVariant']>().mockResolvedValue({
        id: variantId,
        productId: randomUUID(),
        productName: 'Product',
        variantName: 'Bottle',
        sku: 'SKU',
        priceCop: 5000n,
        isPurchasable: true,
      }),
    };
    const inventory: InventoryClient = {
      reserve,
      getAvailability: vi.fn<InventoryClient['getAvailability']>(),
      release: vi.fn<InventoryClient['release']>(),
      dispatch: vi.fn<InventoryClient['dispatch']>(),
      registerReturn: vi.fn<InventoryClient['registerReturn']>(),
    };
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        CommerceModule,
      ],
    })
      .overrideProvider(CATALOG_CLIENT)
      .useValue(catalog)
      .overrideProvider(INVENTORY_CLIENT)
      .useValue(inventory)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/commerce');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    if (app) {
      await app.close();
    }
    if (database) {
      const [order] = await database
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.checkoutIdempotencyKey, key));
      if (order) {
        await database
          .delete(outboxEvents)
          .where(eq(outboxEvents.aggregateId, order.id));
        await database
          .delete(orderInventoryReservations)
          .where(eq(orderInventoryReservations.orderId, order.id));
        await database.delete(payments).where(eq(payments.orderId, order.id));
        await database
          .delete(orderItems)
          .where(eq(orderItems.orderId, order.id));
        await database.delete(orders).where(eq(orders.id, order.id));
      }
      if (cartId) {
        await database.delete(carts).where(eq(carts.id, cartId));
      }
    }
    if (pool) {
      await pool.end();
    }
  });

  it('creates a checkout and reports confirmation after the outbox reserves stock', async () => {
    const cartResponse = await request(app.getHttpServer())
      .post('/api/commerce/carts')
      .send({})
      .expect(201);
    const cart: { id: string } = cartResponse.body;
    cartId = cart.id;
    await request(app.getHttpServer())
      .post(`/api/commerce/carts/${cartId}/items`)
      .send({ variantId, quantity: 2 })
      .expect(201);

    const body = {
      cartId,
      customerName: 'Test',
      customerPhone: '3001234567',
      fulfillmentType: 'PICKUP',
      paymentMethod: 'CASH',
    };
    const pending = await request(app.getHttpServer())
      .post('/api/commerce/checkout')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(202);
    const pendingBody: { orderId: string; inventoryReservationStatus: string } =
      pending.body;
    expect(pendingBody.inventoryReservationStatus).toBe('PENDING');

    await app.get(OutboxProcessor).process();
    const completed = await request(app.getHttpServer())
      .post('/api/commerce/checkout')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(200);
    const completedBody: {
      orderId: string;
      inventoryReservationStatus: string;
    } = completed.body;
    expect(completedBody).toMatchObject({
      orderId: pendingBody.orderId,
      inventoryReservationStatus: 'RESERVED',
    });
    const reservations = await database
      .select()
      .from(orderInventoryReservations)
      .where(eq(orderInventoryReservations.orderId, pendingBody.orderId));
    expect(reservations).toHaveLength(1);
    expect(reservations[0]?.reservationId).toBe(reservationId);
    expect(reserve).toHaveBeenCalledTimes(1);
  });
});
