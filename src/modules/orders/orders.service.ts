import { ConflictException, Injectable } from '@nestjs/common';
import {
  FulfillmentType,
  InventoryReservationStatus,
  OrderStatus,
  type FulfillmentType as FulfillmentTypeValue,
  type InventoryReservationStatus as InventoryReservationStatusValue,
  type OrderStatus as OrderStatusValue,
} from './order.constants.js';
import {
  PaymentMethod,
  PaymentStatus,
  type PaymentMethod as PaymentMethodValue,
  type PaymentStatus as PaymentStatusValue,
} from '../payments/payment.constants.js';

export interface OrderLifecycleState {
  readonly status: OrderStatusValue;
  readonly fulfillmentType: FulfillmentTypeValue;
  readonly inventoryReservationStatus: InventoryReservationStatusValue;
}

export interface PaymentLifecycleState {
  readonly method: PaymentMethodValue;
  readonly status: PaymentStatusValue;
}

@Injectable()
export class OrdersService {
  confirm(state: OrderLifecycleState): OrderLifecycleState {
    this.assertStatus(state, OrderStatus.PENDING);
    return this.withStatus(state, OrderStatus.CONFIRMED);
  }

  startPreparation(state: OrderLifecycleState): OrderLifecycleState {
    this.assertStatus(state, OrderStatus.CONFIRMED);
    this.assertReservationStatus(state, InventoryReservationStatus.RESERVED);
    return this.withStatus(state, OrderStatus.PREPARING);
  }

  markReady(state: OrderLifecycleState): OrderLifecycleState {
    this.assertStatus(state, OrderStatus.PREPARING);
    this.assertReservationStatus(state, InventoryReservationStatus.RESERVED);
    return this.withStatus(state, OrderStatus.READY);
  }

  confirmDispatch(
    state: OrderLifecycleState,
    payment: PaymentLifecycleState,
    inventoryDispatchConfirmed: boolean,
  ): OrderLifecycleState {
    this.assertStatus(state, OrderStatus.READY);
    this.assertFulfillmentType(state, FulfillmentType.DELIVERY);
    this.assertReservationStatus(state, InventoryReservationStatus.RESERVED);
    this.assertBankTransferApproved(payment);
    this.assertConfirmed(inventoryDispatchConfirmed, 'Inventory dispatch');

    return this.withStatus(
      state,
      OrderStatus.ON_DELIVERY,
      InventoryReservationStatus.DISPATCHED,
    );
  }

  confirmPickup(
    state: OrderLifecycleState,
    payment: PaymentLifecycleState,
    inventoryDispatchConfirmed: boolean,
  ): OrderLifecycleState {
    this.assertStatus(state, OrderStatus.READY);
    this.assertFulfillmentType(state, FulfillmentType.PICKUP);
    this.assertReservationStatus(state, InventoryReservationStatus.RESERVED);
    this.assertBankTransferApproved(payment);
    this.assertConfirmed(inventoryDispatchConfirmed, 'Inventory dispatch');

    return this.withStatus(
      state,
      OrderStatus.PICKED_UP,
      InventoryReservationStatus.DISPATCHED,
    );
  }

  markDelivered(state: OrderLifecycleState): OrderLifecycleState {
    this.assertStatus(state, OrderStatus.ON_DELIVERY);
    this.assertFulfillmentType(state, FulfillmentType.DELIVERY);
    this.assertReservationStatus(state, InventoryReservationStatus.DISPATCHED);
    return this.withStatus(state, OrderStatus.DELIVERED);
  }

  markDeliveryFailed(state: OrderLifecycleState): OrderLifecycleState {
    this.assertStatus(state, OrderStatus.ON_DELIVERY);
    this.assertFulfillmentType(state, FulfillmentType.DELIVERY);
    this.assertReservationStatus(state, InventoryReservationStatus.DISPATCHED);
    return this.withStatus(state, OrderStatus.DELIVERY_FAILED);
  }

