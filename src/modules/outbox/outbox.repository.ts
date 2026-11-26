import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type {
  Database,
  DatabaseTransaction,
} from '../../infrastructure/database/database.types.js';
import {
  orderInventoryReservations,
  orderItems,
  orders,
  outboxEvents,
  payments,
} from '../../infrastructure/database/schema/commerce.schema.js';
import {
  RESERVE_STOCK_EVENT,
  OUTBOX_RETRY_DELAY_MS,
} from '../commerce/checkout.constants.js';
import {
  InventoryReservationStatus,
  OrderStatus,
} from '../orders/order.constants.js';
import { PaymentStatus } from '../payments/payment.constants.js';
import { OUTBOX_LEASE_MS, OutboxStatus } from './outbox.constants.js';
import type { OutboxRepository, ReservationJob } from './outbox.contract.js';
import type { InventoryReservation } from '../inventory-client/inventory-client.contract.js';

@Injectable()
export class DrizzleOutboxRepository implements OutboxRepository {
  constructor(@InjectDrizzle() private readonly database: Database) {}

  async claimReservation(): Promise<ReservationJob | null> {
    return this.database.transaction(async (transaction) => {
      const now = new Date();
      const [event] = await transaction
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.eventType, RESERVE_STOCK_EVENT),
            or(
              and(
                eq(outboxEvents.status, OutboxStatus.PENDING),
                or(
                  isNull(outboxEvents.nextAttemptAt),
                  lte(outboxEvents.nextAttemptAt, now),
                ),
              ),
              and(
                eq(outboxEvents.status, OutboxStatus.PROCESSING),
                lte(outboxEvents.nextAttemptAt, now),
              ),
            ),
          ),
        )
        .orderBy(outboxEvents.createdAt)
        .limit(1)
        .for('update', { skipLocked: true });
      if (!event) {
        return null;
      }

      const [claimed] = await transaction
        .update(outboxEvents)
        .set({
          status: OutboxStatus.PROCESSING,
          attempts: sql`${outboxEvents.attempts} + 1`,
          nextAttemptAt: new Date(now.getTime() + OUTBOX_LEASE_MS),
        })
        .where(eq(outboxEvents.id, event.id))
        .returning();
      if (!claimed) {
        throw new ConflictException('Outbox event could not be claimed.');
      }
      const items = await transaction
        .select({
          variantId: orderItems.variantId,
          quantity: orderItems.quantity,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, claimed.aggregateId));
      if (items.length === 0) {
        throw new ConflictException('The reservation order has no items.');
      }
      return {
        id: claimed.id,
        orderId: claimed.aggregateId,
        idempotencyKey: claimed.idempotencyKey,
        attempt: claimed.attempts,
        items,
      };
    });
  }

  async completeReservation(
    job: ReservationJob,
    reservation: InventoryReservation,
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      if (!(await this.lockClaim(transaction, job))) {
        return;
      }
      const [order] = await transaction
        .update(orders)
        .set({
          inventoryReservationStatus: InventoryReservationStatus.RESERVED,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orders.id, job.orderId),
            eq(orders.status, OrderStatus.PENDING),
            eq(
              orders.inventoryReservationStatus,
              InventoryReservationStatus.PENDING,
            ),
          ),
        )
        .returning({ id: orders.id });
      if (!order) {
        throw new ConflictException(
          'Order changed while the reservation was being processed.',
        );
      }
      await transaction.insert(orderInventoryReservations).values({
        orderId: job.orderId,
        reservationId: reservation.reservationId,
        locationId: reservation.locationId,
        status: InventoryReservationStatus.RESERVED,
      });
      await transaction
        .update(outboxEvents)
        .set({
          status: OutboxStatus.COMPLETED,
          nextAttemptAt: null,
          lastError: null,
          processedAt: new Date(),
        })
        .where(eq(outboxEvents.id, job.id));
    });
  }

  async rejectReservation(job: ReservationJob): Promise<void> {
    await this.database.transaction(async (transaction) => {
      if (!(await this.lockClaim(transaction, job))) {
        return;
      }
      const [order] = await transaction
        .update(orders)
        .set({
          status: OrderStatus.CANCELLED,
          inventoryReservationStatus: InventoryReservationStatus.FAILED,
          cancellationReason: 'Insufficient inventory',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orders.id, job.orderId),
            eq(orders.status, OrderStatus.PENDING),
            eq(
              orders.inventoryReservationStatus,
              InventoryReservationStatus.PENDING,
            ),
          ),
        )
        .returning({ id: orders.id });
      if (!order) {
        throw new ConflictException(
          'Order changed while the reservation was being rejected.',
        );
      }
      await transaction
        .update(payments)
        .set({ status: PaymentStatus.CANCELLED, updatedAt: new Date() })
        .where(
          and(
            eq(payments.orderId, job.orderId),
            eq(payments.status, PaymentStatus.PENDING),
          ),
        );
      await transaction
        .update(outboxEvents)
        .set({
          status: OutboxStatus.FAILED,
          lastError: 'Insufficient inventory',
          nextAttemptAt: null,
          processedAt: new Date(),
        })
        .where(eq(outboxEvents.id, job.id));
    });
  }

  async retryReservation(job: ReservationJob, message: string): Promise<void> {
    await this.database
      .update(outboxEvents)
      .set({
        status: OutboxStatus.PENDING,
        lastError: message,
        nextAttemptAt: new Date(Date.now() + OUTBOX_RETRY_DELAY_MS),
      })
      .where(
        and(
          eq(outboxEvents.id, job.id),
          eq(outboxEvents.status, OutboxStatus.PROCESSING),
          eq(outboxEvents.attempts, job.attempt),
        ),
      );
  }

  private async lockClaim(
    transaction: DatabaseTransaction,
    job: ReservationJob,
  ): Promise<boolean> {
    const [event] = await transaction
      .select({ id: outboxEvents.id })
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.id, job.id),
          eq(outboxEvents.status, OutboxStatus.PROCESSING),
          eq(outboxEvents.attempts, job.attempt),
        ),
      )
      .for('update')
      .limit(1);
    return !!event;
  }
}
