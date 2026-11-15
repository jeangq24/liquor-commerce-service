import {
  BadRequestException,
  BadGatewayException,
  Inject,
  ForbiddenException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CommerceActor } from '../../common/security/commerce-actor.js';
import {
  INVENTORY_CLIENT,
  type InventoryClient,
  type InventoryReservation,
  type StockReturnItem,
} from '../inventory-client/inventory-client.contract.js';
import { OrdersService } from '../orders/orders.service.js';
import {
  InventoryReservationStatus,
  type OrderStatus as OrderStatusValue,
} from '../orders/order.constants.js';
import { InventoryPermission } from '../inventory-client/inventory-client.constants.js';
import { PaymentStatus } from '../payments/payment.constants.js';
import {
  OrderAction,
  type OrderAction as OrderActionValue,
} from './commerce-api.constants.js';
import { CommercePermission } from './commerce-permissions.constants.js';
import {
  ORDERS_REPOSITORY,
  type OrdersRepository,
  type OrderTransitionInput,
} from './commerce.repository.port.js';
import { DeliveryAttemptMutationKind } from './commerce.constants.js';
import { CommerceResponseMapper } from './commerce-response.mapper.js';
import type {
  OrderDetailsResponse,
  OrderSummaryResponse,
} from './commerce-response.mapper.js';

@Injectable()
export class OrdersApiService {
  constructor(
    @Inject(ORDERS_REPOSITORY)
    private readonly repository: OrdersRepository,
    private readonly ordersService: OrdersService,
    @Inject(INVENTORY_CLIENT)
    private readonly inventory: InventoryClient,
    private readonly mapper: CommerceResponseMapper,
  ) {}

  async list(
    status?: OrderStatusValue,
    limit = 25,
  ): Promise<readonly OrderSummaryResponse[]> {
    const results = await this.repository.listOrders(status, limit);
    return results.map((order) => this.mapper.mapOrderSummary(order));
  }

