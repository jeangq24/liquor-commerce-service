import type { InventoryReservationState } from './inventory-client.constants.js';

export const INVENTORY_CLIENT = Symbol('INVENTORY_CLIENT');
export const INVENTORY_HTTP_TRANSPORT = Symbol('INVENTORY_HTTP_TRANSPORT');

export interface InventoryActor {
  readonly id: string;
}

export interface InventoryItem {
  readonly variantId: string;
  readonly quantity: number;
}

export interface InventoryAvailability {
  readonly variantId: string;
  readonly quantityAvailable: number;
}

export interface InventoryReservation {
  readonly reservationId: string;
  readonly locationId: string;
  readonly status: (typeof InventoryReservationState)[keyof typeof InventoryReservationState];
}

export interface StockReturnItem {
  readonly variantId: string;
  readonly quantityReceived: number;
  readonly quantityRestockable: number;
  readonly reason?: string;
}

export interface RegisterStockReturnInput {
  readonly orderId: string;
  readonly idempotencyKey: string;
  readonly reason: string;
  readonly deliveryAttemptId?: string;
  readonly items: readonly StockReturnItem[];
}

export interface InventoryClient {
  getAvailability(
    variantIds: readonly string[],
  ): Promise<readonly InventoryAvailability[]>;
  reserve(
    orderId: string,
    idempotencyKey: string,
    items: readonly InventoryItem[],
    actor?: InventoryActor,
  ): Promise<InventoryReservation>;
  release(
    orderId: string,
    idempotencyKey: string,
    reason: string,
    actor: InventoryActor,
  ): Promise<InventoryReservation>;
  dispatch(
    orderId: string,
    idempotencyKey: string,
    actor: InventoryActor,
  ): Promise<InventoryReservation>;
  registerReturn(
    input: RegisterStockReturnInput,
    actor: InventoryActor,
  ): Promise<void>;
}

export interface InventoryHttpTransport {
  fetch(url: URL, options: RequestInit): Promise<Response>;
}

