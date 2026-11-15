export const PaymentMethod = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
} as const;

export type PaymentMethod =
  (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PAYMENT_METHODS = [
  PaymentMethod.CASH,
  PaymentMethod.BANK_TRANSFER,
] as const;

export const PaymentStatus = {
  PENDING: 'PENDING',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
} as const;

export type PaymentStatus =
  (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PAYMENT_STATUSES = [
  PaymentStatus.PENDING,
  PaymentStatus.UNDER_REVIEW,
  PaymentStatus.APPROVED,
  PaymentStatus.REJECTED,
  PaymentStatus.REFUNDED,
  PaymentStatus.CANCELLED,
] as const;
