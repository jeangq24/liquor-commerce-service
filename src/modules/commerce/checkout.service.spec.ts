import { BadRequestException, ConflictException } from '@nestjs/common';
import type {
  CatalogClient,
  CatalogVariant,
} from '../catalog-client/catalog-client.contract.js';
import { MAX_POSTGRES_BIGINT } from '../catalog-client/catalog-client.constants.js';
import {
  FulfillmentType,
  InventoryReservationStatus,
  OrderStatus,
} from '../orders/order.constants.js';
import { PaymentMethod } from '../payments/payment.constants.js';
import { CartStatus, CustomerType } from './commerce.constants.js';
import type { CheckoutRepository } from './checkout.contract.js';
import { CheckoutService } from './checkout.service.js';
import { CheckoutResponseMapper } from './checkout-response.mapper.js';

describe('CheckoutService', () => {
  const cartId = '00000000-0000-4000-8000-000000000001';
  const variantId = '00000000-0000-4000-8000-000000000002';
  const orderId = '00000000-0000-4000-8000-000000000003';
  const now = new Date();
  const checkout = {
    cartId,
    customerName: 'Customer',
    customerPhone: '3001234567',
    fulfillmentType: FulfillmentType.PICKUP,
    paymentMethod: PaymentMethod.CASH,
  };
  const variant: CatalogVariant = {
    id: variantId,
    productId: orderId,
    productName: 'Product',
    variantName: 'Bottle',
    sku: 'SKU',
    priceCop: 9007199254740993n,
    isPurchasable: true,
  };
  let repository: CheckoutRepository;
  let catalog: CatalogClient;
  let service: CheckoutService;
  let findByKey: ReturnType<typeof vi.fn<CheckoutRepository['findByKey']>>;
  let create: ReturnType<typeof vi.fn<CheckoutRepository['create']>>;
  let getVariant: ReturnType<typeof vi.fn<CatalogClient['getVariant']>>;

  beforeEach(() => {
    findByKey = vi
      .fn<CheckoutRepository['findByKey']>()
      .mockResolvedValue(null);
    create = vi
      .fn<CheckoutRepository['create']>()
      .mockImplementation(async (input) => ({
        orderId,
        status: OrderStatus.PENDING,
        inventoryReservationStatus: InventoryReservationStatus.PENDING,
        requestHash: input.requestHash,
      }));
    getVariant = vi
      .fn<CatalogClient['getVariant']>()
      .mockResolvedValue(variant);
    repository = {
      findByKey,
      getCart: vi.fn<CheckoutRepository['getCart']>().mockResolvedValue({
        id: cartId,
        customerId: null,
        customerType: CustomerType.GUEST,
        sessionId: null,
        status: CartStatus.ACTIVE,
        createdAt: now,
        updatedAt: now,
        items: [
          {
            id: orderId,
            cartId,
            variantId,
            quantity: 2,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
      create,
    };
    catalog = { getVariant };
    service = new CheckoutService(
      repository,
      catalog,
      new CheckoutResponseMapper(),
    );
  });

  it('uses Catalog snapshots and exact bigint totals before creating a pending checkout', async () => {
    await expect(service.checkout(checkout, 'key')).resolves.toEqual({
      orderId,
      status: OrderStatus.PENDING,
      inventoryReservationStatus: InventoryReservationStatus.PENDING,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotalCop: 18014398509481986n,
        items: [
          expect.objectContaining({
            variant,
            quantity: 2,
            lineTotalCop: 18014398509481986n,
          }),
        ],
      }),
    );
  });

  it('replays the same request without contacting Catalog again and rejects a different request', async () => {
    await service.checkout(checkout, 'key');
    const requestHash = create.mock.calls[0]![0].requestHash;
    findByKey.mockResolvedValue({
      orderId,
      status: OrderStatus.PENDING,
      inventoryReservationStatus: InventoryReservationStatus.RESERVED,
      requestHash,
    });
    getVariant.mockClear();
    await expect(service.checkout(checkout, 'key')).resolves.toMatchObject({
      inventoryReservationStatus: InventoryReservationStatus.RESERVED,
    });
    expect(getVariant).not.toHaveBeenCalled();
    await expect(
      service.checkout({ ...checkout, customerPhone: 'other' }, 'key'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects unavailable variants, overflowing totals, and delivery', async () => {
    getVariant.mockResolvedValue({ ...variant, isPurchasable: false });
    await expect(service.checkout(checkout, 'key')).rejects.toBeInstanceOf(
      ConflictException,
    );
    getVariant.mockResolvedValue({ ...variant, priceCop: MAX_POSTGRES_BIGINT });
    await expect(service.checkout(checkout, 'key')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.checkout(
        { ...checkout, fulfillmentType: FulfillmentType.DELIVERY },
        'key',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });
});
