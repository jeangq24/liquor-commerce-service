export const InventoryPermission = {
  STOCK_READ: 'inventory.stock.read',
  STOCK_RESERVE: 'inventory.stock.reserve',
  STOCK_RELEASE: 'inventory.stock.release',
  STOCK_DISPATCH: 'inventory.stock.dispatch',
  STOCK_RETURN: 'inventory.stock.return',
} as const;

export type InventoryPermission =
  (typeof InventoryPermission)[keyof typeof InventoryPermission];

export const INVENTORY_AVAILABILITY_BATCH_SIZE = 100;
export const DEFAULT_INVENTORY_TIMEOUT_MS = 5000;
export const MAX_INVENTORY_TIMEOUT_MS = 60000;
export const MAX_INVENTORY_IDEMPOTENCY_KEY_LENGTH = 180;

export const InventoryReservationState = {
  ACTIVE: 'ACTIVE',
  RELEASED: 'RELEASED',
  DISPATCHED: 'DISPATCHED',
} as const;

export const InventoryReturnState = {
  PROCESSED: 'PROCESSED',
} as const;
