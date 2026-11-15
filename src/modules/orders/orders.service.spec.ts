import { ConflictException } from '@nestjs/common';
import {
  OrdersService,
  type OrderLifecycleState,
  type PaymentLifecycleState,
} from './orders.service.js';

describe('OrdersService', () => {
  const service = new OrdersService();

  const makeOrder = (
    overrides: Partial<OrderLifecycleState> = {},
  ): OrderLifecycleState => ({
    status: 'PENDING',
    fulfillmentType: 'DELIVERY',
    inventoryReservationStatus: 'PENDING',
    ...overrides,
  });

  const makePayment = (
    overrides: Partial<PaymentLifecycleState> = {},
  ): PaymentLifecycleState => ({
    method: 'CASH',
    status: 'PENDING',
    ...overrides,
  });

  it('requires a confirmed reservation before preparation', () => {
    const confirmed = service.confirm(makeOrder());

    expect(() => service.startPreparation(confirmed)).toThrow(
      ConflictException,
    );
  });

  it('requires an approved transfer and confirmed dispatch before delivery', () => {
    const ready = {
      ...makeOrder({
        status: 'READY',
        inventoryReservationStatus: 'RESERVED',
      }),
    };

    expect(() =>
      service.confirmDispatch(ready, makePayment({
        method: 'BANK_TRANSFER',
        status: 'UNDER_REVIEW',
      }), true),
    ).toThrow(ConflictException);

    expect(() =>
      service.confirmDispatch(
        ready,
        makePayment(),
        false,
      ),
    ).toThrow(ConflictException);

    expect(
      service.confirmDispatch(
        ready,
        makePayment({
          method: 'BANK_TRANSFER',
          status: 'APPROVED',
        }),
        true,
      ),
    ).toMatchObject({
      status: 'ON_DELIVERY',
      inventoryReservationStatus: 'DISPATCHED',
    });
  });

  it('requires pickup fulfillment and dispatch before pickup completion', () => {
    const ready = makeOrder({
      status: 'READY',
      fulfillmentType: 'PICKUP',
      inventoryReservationStatus: 'RESERVED',
    });

    expect(
      service.confirmPickup(ready, makePayment(), true),
    ).toMatchObject({
      status: 'PICKED_UP',
      inventoryReservationStatus: 'DISPATCHED',
    });

    expect(() =>
      service.confirmDispatch(ready, makePayment(), true),
    ).toThrow(ConflictException);
  });

  it('requires a released reservation before cancellation', () => {
    const ready = makeOrder({
      status: 'READY',
      inventoryReservationStatus: 'RESERVED',
    });

    expect(() => service.cancel(ready, false)).toThrow(ConflictException);
    expect(service.cancel(ready, true)).toMatchObject({
      status: 'CANCELLED',
      inventoryReservationStatus: 'RELEASED',
    });
  });

  it('requires a processed return and new reservation before retrying delivery', () => {
    const failed = makeOrder({
      status: 'DELIVERY_FAILED',
      inventoryReservationStatus: 'DISPATCHED',
    });

    expect(() => service.confirmReturnToStore(failed, false)).toThrow(
      ConflictException,
    );

    const returned = service.confirmReturnToStore(failed, true);
    expect(() => service.retryDelivery(returned, false)).toThrow(
      ConflictException,
    );
    expect(service.retryDelivery(returned, true)).toMatchObject({
      status: 'READY',
      inventoryReservationStatus: 'RESERVED',
    });
  });

  it('does not allow cancelling a dispatched order before its return', () => {
    expect(() =>
      service.cancel(
        makeOrder({
          status: 'ON_DELIVERY',
          inventoryReservationStatus: 'DISPATCHED',
        }),
        true,
      ),
    ).toThrow(ConflictException);
  });
});
