export const CustomerType = {
  REGISTERED: 'REGISTERED',
  GUEST: 'GUEST',
} as const;

export const CUSTOMER_TYPES = [
  CustomerType.REGISTERED,
  CustomerType.GUEST,
] as const;

export const CartStatus = {
  ACTIVE: 'ACTIVE',
  CONVERTED: 'CONVERTED',
  ABANDONED: 'ABANDONED',
} as const;

export const CART_STATUSES = [
  CartStatus.ACTIVE,
  CartStatus.CONVERTED,
  CartStatus.ABANDONED,
] as const;

export const DeliveryAttemptStatus = {
  PENDING: 'PENDING',
  IN_TRANSIT: 'IN_TRANSIT',
  FAILED: 'FAILED',
  RETURNED_TO_STORE: 'RETURNED_TO_STORE',
  DELIVERED: 'DELIVERED',
} as const;

export const DELIVERY_ATTEMPT_STATUSES = [
  DeliveryAttemptStatus.PENDING,
  DeliveryAttemptStatus.IN_TRANSIT,
  DeliveryAttemptStatus.FAILED,
  DeliveryAttemptStatus.RETURNED_TO_STORE,
  DeliveryAttemptStatus.DELIVERED,
] as const;

export const DeliveryAttemptMutationKind = {
  START: 'START',
  FAIL: 'FAIL',
  COMPLETE: 'COMPLETE',
  RETURN: 'RETURN',
} as const;