  async get(orderId: string): Promise<OrderDetailsResponse> {
    const order = await this.repository.getOrder(orderId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} was not found.`);
    }
    return this.mapper.mapOrder(order);
  }

  async transition(
    orderId: string,
    action: OrderActionValue,
    actor: CommerceActor,
    reason?: string,
    returnItems?: readonly StockReturnItem[],
  ): Promise<OrderDetailsResponse> {
    if (action === OrderAction.CANCEL) {
      this.requirePermission(actor, CommercePermission.ORDERS_CANCEL);
    }
    if (action === OrderAction.RETURN_TO_STORE) {
      this.requirePermission(actor, InventoryPermission.STOCK_RETURN);
    }

    const order = await this.repository.getOrder(orderId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} was not found.`);
    }
    const payment = order.payments[0];
    if (!payment) {
      throw new ConflictException('Order has no associated payment.');
    }
    const state = {
      status: order.status,
      fulfillmentType: order.fulfillmentType,
      inventoryReservationStatus: order.inventoryReservationStatus,
    };
    const paymentState = { method: payment.method, status: payment.status };
    let next = state;
    let reservationMutation: OrderTransitionInput['reservationMutation'];
    let newReservation: OrderTransitionInput['newReservation'];
    let deliveryAttemptMutation: OrderTransitionInput['deliveryAttemptMutation'];
    if (
      action === OrderAction.CANCEL &&
      payment.status === PaymentStatus.APPROVED
    ) {
      throw new ConflictException(
        'Cancellation after payment approval is disabled until the refund policy is defined.',
      );
    }
    switch (action) {
      case OrderAction.CONFIRM:
        next = this.ordersService.confirm(state);
        break;
      case OrderAction.START_PREPARATION:
        next = this.ordersService.startPreparation(state);
        break;
      case OrderAction.MARK_READY:
        next = this.ordersService.markReady(state);
        break;
      case OrderAction.DISPATCH:
      case OrderAction.PICKUP: {
        const reservation =
          await this.repository.getReservationForOrder(orderId);
        if (!reservation) {
          throw new ConflictException('Order has no inventory reservation.');
        }
        if (action === OrderAction.DISPATCH) {
          next = this.ordersService.confirmDispatch(state, paymentState, true);
          const dispatched = await this.inventory.dispatch(
            orderId,
            `${orderId}:dispatch:${reservation.reservationId}`,
            actor,
          );
          this.assertReservationMatches(reservation, dispatched);
          deliveryAttemptMutation = {
            kind: DeliveryAttemptMutationKind.START,
            registeredBy: actor.id,
          };
        } else {
          next = this.ordersService.confirmPickup(state, paymentState, true);
          const dispatched = await this.inventory.dispatch(
            orderId,
            `${orderId}:pickup:${reservation.reservationId}`,
            actor,
          );
          this.assertReservationMatches(reservation, dispatched);
        }
        reservationMutation = {
          reservationId: reservation.reservationId,
          expectedStatus: InventoryReservationStatus.RESERVED,
          status: InventoryReservationStatus.DISPATCHED,
        };
        break;
      }
      case OrderAction.DELIVER:
        next = this.ordersService.markDelivered(state);
        deliveryAttemptMutation = {
          kind: DeliveryAttemptMutationKind.COMPLETE,
          registeredBy: actor.id,
        };
        break;
      case OrderAction.DELIVERY_FAILED:
        if (!reason?.trim()) {
          throw new ConflictException('A delivery failure reason is required.');
        }
        next = this.ordersService.markDeliveryFailed(state);
        deliveryAttemptMutation = {
          kind: DeliveryAttemptMutationKind.FAIL,
          reason: reason.trim(),
          registeredBy: actor.id,
        };
        break;
      case OrderAction.RETURN_TO_STORE: {
        const reservation =
          await this.repository.getReservationForOrder(orderId);
        if (!reservation) {
          throw new ConflictException('Order has no inventory reservation.');
        }
        if (!reason?.trim()) {
          throw new ConflictException('A return reason is required.');
        }
        if (!returnItems?.length) {
          throw new ConflictException(
            'At least one returned item with verified quantities is required.',
          );
        }
        this.validateReturnItems(order.items, returnItems);
        next = this.ordersService.confirmReturnToStore(state, true);
        const attempt = await this.repository.getLatestDeliveryAttempt(orderId);
        await this.inventory.registerReturn(
          {
            orderId,
            idempotencyKey: `${orderId}:return:${attempt.id}`,
            deliveryAttemptId: attempt.id,
            reason: reason.trim(),
            items: returnItems,
          },
          actor,
        );
        reservationMutation = {
          reservationId: reservation.reservationId,
          expectedStatus: InventoryReservationStatus.DISPATCHED,
          status: InventoryReservationStatus.RELEASED,
        };
        deliveryAttemptMutation = {
          kind: DeliveryAttemptMutationKind.RETURN,
          registeredBy: actor.id,
        };
        next = {
          ...next,
          inventoryReservationStatus: InventoryReservationStatus.RELEASED,
        };
        break;
      }
      case OrderAction.RETRY_DELIVERY: {
        const previousReservation =
          await this.repository.getReservationForOrder(orderId);
        if (!previousReservation) {
          throw new ConflictException(
            'Order has no previous inventory reservation.',
          );
        }
        next = this.ordersService.retryDelivery(
          {
            ...state,
            inventoryReservationStatus: InventoryReservationStatus.RELEASED,
          },
          true,
        );
        const items = await this.repository.getItemsForOrder(orderId);
        const reservation = await this.inventory.reserve(
          orderId,
          `${orderId}:retry:${previousReservation.reservationId}`,
          items,
          actor,
        );
        newReservation = reservation;
        break;
      }
      case OrderAction.CANCEL:
        if (!reason?.trim()) {
          throw new ConflictException('A cancellation reason is required.');
        }
        next = this.ordersService.cancel(state, true);
        if (
          state.inventoryReservationStatus ===
          InventoryReservationStatus.RESERVED
        ) {
          const reservation =
            await this.repository.getReservationForOrder(orderId);
          if (!reservation) {
            throw new ConflictException('Order has no inventory reservation.');
          }
          const released = await this.inventory.release(
            orderId,
            `${orderId}:cancel:${reservation.reservationId}`,
            reason,
            actor,
          );
          this.assertReservationMatches(reservation, released);
          reservationMutation = {
            reservationId: reservation.reservationId,
            expectedStatus: InventoryReservationStatus.RESERVED,
            status: InventoryReservationStatus.RELEASED,
          };
        }
        break;
    }

    await this.repository.applyOrderTransition({
      orderId,
      expectedStatus: state.status,
      expectedReservationStatus: state.inventoryReservationStatus,
      status: next.status,
      inventoryReservationStatus: next.inventoryReservationStatus,
      ...(action === OrderAction.CANCEL
        ? { cancellationReason: reason?.trim() }
        : {}),
      ...(reservationMutation ? { reservationMutation } : {}),
      ...(newReservation ? { newReservation } : {}),
      ...(deliveryAttemptMutation ? { deliveryAttemptMutation } : {}),
    });
    return this.get(orderId);
  }

  private requirePermission(actor: CommerceActor, permission: string): void {
    if (!actor.permissions.includes(permission)) {
      throw new ForbiddenException(
        `Actor is missing the required permission: ${permission}.`,
      );
    }
  }

  private validateReturnItems(
    orderItems: readonly { readonly variantId: string; readonly quantity: number }[],
    returnItems: readonly StockReturnItem[],
  ): void {
    const orderedQuantities = new Map(
      orderItems.map((item) => [item.variantId, item.quantity]),
    );
    const returnedVariants = new Set<string>();
    for (const item of returnItems) {
      const orderedQuantity = orderedQuantities.get(item.variantId);
      if (
        orderedQuantity === undefined ||
        returnedVariants.has(item.variantId) ||
        item.quantityReceived > orderedQuantity ||
        item.quantityRestockable > item.quantityReceived
      ) {
        throw new BadRequestException(
          'Return quantities must refer to unique items in the order and cannot exceed received quantities.',
        );
      }
      returnedVariants.add(item.variantId);
    }
  }

  private assertReservationMatches(
    expected: { readonly reservationId: string; readonly locationId: string },
    actual: InventoryReservation,
  ): void {
    if (
      expected.reservationId !== actual.reservationId ||
      expected.locationId !== actual.locationId
    ) {
      throw new BadGatewayException(
        'Inventory response does not match the order reservation.',
      );
    }
  }

}
