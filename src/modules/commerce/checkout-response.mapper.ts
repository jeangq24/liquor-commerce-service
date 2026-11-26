import { Injectable } from '@nestjs/common';
import type { CheckoutRecord, CheckoutResponse } from './checkout.contract.js';

@Injectable()
export class CheckoutResponseMapper {
  map(record: CheckoutRecord): CheckoutResponse {
    return {
      orderId: record.orderId,
      status: record.status,
      inventoryReservationStatus: record.inventoryReservationStatus,
    };
  }
}
