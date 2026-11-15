import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { CheckoutDto } from './dto/checkout.dto.js';

@Injectable()
export class CheckoutService {
  checkout(_checkout: CheckoutDto, _idempotencyKey: string): never {
    throw new ServiceUnavailableException(
      'Checkout is disabled until the Catalog service exposes its authoritative variant and price API.',
    );
  }
}
