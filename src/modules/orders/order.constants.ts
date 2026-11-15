export const OrderStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  ON_DELIVERY: 'ON_DELIVERY',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  RETURNED_TO_STORE: 'RETURNED_TO_STORE',
  DELIVERED: 'DELIVERED',
  PICKED_UP: 'PICKED_UP',
  CANCELLED: 'CANCELLED',
} as const;

export type OrderStatus =
  (typeof OrderStatus)[keyof typeof OrderStatus];

export const ORDER_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.ON_DELIVERY,
  OrderStatus.DELIVERY_FAILED,
  OrderStatus.RETURNED_TO_STORE,
  OrderStatus.DELIVERED,
  OrderStatus.PICKED_UP,
  OrderStatus.CANCELLED,
] as const;

export const FulfillmentType = {
  DELIVERY: 'DELIVERY',
  PICKUP: 'PICKUP',
} as const;

export type FulfillmentType =
  (typeof FulfillmentType)[keyof typeof FulfillmentType];

export const FULFILLMENT_TYPES = [
  FulfillmentType.DELIVERY,
  FulfillmentType.PICKUP,
] as const;

export const InventoryReservationStatus = {
  PENDING: 'PENDING',
  RESERVED: 'RESERVED',
  RELEASED: 'RELEASED',
  DISPATCHED: 'DISPATCHED',
  FAILED: 'FAILED',
} as const;

export type InventoryReservationStatus =
  (typeof InventoryReservationStatus)[keyof typeof InventoryReservationStatus];

export const INVENTORY_RESERVATION_STATUSES = [
  InventoryReservationStatus.PENDING,
  InventoryReservationStatus.RESERVED,
  InventoryReservationStatus.RELEASED,
  InventoryReservationStatus.DISPATCHED,
  InventoryReservationStatus.FAILED,
] as const;