  confirmReturnToStore(
    state: OrderLifecycleState,
    inventoryReturnProcessed: boolean,
  ): OrderLifecycleState {
    this.assertStatus(state, OrderStatus.DELIVERY_FAILED);
    this.assertFulfillmentType(state, FulfillmentType.DELIVERY);
    this.assertConfirmed(inventoryReturnProcessed, 'Inventory return');
    return this.withStatus(state, OrderStatus.RETURNED_TO_STORE);
  }

  retryDelivery(
    state: OrderLifecycleState,
    newReservationConfirmed: boolean,
  ): OrderLifecycleState {
    this.assertStatus(state, OrderStatus.RETURNED_TO_STORE);
    this.assertFulfillmentType(state, FulfillmentType.DELIVERY);
    this.assertConfirmed(newReservationConfirmed, 'New inventory reservation');
    if (
      state.inventoryReservationStatus === InventoryReservationStatus.RESERVED ||
      state.inventoryReservationStatus === InventoryReservationStatus.PENDING
    ) {
      throw new ConflictException(
        'The previous inventory reservation must be resolved before retrying delivery.',
      );
    }

    return this.withStatus(
      state,
      OrderStatus.READY,
      InventoryReservationStatus.RESERVED,
    );
  }

  cancel(
    state: OrderLifecycleState,
    inventoryReleaseConfirmed: boolean,
  ): OrderLifecycleState {
    const cancellableStatuses: readonly OrderLifecycleState['status'][] = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.RETURNED_TO_STORE,
    ];

    if (!cancellableStatuses.includes(state.status)) {
      throw new ConflictException(
        `An order in ${state.status} cannot be cancelled directly.`,
      );
    }

    if (
      state.inventoryReservationStatus === InventoryReservationStatus.PENDING
    ) {
      throw new ConflictException(
        'Resolve the pending inventory reservation before cancelling the order.',
      );
    }

    if (
      state.inventoryReservationStatus === InventoryReservationStatus.RESERVED
    ) {
      this.assertConfirmed(inventoryReleaseConfirmed, 'Inventory release');
      return this.withStatus(
        state,
        OrderStatus.CANCELLED,
        InventoryReservationStatus.RELEASED,
      );
    }

    if (
      state.inventoryReservationStatus === InventoryReservationStatus.DISPATCHED &&
      state.status !== OrderStatus.RETURNED_TO_STORE
    ) {
      throw new ConflictException(
        'A dispatched order must be returned to the store before cancellation.',
      );
    }

    return this.withStatus(state, OrderStatus.CANCELLED);
  }

  private assertStatus(
    state: OrderLifecycleState,
    expected: OrderStatusValue,
  ): void {
    if (state.status !== expected) {
      throw new ConflictException(
        `Cannot perform this operation while the order is ${state.status}.`,
      );
    }
  }

  private assertReservationStatus(
    state: OrderLifecycleState,
    expected: InventoryReservationStatusValue,
  ): void {
    if (state.inventoryReservationStatus !== expected) {
      throw new ConflictException(
        `The inventory reservation must be ${expected}.`,
      );
    }
  }

  private assertFulfillmentType(
    state: OrderLifecycleState,
    expected: FulfillmentTypeValue,
  ): void {
    if (state.fulfillmentType !== expected) {
      throw new ConflictException(
        `This operation requires ${expected} fulfillment.`,
      );
    }
  }

  private assertBankTransferApproved(payment: PaymentLifecycleState): void {
    if (
      payment.method === PaymentMethod.BANK_TRANSFER &&
      payment.status !== PaymentStatus.APPROVED
    ) {
      throw new ConflictException(
        'Bank transfer must be approved before handing over the order.',
      );
    }
  }

  private assertConfirmed(confirmed: boolean, operation: string): void {
    if (!confirmed) {
      throw new ConflictException(`${operation} must be confirmed first.`);
    }
  }

  private withStatus(
    state: OrderLifecycleState,
    status: OrderStatusValue,
    inventoryReservationStatus: InventoryReservationStatusValue =
      state.inventoryReservationStatus,
  ): OrderLifecycleState {
    return { ...state, status, inventoryReservationStatus };
  }
}
