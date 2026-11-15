import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../infrastructure/database/database.types.js';
import {
  carts,
  cartItems,
  deliveryAttempts,
  orderDeliveries,
  orderInventoryReservations,
  orderItems,
  orders,
  outboxEvents,
  payments,
} from '../../infrastructure/database/schema/commerce.schema.js';
import {
  InventoryReservationStatus,
  OrderStatus,
  type OrderStatus as OrderStatusValue,
} from '../orders/order.constants.js';
import { PaymentStatus } from '../payments/payment.constants.js';
import type {
  InventoryItem,
  InventoryReservation,
} from '../inventory-client/inventory-client.service.js';

@Injectable()
export class CommerceRepository {
  constructor(@InjectDrizzle() private readonly database: Database) {}

  async createCart(sessionId?: string) {
    const [cart] = await this.database
      .insert(carts)
      .values({
        customerId: null,
        customerType: 'GUEST',
        sessionId: sessionId ?? null,
      })
      .returning();
    return cart;
  }

  async getCart(cartId: string) {
    const [cart] = await this.database
      .select()
      .from(carts)
      .where(eq(carts.id, cartId))
      .limit(1);
    if (!cart) {
      return null;
    }

    const items = await this.database
      .select()
      .from(cartItems)
      .where(eq(cartItems.cartId, cartId));
    return { ...cart, items };
  }

  async addCartItem(cartId: string, variantId: string, quantity: number) {
    const [item] = await this.database
      .insert(cartItems)
      .values({ cartId, variantId, quantity })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.variantId],
        set: {
          quantity: sql`${cartItems.quantity} + ${quantity}`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return item;
  }

