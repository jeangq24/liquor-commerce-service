import type { CartWithItems } from './commerce.repository.port.js';
import type { CheckoutDto } from './dto/checkout.dto.js';
import type { CatalogVariant } from '../catalog-client/catalog-client.contract.js';
import type {
  OrderStatus,
  InventoryReservationStatus,
} from '../orders/order.constants.js';

export const CHECKOUT_REPOSITORY = Symbol('CHECKOUT_REPOSITORY');

export interface CheckoutItem {
  readonly cartItemId: string;
  readonly quantity: number;
  readonly variant: CatalogVariant;
  readonly lineTotalCop: bigint;
}

export interface CheckoutRecord {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly inventoryReservationStatus: InventoryReservationStatus;
  readonly requestHash: string;
}

export interface CreateCheckoutInput {
  readonly checkout: CheckoutDto;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly items: readonly CheckoutItem[];
  readonly subtotalCop: bigint;
}

export interface CheckoutRepository {
  getCart(cartId: string): Promise<CartWithItems | null>;
  findByKey(idempotencyKey: string): Promise<CheckoutRecord | null>;
  create(input: CreateCheckoutInput): Promise<CheckoutRecord>;
}

export interface CheckoutResponse {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly inventoryReservationStatus: InventoryReservationStatus;
}
