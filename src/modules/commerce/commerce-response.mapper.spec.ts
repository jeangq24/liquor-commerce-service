import type { PaymentRecord } from './commerce.repository.port.js';
import { CommerceResponseMapper } from './commerce-response.mapper.js';

describe('CommerceResponseMapper', () => {
  it('maps payment values without exposing persistence-only fields', () => {
    const now = new Date('2026-11-15T12:00:00.000Z');
    const payment: PaymentRecord = {
      id: '00000000-0000-4000-8000-000000000001',
      orderId: '00000000-0000-4000-8000-000000000002',
      method: 'BANK_TRANSFER',
      status: 'APPROVED',
      amountCop: 125000n,
      reference: 'transfer-reference',
      proofPath: 'private/proofs/receipt.png',
      paidAt: now,
      verifiedBy: '00000000-0000-4000-8000-000000000003',
      createdAt: now,
      updatedAt: now,
    };

    const result = new CommerceResponseMapper().mapPayment(payment);

    expect(result).toEqual({
      id: payment.id,
      orderId: payment.orderId,
      method: payment.method,
      status: payment.status,
      amountCop: '125000',
      reference: payment.reference,
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    });
    expect(result).not.toHaveProperty('proofPath');
    expect(result).not.toHaveProperty('verifiedBy');
  });
});
