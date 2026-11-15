import {
  ForbiddenException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CommerceActor } from '../../common/security/commerce-actor.js';
import {
  PAYMENTS_REPOSITORY,
  type PaymentsRepository,
} from './commerce.repository.port.js';
import { CommerceResponseMapper } from './commerce-response.mapper.js';
import type { PaymentResponse } from './commerce-response.mapper.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PaymentStatus } from '../payments/payment.constants.js';
import type { PaymentStatus as PaymentStatusValue } from '../payments/payment.constants.js';
import {
  PaymentAction,
  type PaymentAction as PaymentActionValue,
} from './commerce-api.constants.js';
import {
  PAYMENT_ACTION_PERMISSION,
} from './commerce-permissions.constants.js';

@Injectable()
export class PaymentsApiService {
  constructor(
    @Inject(PAYMENTS_REPOSITORY)
    private readonly repository: PaymentsRepository,
    private readonly paymentsService: PaymentsService,
    private readonly mapper: CommerceResponseMapper,
  ) {}

  async get(paymentId: string): Promise<PaymentResponse> {
    const payment = await this.repository.getPayment(paymentId);
    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} was not found.`);
    }
    return this.mapper.mapPayment(payment);
  }

  async transition(
    paymentId: string,
    action: PaymentActionValue,
    actor: CommerceActor,
    reference?: string,
  ): Promise<PaymentResponse> {
    const requiredPermission = PAYMENT_ACTION_PERMISSION[action];
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
      payment.status,
      next.status,
      reference,
      next.status === PaymentStatus.APPROVED ||
      next.status === PaymentStatus.REJECTED
        ? actor.id
        : undefined,
    );
    if (!updated) {
      throw new ConflictException(
        'Payment status changed while the action was being processed.',
      );
    }
    return this.mapper.mapPayment(updated);
  }
}
