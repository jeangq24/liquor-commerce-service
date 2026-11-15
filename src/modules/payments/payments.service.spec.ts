import { ConflictException } from '@nestjs/common';
import {
  PaymentsService,
  type PaymentLifecycleState,
} from './payments.service.js';

describe('PaymentsService', () => {
  const service = new PaymentsService();

  const makePayment = (
    overrides: Partial<PaymentLifecycleState> = {},
  ): PaymentLifecycleState => ({
    method: 'CASH',
    status: 'PENDING',
    ...overrides,
  });

  it('requires bank transfers to be reviewed before approval', () => {
    const pending = makePayment({ method: 'BANK_TRANSFER' });

    expect(() => service.approveTransfer(pending)).toThrow(
      ConflictException,
    );
    expect(service.submitTransferForReview(pending)).toMatchObject({
      method: 'BANK_TRANSFER',
      status: 'UNDER_REVIEW',
    });
  });

  it('approves bank transfers only after review', () => {
    const underReview = makePayment({
      method: 'BANK_TRANSFER',
      status: 'UNDER_REVIEW',
    });

    expect(service.approveTransfer(underReview)).toMatchObject({
      status: 'APPROVED',
    });
    expect(service.rejectTransfer(underReview)).toMatchObject({
      status: 'REJECTED',
    });
  });

  it('approves cash only when received and recorded', () => {
    expect(service.recordCashReceived(makePayment())).toMatchObject({
      status: 'APPROVED',
    });
    expect(() =>
      service.recordCashReceived(
        makePayment({ method: 'BANK_TRANSFER' }),
      ),
    ).toThrow(ConflictException);
  });
});
