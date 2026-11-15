import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CommerceActor } from '../../common/security/commerce-actor.js';
import { CommerceRepository } from './commerce.repository.js';
import { PaymentsService } from '../payments/payments.service.js';
import type { PaymentStatus as PaymentStatusValue } from '../payments/payment.constants.js';
import {
  PaymentAction,
  type PaymentAction as PaymentActionValue,
} from './commerce-api.constants.js';

@Injectable()
export class PaymentsApiService {
  constructor(
    private readonly repository: CommerceRepository,
    private readonly paymentsService: PaymentsService,
  ) {}

  async get(paymentId: string) {
    const payment = await this.repository.getPayment(paymentId);
    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} was not found.`);
    }
    return { ...payment, amountCop: payment.amountCop.toString() };
  }

  async transition(
    paymentId: string,
    action: PaymentActionValue,
    actor: CommerceActor,
    reference?: string,
  ) {
    const requiredPermission = {
      [PaymentAction.SUBMIT_TRANSFER]: 'commerce.payments.review',
      [PaymentAction.APPROVE_TRANSFER]: 'commerce.payments.approve',
      [PaymentAction.REJECT_TRANSFER]: 'commerce.payments.review',
      [PaymentAction.RECORD_CASH]: 'commerce.payments.record_cash',
    }[action];
    if (!actor.permissions.includes(requiredPermission)) {
      throw new ForbiddenException(
        `Actor is missing the required permission: ${requiredPermission}.`,
      );
    }

    const payment = await this.repository.getPayment(paymentId);
    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} was not found.`);
    }
    const state = { method: payment.method, status: payment.status };
    let next: { readonly status: PaymentStatusValue };
    switch (action) {
      case PaymentAction.SUBMIT_TRANSFER:
        next = this.paymentsService.submitTransferForReview(state);
        break;
      case PaymentAction.APPROVE_TRANSFER:
        next = this.paymentsService.approveTransfer(state);
        break;
      case PaymentAction.REJECT_TRANSFER:
        next = this.paymentsService.rejectTransfer(state);
        break;
      case PaymentAction.RECORD_CASH:
        next = this.paymentsService.recordCashReceived(state);
        break;
    }
    const updated = await this.repository.updatePayment(
      paymentId,
      next.status,
      reference,
    );
    if (!updated) {
      throw new NotFoundException(`Payment ${paymentId} was not found.`);
    }
    return { ...updated, amountCop: updated.amountCop.toString() };
  }
}
