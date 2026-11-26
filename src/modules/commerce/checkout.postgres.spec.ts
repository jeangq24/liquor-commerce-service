import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { schema } from '../../infrastructure/database/schema/index.js';
import {
  carts,
  orderInventoryReservations,
  orderItems,
  orders,
  outboxEvents,
  payments,
} from '../../infrastructure/database/schema/commerce.schema.js';
import type { Database } from '../../infrastructure/database/database.types.js';
import type { CatalogClient } from '../catalog-client/catalog-client.contract.js';
import type { InventoryClient } from '../inventory-client/inventory-client.contract.js';
import { InventoryInsufficientStockException } from '../inventory-client/inventory-insufficient-stock.exception.js';
import {
  FulfillmentType,
  InventoryReservationStatus,
  OrderStatus,
} from '../orders/order.constants.js';
import { PaymentMethod, PaymentStatus } from '../payments/payment.constants.js';
import { CartStatus } from './commerce.constants.js';
import { OutboxProcessor } from '../outbox/outbox.processor.js';
import { DrizzleOutboxRepository } from '../outbox/outbox.repository.js';
import type { OutboxRepository } from '../outbox/outbox.contract.js';
import { CommerceRepository } from './commerce.repository.js';
import { DrizzleCheckoutRepository } from './checkout.repository.js';
import { CheckoutService } from './checkout.service.js';
import { CheckoutResponseMapper } from './checkout-response.mapper.js';
import { RESERVE_STOCK_EVENT } from './checkout.constants.js';
import { OutboxStatus } from '../outbox/outbox.constants.js';

const testDatabaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('Checkout PostgreSQL integration', () => {
  let pool: Pool;
  let database: Database;
  let commerce: CommerceRepository;
  let checkoutRepository: DrizzleCheckoutRepository;
  let outbox: DrizzleOutboxRepository;
  const cartIds: string[] = [];
  const keys: string[] = [];

  beforeAll(async () => {
    if (!testDatabaseUrl || !/test/i.test(new URL(testDatabaseUrl).pathname)) {
      throw new Error(
        'POSTGRES_TEST_DATABASE_URL must point to a dedicated test database.',
      );
    }
    pool = new Pool({ connectionString: testDatabaseUrl });
    database = drizzle(pool, { schema });
    await migrate(database, {
      migrationsFolder: join(process.cwd(), 'drizzle'),
    });
    commerce = new CommerceRepository(database);
    checkoutRepository = new DrizzleCheckoutRepository(database, commerce);
    outbox = new DrizzleOutboxRepository(database);
  });

  beforeEach(async () => {
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
  });

  afterEach(async () => {
    for (const key of keys.splice(0)) {
      const [order] = await database
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.checkoutIdempotencyKey, key));
      if (!order) {
        continue;
      }
      await database
        .delete(outboxEvents)
        .where(eq(outboxEvents.aggregateId, order.id));
      await database
        .delete(orderInventoryReservations)
        .where(eq(orderInventoryReservations.orderId, order.id));
      await database.delete(payments).where(eq(payments.orderId, order.id));
      await database.delete(orderItems).where(eq(orderItems.orderId, order.id));
      await database.delete(orders).where(eq(orders.id, order.id));
    }
    for (const cartId of cartIds.splice(0)) {
      await database.delete(carts).where(eq(carts.id, cartId));
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  async function prepareCheckout() {
    const cart = await commerce.createCart();
    cartIds.push(cart.id);
    const variantId = randomUUID();
    await commerce.addCartItem(cart.id, variantId, 2);
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
    const service = new CheckoutService(
      checkoutRepository,
      catalog,
      new CheckoutResponseMapper(),
    );
    const key = randomUUID();
    keys.push(key);
    const request = {
      cartId: cart.id,
      customerName: 'Test',
      customerPhone: '3001234567',
      fulfillmentType: FulfillmentType.PICKUP,
      paymentMethod: PaymentMethod.CASH,
    };
    return { service, key, request, variantId };
  }

  it('creates one order concurrently and recovers after Inventory succeeded but Commerce failed', async () => {
    const { service, key, request } = await prepareCheckout();
    const [first, second] = await Promise.all([
      service.checkout(request, key),
      service.checkout(request, key),
    ]);
    expect(second.orderId).toBe(first.orderId);
    const [event] = await database
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, first.orderId));
    expect(event).toBeDefined();
    if (!event) {
      throw new Error('Checkout event was not created.');
    }

    let firstCommit = true;
    const repository: OutboxRepository = {
      claimReservation: () => outbox.claimReservation(),
      completeReservation: async (job, reservation) => {
        if (firstCommit) {
          firstCommit = false;
          throw new Error(
            'Simulated database failure after Inventory confirmed',
          );
        }
        await outbox.completeReservation(job, reservation);
      },
      rejectReservation: (job) => outbox.rejectReservation(job),
      retryReservation: (job, message) => outbox.retryReservation(job, message),
    };
    const reserve = vi.fn<InventoryClient['reserve']>().mockResolvedValue({
      reservationId: randomUUID(),
      locationId: randomUUID(),
      status: 'ACTIVE',
    });
    const inventory: InventoryClient = {
      reserve,
      getAvailability: vi.fn<InventoryClient['getAvailability']>(),
      release: vi.fn<InventoryClient['release']>(),
      dispatch: vi.fn<InventoryClient['dispatch']>(),
      registerReturn: vi.fn<InventoryClient['registerReturn']>(),
    };
    const processor = new OutboxProcessor(repository, inventory);
    await processor.process();
    await database
      .update(outboxEvents)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(outboxEvents.id, event.id));
    await processor.process();

    expect(reserve).toHaveBeenCalledTimes(2);
    expect(reserve.mock.calls[0]![1]).toBe(reserve.mock.calls[1]![1]);
    const result = await service.checkout(request, key);
    expect(result.inventoryReservationStatus).toBe(
      InventoryReservationStatus.RESERVED,
    );
    const reservations = await database
      .select()
      .from(orderInventoryReservations)
      .where(eq(orderInventoryReservations.orderId, first.orderId));
    expect(reservations).toHaveLength(1);
  });

  it('cancels the order and payment after a definite stock rejection', async () => {
    const { service, key, request } = await prepareCheckout();
    const created = await service.checkout(request, key);
    const inventory: InventoryClient = {
      reserve: vi
        .fn<InventoryClient['reserve']>()
        .mockRejectedValue(new InventoryInsufficientStockException()),
      getAvailability: vi.fn<InventoryClient['getAvailability']>(),
      release: vi.fn<InventoryClient['release']>(),
      dispatch: vi.fn<InventoryClient['dispatch']>(),
      registerReturn: vi.fn<InventoryClient['registerReturn']>(),
    };
    await new OutboxProcessor(outbox, inventory).process();
    const result = await service.checkout(request, key);
    expect(result.status).toBe(OrderStatus.CANCELLED);
    expect(result.inventoryReservationStatus).toBe(
      InventoryReservationStatus.FAILED,
    );
    const [payment] = await database
      .select()
      .from(payments)
      .where(eq(payments.orderId, created.orderId));
    expect(payment?.status).toBe(PaymentStatus.CANCELLED);
  });

  it('prevents stale workers from finalizing a reservation after a lease expires', async () => {
    const { service, key, request } = await prepareCheckout();
    const checkout = await service.checkout(request, key);
    const claims = await Promise.all([
      outbox.claimReservation(),
      outbox.claimReservation(),
    ]);
    const first = claims.find((claim) => claim !== null);
    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
    if (!first) {
      throw new Error('Expected a reservation claim.');
    }

    await database
      .update(outboxEvents)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(outboxEvents.id, first.id));
    const second = await outbox.claimReservation();
    if (!second) {
      throw new Error('Expected a recovered reservation claim.');
    }
    expect(second.attempt).toBe(first.attempt + 1);
    const reservation = {
      reservationId: randomUUID(),
      locationId: randomUUID(),
      status: 'ACTIVE',
    } as const;
    await outbox.completeReservation(first, reservation);
    expect(
      (await service.checkout(request, key)).inventoryReservationStatus,
    ).toBe(InventoryReservationStatus.PENDING);
    await outbox.completeReservation(second, reservation);
    expect(
      (await service.checkout(request, key)).inventoryReservationStatus,
    ).toBe(InventoryReservationStatus.RESERVED);
    const rows = await database
      .select()
      .from(orderInventoryReservations)
      .where(eq(orderInventoryReservations.orderId, checkout.orderId));
    expect(rows).toHaveLength(1);
  });

  it('rejects a checkout if the cart changes while Catalog is being consulted', async () => {
    const { key, request, variantId } = await prepareCheckout();
    const catalog: CatalogClient = {
      getVariant: async () => {
        await commerce.addCartItem(request.cartId, variantId, 1);
        return {
          id: variantId,
          productId: randomUUID(),
          productName: 'Product',
          variantName: 'Bottle',
          sku: 'SKU',
          priceCop: 5000n,
          isPurchasable: true,
        };
      },
    };
    const service = new CheckoutService(
      checkoutRepository,
      catalog,
      new CheckoutResponseMapper(),
    );
    await expect(service.checkout(request, key)).rejects.toThrow(
      'Cart changed during checkout',
    );
    expect(await checkoutRepository.findByKey(key)).toBeNull();
    expect((await commerce.getCart(request.cartId))?.status).toBe(
      CartStatus.ACTIVE,
    );
  });

  it('rolls back the order and cart conversion when an item cannot be stored', async () => {
    const { key, request, variantId } = await prepareCheckout();
    const cart = await commerce.getCart(request.cartId);
    const item = cart?.items[0];
    if (!item) {
      throw new Error('Expected a cart item.');
    }
    await expect(
      checkoutRepository.create({
        checkout: request,
        idempotencyKey: key,
        requestHash: 'test',
        subtotalCop: 10000n,
        items: [
          {
            cartItemId: item.id,
            quantity: item.quantity,
            lineTotalCop: 10000n,
            variant: {
              id: variantId,
              productId: randomUUID(),
              productName: 'Product',
              variantName: 'Bottle',
              sku: 'x'.repeat(101),
              priceCop: 5000n,
              isPurchasable: true,
            },
          },
        ],
      }),
    ).rejects.toThrow();
    expect(await checkoutRepository.findByKey(key)).toBeNull();
    expect((await commerce.getCart(request.cartId))?.status).toBe(
      CartStatus.ACTIVE,
    );
  });
});
