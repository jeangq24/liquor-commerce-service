import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CATALOG_CLIENT,
  type CatalogClient,
} from '../catalog-client/catalog-client.contract.js';
import { MAX_POSTGRES_BIGINT } from '../catalog-client/catalog-client.constants.js';
import { FulfillmentType } from '../orders/order.constants.js';
import { CartStatus } from './commerce.constants.js';
import { CHECKOUT_REQUEST_HASH_VERSION } from './checkout.constants.js';
import {
  CHECKOUT_REPOSITORY,
  type CheckoutItem,
  type CheckoutRecord,
  type CheckoutRepository,
  type CheckoutResponse,
} from './checkout.contract.js';
import type { CheckoutDto } from './dto/checkout.dto.js';
import { CheckoutResponseMapper } from './checkout-response.mapper.js';

@Injectable()
export class CheckoutService {
  constructor(
    @Inject(CHECKOUT_REPOSITORY)
    private readonly repository: CheckoutRepository,
    @Inject(CATALOG_CLIENT) private readonly catalog: CatalogClient,
    private readonly mapper: CheckoutResponseMapper,
  ) {}

  async checkout(
    checkout: CheckoutDto,
    idempotencyKey: string,
  ): Promise<CheckoutResponse> {
    if (checkout.fulfillmentType !== FulfillmentType.PICKUP) {
      throw new BadRequestException(
        'Delivery checkout is unavailable until coverage and fees are configured.',
      );
    }
    if (checkout.delivery !== undefined) {
      throw new BadRequestException(
        'Delivery details are not accepted for pickup.',
      );
    }
    if (!checkout.customerName.trim() || !checkout.customerPhone.trim()) {
      throw new BadRequestException(
        'Customer name and phone must not be blank.',
      );
    }

    const requestHash = this.hashRequest(checkout);
    const existing = await this.repository.findByKey(idempotencyKey);
    if (existing) {
      return this.toResponse(existing, requestHash);
    }

    const cart = await this.repository.getCart(checkout.cartId);
    if (!cart) {
      throw new NotFoundException(`Cart ${checkout.cartId} was not found.`);
    }
    if (cart.status !== CartStatus.ACTIVE) {
      const completedWhileLoading =
        await this.repository.findByKey(idempotencyKey);
      if (completedWhileLoading) {
        return this.toResponse(completedWhileLoading, requestHash);
      }
      throw new ConflictException('Cart is no longer active.');
    }
    if (cart.items.length === 0) {
      throw new BadRequestException(
        'Checkout requires at least one cart item.',
      );
    }

    const items: CheckoutItem[] = [];
    let subtotalCop = 0n;
    for (const item of cart.items) {
      const variant = await this.catalog.getVariant(item.variantId);
      if (!variant.isPurchasable) {
        throw new ConflictException(
          `Variant ${item.variantId} is not purchasable.`,
        );
      }
      const lineTotalCop = variant.priceCop * BigInt(item.quantity);
      subtotalCop += lineTotalCop;
      if (
        lineTotalCop > MAX_POSTGRES_BIGINT ||
        subtotalCop > MAX_POSTGRES_BIGINT
      ) {
        throw new BadRequestException(
          'Checkout total exceeds the supported amount.',
        );
      }
      items.push({
        cartItemId: item.id,
        quantity: item.quantity,
        variant,
        lineTotalCop,
      });
    }

    const record = await this.repository.create({
      checkout,
      idempotencyKey,
      requestHash,
      items,
      subtotalCop,
    });
    return this.toResponse(record, requestHash);
  }

  private hashRequest(checkout: CheckoutDto): string {
    return createHash('sha256')
      .update(
        JSON.stringify([
          CHECKOUT_REQUEST_HASH_VERSION,
          checkout.cartId,
          checkout.customerName,
          checkout.customerPhone,
          checkout.customerEmail ?? null,
          checkout.fulfillmentType,
          checkout.paymentMethod,
        ]),
      )
      .digest('hex');
  }

  private toResponse(
    record: CheckoutRecord,
    requestHash: string,
  ): CheckoutResponse {
    if (record.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was used with a different checkout.',
      );
    }
    return this.mapper.map(record);
  }
}
