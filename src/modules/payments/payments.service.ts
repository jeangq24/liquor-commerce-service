import { ConflictException, Injectable } from '@nestjs/common';
import {
  PaymentMethod,
  PaymentStatus,
  type PaymentMethod as PaymentMethodValue,
  type PaymentStatus as PaymentStatusValue,
} from './payment.constants.js';

export interface PaymentLifecycleState {
  readonly method: PaymentMethodValue;
  readonly status: PaymentStatusValue;
}

@Injectable()
export class PaymentsService {
  submitTransferForReview(
    payment: PaymentLifecycleState,
  ): PaymentLifecycleState {
    this.assertMethod(payment, PaymentMethod.BANK_TRANSFER);
    this.assertStatus(payment, PaymentStatus.PENDING);
    return this.withStatus(payment, PaymentStatus.UNDER_REVIEW);
  }

  approveTransfer(payment: PaymentLifecycleState): PaymentLifecycleState {
    this.assertMethod(payment, PaymentMethod.BANK_TRANSFER);
    this.assertStatus(payment, PaymentStatus.UNDER_REVIEW);
    return this.withStatus(payment, PaymentStatus.APPROVED);
  }

  rejectTransfer(payment: PaymentLifecycleState): PaymentLifecycleState {
    this.assertMethod(payment, PaymentMethod.BANK_TRANSFER);
    this.assertStatus(payment, PaymentStatus.UNDER_REVIEW);
    return this.withStatus(payment, PaymentStatus.REJECTED);
  }

  recordCashReceived(payment: PaymentLifecycleState): PaymentLifecycleState {
    this.assertMethod(payment, PaymentMethod.CASH);
    this.assertStatus(payment, PaymentStatus.PENDING);
    return this.withStatus(payment, PaymentStatus.APPROVED);
  }

  private assertMethod(
    payment: PaymentLifecycleState,
    expected: PaymentMethodValue,
  ): void {
    if (payment.method !== expected) {
      throw new ConflictException(
        `This operation requires the ${expected} payment method.`,
      );
    }
  }

  private assertStatus(
    payment: PaymentLifecycleState,
    expected: PaymentStatusValue,
  ): void {
    if (payment.status !== expected) {
      throw new ConflictException(
        `Cannot perform this operation while the payment is ${payment.status}.`,
      );
    }
  }

  private withStatus(
    payment: PaymentLifecycleState,
    status: PaymentStatusValue,
  ): PaymentLifecycleState {
    return { ...payment, status };
  }
}
