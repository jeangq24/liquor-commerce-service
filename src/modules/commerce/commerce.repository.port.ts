import type {
  carts,
  cartItems,
  deliveryAttempts,
  orderDeliveries,
  orderInventoryReservations,
  orderItems,
  orders,
  payments,
} from '../../infrastructure/database/schema/commerce.schema.js';
import type {
  InventoryItem,
  InventoryReservation,
} from '../inventory-client/inventory-client.contract.js';
import type { DeliveryAttemptMutationKind } from './commerce.constants.js';

export const CARTS_REPOSITORY = Symbol('CARTS_REPOSITORY');
export const ORDERS_REPOSITORY = Symbol('ORDERS_REPOSITORY');
export const PAYMENTS_REPOSITORY = Symbol('PAYMENTS_REPOSITORY');

export type CartRecord = typeof carts.$inferSelect;
export type CartItemRecord = typeof cartItems.$inferSelect;
export type OrderRecord = typeof orders.$inferSelect;
export type OrderItemRecord = typeof orderItems.$inferSelect;
export type PaymentRecord = typeof payments.$inferSelect;
export type DeliveryRecord = typeof orderDeliveries.$inferSelect;
export type DeliveryAttemptRecord = typeof deliveryAttempts.$inferSelect;
export type OrderInventoryReservationRecord =
  typeof orderInventoryReservations.$inferSelect;

export interface CartWithItems extends CartRecord {
  readonly items: readonly CartItemRecord[];
}

export interface OrderDetails extends OrderRecord {
  readonly items: readonly OrderItemRecord[];
  readonly payments: readonly PaymentRecord[];
  readonly delivery: DeliveryRecord | null;
  readonly inventoryReservations: readonly OrderInventoryReservationRecord[];
}

export type DeliveryAttemptMutation =
  | {
      readonly kind: typeof DeliveryAttemptMutationKind.START;
      readonly registeredBy: string;
    }
  | {
      readonly kind: typeof DeliveryAttemptMutationKind.FAIL;
      readonly registeredBy: string;
      readonly reason: string;
    }
  | {
      readonly kind: typeof DeliveryAttemptMutationKind.COMPLETE;
      readonly registeredBy: string;
    }
  | {
      readonly kind: typeof DeliveryAttemptMutationKind.RETURN;
      readonly registeredBy: string;
    };

export interface OrderTransitionInput {
  readonly orderId: string;
  readonly expectedStatus: OrderRecord['status'];
  readonly expectedReservationStatus: OrderRecord['inventoryReservationStatus'];
  readonly status: OrderRecord['status'];
  readonly inventoryReservationStatus: OrderRecord['inventoryReservationStatus'];
  readonly cancellationReason?: string;
  readonly reservationMutation?: {
    readonly reservationId: string;
    readonly expectedStatus: OrderInventoryReservationRecord['status'];
    readonly status: OrderInventoryReservationRecord['status'];
  };
  readonly newReservation?: InventoryReservation;
  readonly deliveryAttemptMutation?: DeliveryAttemptMutation;
}

export interface CartsRepository {
  createCart(sessionId?: string): Promise<CartRecord>;
  getCart(cartId: string): Promise<CartWithItems | null>;
  addCartItem(
    cartId: string,
    variantId: string,
    quantity: number,
  ): Promise<CartItemRecord>;
  updateCartItem(
    cartId: string,
    itemId: string,
    quantity: number,
  ): Promise<CartItemRecord | null>;
  deleteCartItem(cartId: string, itemId: string): Promise<boolean>;
}

export interface OrdersRepository {
  getOrder(orderId: string): Promise<OrderDetails | null>;
  listOrders(
    status?: OrderRecord['status'],
    limit?: number,
  ): Promise<OrderRecord[]>;
  getReservationForOrder(
    orderId: string,
  ): Promise<OrderInventoryReservationRecord | null>;
  getItemsForOrder(orderId: string): Promise<readonly InventoryItem[]>;
  applyOrderTransition(input: OrderTransitionInput): Promise<OrderRecord>;
  getLatestDeliveryAttempt(orderId: string): Promise<DeliveryAttemptRecord>;
}

export interface PaymentsRepository {
  getPayment(paymentId: string): Promise<PaymentRecord | null>;
  updatePayment(
    paymentId: string,
    expectedStatus: PaymentRecord['status'],
    status: PaymentRecord['status'],
    reference?: string,
    verifiedBy?: string,
  ): Promise<PaymentRecord | null>;
}