  async updateCartItem(cartId: string, itemId: string, quantity: number) {
    const [item] = await this.database
      .update(cartItems)
      .set({ quantity, updatedAt: new Date() })
      .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)))
      .returning();
    return item ?? null;
  }

  async deleteCartItem(cartId: string, itemId: string): Promise<boolean> {
    const deleted = await this.database
      .delete(cartItems)
      .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)))
      .returning({ id: cartItems.id });
    return deleted.length > 0;
  }

  async recordReservation(
    orderId: string,
    reservation: InventoryReservation,
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction.insert(orderInventoryReservations).values({
        orderId,
        reservationId: reservation.reservationId,
        locationId: reservation.locationId,
        status: InventoryReservationStatus.RESERVED,
      });
      await transaction
        .update(orders)
        .set({
          inventoryReservationStatus: InventoryReservationStatus.RESERVED,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));
      await transaction
        .update(outboxEvents)
        .set({ status: 'COMPLETED', processedAt: new Date() })
        .where(eq(outboxEvents.aggregateId, orderId));
    });
  }

  async getOrder(orderId: string) {
    const [order] = await this.database
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) {
      return null;
    }

    const [items, orderPayments, delivery, reservations] = await Promise.all([
      this.database
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId)),
      this.database
        .select()
        .from(payments)
        .where(eq(payments.orderId, orderId)),
      this.database
        .select()
        .from(orderDeliveries)
        .where(eq(orderDeliveries.orderId, orderId))
        .limit(1),
      this.database
        .select()
        .from(orderInventoryReservations)
        .where(eq(orderInventoryReservations.orderId, orderId))
        .orderBy(desc(orderInventoryReservations.createdAt)),
    ]);

    return {
      ...order,
      items,
      payments: orderPayments,
      delivery: delivery[0] ?? null,
      inventoryReservations: reservations,
    };
  }

  async listOrders(status?: OrderStatusValue, limit = 25) {
    if (status) {
      return this.database
        .select()
        .from(orders)
        .where(eq(orders.status, status))
        .orderBy(desc(orders.createdAt))
        .limit(limit);
    }
    return this.database
      .select()
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(limit);
  }

  async getPayment(paymentId: string) {
    const [payment] = await this.database
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);
    return payment ?? null;
  }

  async updatePayment(
    paymentId: string,
    status: typeof payments.$inferSelect.status,
    reference?: string,
  ) {
    const [payment] = await this.database
      .update(payments)
      .set({
        status,
        reference: reference ?? undefined,
        paidAt: status === PaymentStatus.APPROVED ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId))
      .returning();
    return payment ?? null;
  }

  async getReservationForOrder(orderId: string) {
    const [reservation] = await this.database
      .select()
      .from(orderInventoryReservations)
      .where(eq(orderInventoryReservations.orderId, orderId))
      .orderBy(desc(orderInventoryReservations.createdAt))
      .limit(1);
    return reservation ?? null;
  }

  async updateOrderState(
    orderId: string,
    status: typeof orders.$inferSelect.status,
    inventoryReservationStatus?: typeof orders.$inferSelect.inventoryReservationStatus,
    cancellationReason?: string,
  ) {
    return this.database.transaction(async (transaction) => {
      const [order] = await transaction
        .update(orders)
        .set({
          status,
          ...(inventoryReservationStatus ? { inventoryReservationStatus } : {}),
          ...(cancellationReason ? { cancellationReason } : {}),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();
      if (!order) {
        throw new NotFoundException(`Order ${orderId} was not found.`);
      }
      if (status === OrderStatus.CANCELLED) {
        await transaction
          .update(payments)
          .set({ status: PaymentStatus.CANCELLED, updatedAt: new Date() })
          .where(
            and(
              eq(payments.orderId, orderId),
              inArray(payments.status, [
                PaymentStatus.PENDING,
                PaymentStatus.UNDER_REVIEW,
              ]),
            ),
          );
      }
      return order;
    });
  }

  async updateReservationStatus(
    reservationId: string,
    status: typeof orderInventoryReservations.$inferSelect.status,
  ): Promise<void> {
    await this.database
      .update(orderInventoryReservations)
      .set({ status, updatedAt: new Date() })
      .where(eq(orderInventoryReservations.reservationId, reservationId));
  }

  async getItemsForOrder(orderId: string): Promise<readonly InventoryItem[]> {
    const items = await this.database
      .select({
        variantId: orderItems.variantId,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    return items;
  }

  async recordDeliveryFailure(orderId: string, reason: string): Promise<void> {
    const [delivery] = await this.database
      .select()
      .from(orderDeliveries)
      .where(eq(orderDeliveries.orderId, orderId))
      .limit(1);
    if (!delivery) {
      throw new NotFoundException(
        `Delivery for order ${orderId} was not found.`,
      );
    }

    await this.database.transaction(async (transaction) => {
      const [attempt] = await transaction
        .select({ attemptNumber: deliveryAttempts.attemptNumber })
        .from(deliveryAttempts)
        .where(eq(deliveryAttempts.deliveryId, delivery.id))
        .orderBy(desc(deliveryAttempts.attemptNumber))
        .limit(1);
      if (!attempt) {
        throw new NotFoundException(
          `Delivery attempt for order ${orderId} was not found.`,
        );
      }

      const [updatedAttempt] = await transaction
        .update(deliveryAttempts)
        .set({
          status: 'FAILED',
          failureReason: reason,
          failedAt: new Date(),
        })
        .where(
          and(
            eq(deliveryAttempts.deliveryId, delivery.id),
            eq(deliveryAttempts.attemptNumber, attempt.attemptNumber),
            eq(deliveryAttempts.status, 'IN_TRANSIT'),
          ),
        )
        .returning({ id: deliveryAttempts.id });
      if (!updatedAttempt) {
        throw new ConflictException(
          `The latest delivery attempt for order ${orderId} is not in transit.`,
        );
      }
    });
  }

  async recordDeliveryAttemptStart(orderId: string): Promise<void> {
    const [delivery] = await this.database
      .select()
      .from(orderDeliveries)
      .where(eq(orderDeliveries.orderId, orderId))
      .limit(1);
    if (!delivery) {
      throw new NotFoundException(
        `Delivery for order ${orderId} was not found.`,
      );
    }

    await this.database.transaction(async (transaction) => {
      const attempts = await transaction
        .select({ attemptNumber: deliveryAttempts.attemptNumber })
        .from(deliveryAttempts)
        .where(eq(deliveryAttempts.deliveryId, delivery.id))
        .orderBy(desc(deliveryAttempts.attemptNumber));
      await transaction.insert(deliveryAttempts).values({
        deliveryId: delivery.id,
        attemptNumber: (attempts[0]?.attemptNumber ?? 0) + 1,
        status: 'IN_TRANSIT',
        startedAt: new Date(),
      });
    });
  }

  async updateLatestDeliveryAttempt(
    orderId: string,
    status: 'RETURNED_TO_STORE' | 'DELIVERED',
  ): Promise<void> {
    const [delivery] = await this.database
      .select()
      .from(orderDeliveries)
      .where(eq(orderDeliveries.orderId, orderId))
      .limit(1);
    if (!delivery) {
      throw new NotFoundException(
        `Delivery for order ${orderId} was not found.`,
      );
    }

    const [attempt] = await this.database
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.deliveryId, delivery.id))
      .orderBy(desc(deliveryAttempts.attemptNumber))
      .limit(1);
    if (!attempt) {
      throw new NotFoundException(
        `Delivery attempt for order ${orderId} was not found.`,
      );
    }
    await this.database
      .update(deliveryAttempts)
      .set({
        status,
        ...(status === 'RETURNED_TO_STORE'
          ? { returnedAt: new Date() }
          : { deliveredAt: new Date() }),
      })
      .where(eq(deliveryAttempts.id, attempt.id));
  }

  async getLatestDeliveryAttempt(orderId: string) {
    const [delivery] = await this.database
      .select()
      .from(orderDeliveries)
      .where(eq(orderDeliveries.orderId, orderId))
      .limit(1);
    if (!delivery) {
      throw new NotFoundException(`Delivery for order ${orderId} was not found.`);
    }

    const [attempt] = await this.database
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.deliveryId, delivery.id))
      .orderBy(desc(deliveryAttempts.attemptNumber))
      .limit(1);
    if (!attempt) {
      throw new NotFoundException(
        `Delivery attempt for order ${orderId} was not found.`,
      );
    }
    return attempt;
  }
}
