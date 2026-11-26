import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, sql } from 'drizzle-orm';
import type {
  Database,
  DatabaseExecutor,
} from '../../infrastructure/database/database.types.js';
import {
  carts,
  cartItems,
  orderItems,
  orders,
  outboxEvents,
  payments,
} from '../../infrastructure/database/schema/commerce.schema.js';
import {
  InventoryReservationStatus,
  OrderStatus,
} from '../orders/order.constants.js';
import { PaymentStatus } from '../payments/payment.constants.js';
import { CartStatus } from './commerce.constants.js';
import {
  CARTS_REPOSITORY,
  type CartsRepository,
} from './commerce.repository.port.js';
import { RESERVE_STOCK_EVENT } from './checkout.constants.js';
import type {
  CheckoutRecord,
  CheckoutRepository,
  CreateCheckoutInput,
} from './checkout.contract.js';

@Injectable()
export class DrizzleCheckoutRepository implements CheckoutRepository {
  constructor(
    @InjectDrizzle() private readonly database: Database,
    @Inject(CARTS_REPOSITORY) private readonly cartsRepository: CartsRepository,
  ) {}

  getCart(cartId: string) {
    return this.cartsRepository.getCart(cartId);
  }

  findByKey(idempotencyKey: string): Promise<CheckoutRecord | null> {
    return this.findCheckout(this.database, idempotencyKey);
  }

  async create(input: CreateCheckoutInput): Promise<CheckoutRecord> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`,
      );
      const existing = await this.findCheckout(
        transaction,
        input.idempotencyKey,
      );
      if (existing) {
        this.assertSameRequest(existing, input.requestHash);
        return existing;
      }

      const [cart] = await transaction
        .select()
        .from(carts)
        .where(eq(carts.id, input.checkout.cartId))
        .for('update')
        .limit(1);
      if (!cart) {
        throw new NotFoundException('Cart was not found.');
      }
      if (cart.status !== CartStatus.ACTIVE) {
        throw new ConflictException('Cart is no longer active.');
      }

      const currentItems = await transaction
        .select()
        .from(cartItems)
        .where(eq(cartItems.cartId, cart.id));
      const currentById = new Map(currentItems.map((item) => [item.id, item]));
      if (
        currentItems.length !== input.items.length ||
        input.items.some((item) => {
          const current = currentById.get(item.cartItemId);
          return (
            !current ||
            current.variantId !== item.variant.id ||
            current.quantity !== item.quantity
          );
        })
      ) {
        throw new ConflictException(
          'Cart changed during checkout. Please retry.',
        );
      }

      const orderId = randomUUID();
      await transaction.insert(orders).values({
        id: orderId,
        orderNumber: orderId,
        customerId: cart.customerId,
        customerType: cart.customerType,
        customerName: input.checkout.customerName,
        customerPhone: input.checkout.customerPhone,
        customerEmail: input.checkout.customerEmail ?? null,
        fulfillmentType: input.checkout.fulfillmentType,
        status: OrderStatus.PENDING,
        inventoryReservationStatus: InventoryReservationStatus.PENDING,
        subtotalCop: input.subtotalCop,
        discountCop: 0n,
        deliveryFeeCop: 0n,
        totalCop: input.subtotalCop,
        checkoutIdempotencyKey: input.idempotencyKey,
      });
      await transaction.insert(orderItems).values(
        input.items.map((item) => ({
          orderId,
          variantId: item.variant.id,
          productNameSnapshot: item.variant.productName,
          variantNameSnapshot: item.variant.variantName,
          skuSnapshot: item.variant.sku,
          quantity: item.quantity,
          unitPriceCop: item.variant.priceCop,
          discountAmountCop: 0n,
          lineTotalCop: item.lineTotalCop,
        })),
      );
      await transaction.insert(payments).values({
        orderId,
        method: input.checkout.paymentMethod,
        status: PaymentStatus.PENDING,
        amountCop: input.subtotalCop,
      });
      await transaction.insert(outboxEvents).values({
        eventType: RESERVE_STOCK_EVENT,
        aggregateId: orderId,
        idempotencyKey: `reserve:${orderId}`,
        payload: { requestHash: input.requestHash },
      });
      await transaction
        .update(carts)
        .set({ status: CartStatus.CONVERTED, updatedAt: new Date() })
        .where(eq(carts.id, cart.id));

      return {
        orderId,
        status: OrderStatus.PENDING,
        inventoryReservationStatus: InventoryReservationStatus.PENDING,
        requestHash: input.requestHash,
      };
    });
  }

  private async findCheckout(
    executor: DatabaseExecutor,
    idempotencyKey: string,
  ): Promise<CheckoutRecord | null> {
    const [order] = await executor
      .select({
        orderId: orders.id,
        status: orders.status,
        inventoryReservationStatus: orders.inventoryReservationStatus,
      })
      .from(orders)
      .where(eq(orders.checkoutIdempotencyKey, idempotencyKey))
      .limit(1);
    if (!order) {
      return null;
    }

    const [event] = await executor
      .select({ payload: outboxEvents.payload })
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.aggregateId, order.orderId),
          eq(outboxEvents.eventType, RESERVE_STOCK_EVENT),
        ),
      )
      .limit(1);
    if (!event || typeof event.payload.requestHash !== 'string') {
      throw new ConflictException(
        'Checkout idempotency key is already in use.',
      );
    }
    return { ...order, requestHash: event.payload.requestHash };
  }

  private assertSameRequest(record: CheckoutRecord, requestHash: string): void {
    if (record.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was used with a different checkout.',
      );
    }
  }
}
