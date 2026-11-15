import {
  ConflictException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  Database,
  DatabaseTransaction,
} from '../../infrastructure/database/database.types.js';
import {
  carts,
  cartItems,
  deliveryAttempts,
  orderDeliveries,
  orderInventoryReservations,
  orderItems,
  orders,
  payments,
} from '../../infrastructure/database/schema/commerce.schema.js';
import {
  InventoryReservationStatus,
  OrderStatus,
  type OrderStatus as OrderStatusValue,
} from '../orders/order.constants.js';
import {
  CustomerType,
  DeliveryAttemptMutationKind,
  DeliveryAttemptStatus,
} from './commerce.constants.js';
import { PaymentStatus } from '../payments/payment.constants.js';
import type { InventoryItem } from '../inventory-client/inventory-client.contract.js';
import type {
  CartsRepository,
  OrderTransitionInput,
  OrdersRepository,
  PaymentsRepository,
} from './commerce.repository.port.js';

@Injectable()
export class CommerceRepository
  implements CartsRepository, OrdersRepository, PaymentsRepository
{
  constructor(@InjectDrizzle() private readonly database: Database) {}

  async createCart(sessionId?: string) {
    const [cart] = await this.database
      .insert(carts)
      .values({
        customerId: null,
        customerType: CustomerType.GUEST,
        sessionId: sessionId ?? null,
      })
      .returning();
    if (!cart) {
      throw new InternalServerErrorException(
        'The cart could not be created.',
      );
    }
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
    if (!item) {
      throw new InternalServerErrorException(
        'The cart item could not be persisted.',
      );
    }
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
    expectedStatus: typeof payments.$inferSelect.status,
    status: typeof payments.$inferSelect.status,
    reference?: string,
    verifiedBy?: string,
  ) {
    const [payment] = await this.database
      .update(payments)
      .set({
        status,
        reference: reference ?? undefined,
        paidAt: status === PaymentStatus.APPROVED ? new Date() : undefined,
        verifiedBy: verifiedBy ?? undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(payments.id, paymentId),
          eq(payments.status, expectedStatus),
        ),
      )
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

  async applyOrderTransition(input: OrderTransitionInput) {
    return this.database.transaction(async (transaction) => {
      const [order] = await transaction
        .update(orders)
        .set({
          status: input.status,
          inventoryReservationStatus: input.inventoryReservationStatus,
          ...(input.cancellationReason !== undefined
            ? { cancellationReason: input.cancellationReason }
            : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.status, input.expectedStatus),
            eq(
              orders.inventoryReservationStatus,
              input.expectedReservationStatus,
            ),
          ),
        )
        .returning();
      if (!order) {
        throw new ConflictException(
          `Order ${input.orderId} changed before the transition could be saved.`,
        );
      }

      if (input.reservationMutation) {
        await this.applyReservationMutation(
          transaction,
          input.orderId,
          input.reservationMutation,
        );
      }

      if (input.newReservation) {
        await transaction.insert(orderInventoryReservations).values({
          orderId: input.orderId,
          reservationId: input.newReservation.reservationId,
          locationId: input.newReservation.locationId,
          status: InventoryReservationStatus.RESERVED,
        });
      }

      if (input.deliveryAttemptMutation) {
        await this.applyDeliveryAttemptMutation(
          transaction,
          input.orderId,
          input.deliveryAttemptMutation,
        );
      }

      if (input.status === OrderStatus.CANCELLED) {
        await transaction
          .update(payments)
          .set({ status: PaymentStatus.CANCELLED, updatedAt: new Date() })
          .where(
            and(
              eq(payments.orderId, input.orderId),
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

  private async applyReservationMutation(
    transaction: DatabaseTransaction,
    orderId: string,
    mutation: NonNullable<OrderTransitionInput['reservationMutation']>,
  ): Promise<void> {
    const [reservation] = await transaction
      .update(orderInventoryReservations)
      .set({ status: mutation.status, updatedAt: new Date() })
      .where(
        and(
          eq(orderInventoryReservations.orderId, orderId),
          eq(orderInventoryReservations.reservationId, mutation.reservationId),
          eq(orderInventoryReservations.status, mutation.expectedStatus),
        ),
      )
      .returning({ id: orderInventoryReservations.id });
    if (!reservation) {
      throw new ConflictException(
        `The inventory reservation for order ${orderId} changed before the transition could be saved.`,
      );
    }
  }

  private async applyDeliveryAttemptMutation(
    transaction: DatabaseTransaction,
    orderId: string,
    mutation: NonNullable<OrderTransitionInput['deliveryAttemptMutation']>,
  ): Promise<void> {
    const [delivery] = await transaction
      .select({ id: orderDeliveries.id })
      .from(orderDeliveries)
      .where(eq(orderDeliveries.orderId, orderId))
      .limit(1);
    if (!delivery) {
      throw new NotFoundException(`Delivery for order ${orderId} was not found.`);
    }

    const [latestAttempt] = await transaction
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.deliveryId, delivery.id))
      .orderBy(desc(deliveryAttempts.attemptNumber))
      .limit(1);
    if (mutation.kind === DeliveryAttemptMutationKind.START) {
      await transaction.insert(deliveryAttempts).values({
        deliveryId: delivery.id,
        attemptNumber: (latestAttempt?.attemptNumber ?? 0) + 1,
        status: DeliveryAttemptStatus.IN_TRANSIT,
        startedAt: new Date(),
        registeredBy: mutation.registeredBy,
      });
      return;
    }

    if (!latestAttempt) {
      throw new NotFoundException(
        `Delivery attempt for order ${orderId} was not found.`,
      );
    }

    const expectedStatus =
      mutation.kind === DeliveryAttemptMutationKind.RETURN
        ? DeliveryAttemptStatus.FAILED
        : DeliveryAttemptStatus.IN_TRANSIT;
    if (latestAttempt.status !== expectedStatus) {
      throw new ConflictException(
        `The latest delivery attempt for order ${orderId} is not ${expectedStatus.toLowerCase()}.`,
      );
    }

    const now = new Date();
    const [updatedAttempt] = await transaction
      .update(deliveryAttempts)
      .set({
        status:
          mutation.kind === DeliveryAttemptMutationKind.FAIL
            ? DeliveryAttemptStatus.FAILED
            : mutation.kind === DeliveryAttemptMutationKind.RETURN
              ? DeliveryAttemptStatus.RETURNED_TO_STORE
              : DeliveryAttemptStatus.DELIVERED,
        registeredBy: mutation.registeredBy,
        ...(mutation.kind === DeliveryAttemptMutationKind.FAIL
          ? { failureReason: mutation.reason, failedAt: now }
          : {}),
        ...(mutation.kind === DeliveryAttemptMutationKind.RETURN
          ? { returnedAt: now }
          : {}),
        ...(mutation.kind === DeliveryAttemptMutationKind.COMPLETE
          ? { deliveredAt: now }
          : {}),
      })
      .where(
        and(
          eq(deliveryAttempts.id, latestAttempt.id),
          eq(deliveryAttempts.status, expectedStatus),
        ),
      )
      .returning({ id: deliveryAttempts.id });
    if (!updatedAttempt) {
      throw new ConflictException(
        `The latest delivery attempt for order ${orderId} changed before the transition could be saved.`,
      );
    }
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
