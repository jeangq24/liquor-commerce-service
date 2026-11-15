import { PaymentAction } from './commerce-api.constants.js';

export const CommercePermission = {
  ORDERS_READ: 'commerce.orders.read',
  ORDERS_UPDATE_STATUS: 'commerce.orders.update_status',
  ORDERS_CANCEL: 'commerce.orders.cancel',
  PAYMENTS_READ: 'commerce.payments.read',
  PAYMENTS_REVIEW: 'commerce.payments.review',
  PAYMENTS_APPROVE: 'commerce.payments.approve',
  PAYMENTS_RECORD_CASH: 'commerce.payments.record_cash',
} as const;

export const PAYMENT_ACTION_PERMISSION: Record<PaymentAction, string> = {
  [PaymentAction.SUBMIT_TRANSFER]: CommercePermission.PAYMENTS_REVIEW,
  [PaymentAction.APPROVE_TRANSFER]: CommercePermission.PAYMENTS_APPROVE,
  [PaymentAction.REJECT_TRANSFER]: CommercePermission.PAYMENTS_REVIEW,
  [PaymentAction.RECORD_CASH]: CommercePermission.PAYMENTS_RECORD_CASH,
} as const;
