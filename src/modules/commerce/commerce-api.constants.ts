export const OrderAction = {
  CONFIRM: 'CONFIRM',
  START_PREPARATION: 'START_PREPARATION',
  MARK_READY: 'MARK_READY',
  DISPATCH: 'DISPATCH',
  PICKUP: 'PICKUP',
  DELIVER: 'DELIVER',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  RETURN_TO_STORE: 'RETURN_TO_STORE',
  RETRY_DELIVERY: 'RETRY_DELIVERY',
  CANCEL: 'CANCEL',
} as const;

export type OrderAction = (typeof OrderAction)[keyof typeof OrderAction];

export const PaymentAction = {
  SUBMIT_TRANSFER: 'SUBMIT_TRANSFER',
  APPROVE_TRANSFER: 'APPROVE_TRANSFER',
  REJECT_TRANSFER: 'REJECT_TRANSFER',
  RECORD_CASH: 'RECORD_CASH',
} as const;

export type PaymentAction = (typeof PaymentAction)[keyof typeof PaymentAction];
