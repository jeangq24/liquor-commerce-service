import {
  BadRequestException,
  BadGatewayException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { InventoryHttpTransport } from './inventory-client.contract.js';
import { INVENTORY_AVAILABILITY_BATCH_SIZE } from './inventory-client.constants.js';
import { InventoryClientService } from './inventory-client.service.js';
import { InventoryInsufficientStockException } from './inventory-insufficient-stock.exception.js';

describe('InventoryClientService', () => {
  const orderId = '00000000-0000-4000-8000-000000000002';
  const reservationId = '00000000-0000-4000-8000-000000000003';
  const locationId = '00000000-0000-4000-8000-000000000001';
  const actorId = '00000000-0000-4000-8000-000000000004';
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let transport: InventoryHttpTransport;
  let service: InventoryClientService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    transport = { fetch: fetchMock };
    service = new InventoryClientService(
      new ConfigService({
        INVENTORY_API_URL: 'http://inventory.local/',
        INVENTORY_SERVICE_TOKEN: 'inventory-secret',
        INVENTORY_LOCATION_ID: locationId,
        INVENTORY_TIMEOUT_MS: '1000',
      }),
      transport,
    );
  });

  it('queries availability with Inventory location and read permission', async () => {
    const secondVariantId = '00000000-0000-4000-8000-000000000005';
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: null,
            locationId,
            variantId: reservationId,
            quantityOnHand: 4,
            quantityReserved: 1,
            quantityAvailable: 3,
            updatedAt: null,
          },
          {
            id: null,
            locationId,
            variantId: secondVariantId,
            quantityOnHand: 0,
            quantityReserved: 0,
            quantityAvailable: 0,
            updatedAt: null,
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      service.getAvailability([reservationId, secondVariantId]),
    ).resolves.toEqual([
      { variantId: reservationId, quantityAvailable: 3 },
      { variantId: secondVariantId, quantityAvailable: 0 },
    ]);

    const [url, options] = fetchMock.mock.calls[0]!;
    if (!(url instanceof URL)) {
      throw new Error('Inventory availability request URL must be a URL.');
    }
    expect(url.pathname).toBe('/internal/v1/stock/availability');
    expect(url.searchParams.get('locationId')).toBe(locationId);
    expect(url.searchParams.getAll('variantIds')).toEqual([
      reservationId,
      secondVariantId,
    ]);
    const headers = new Headers(options?.headers);
    expect(headers.get('x-actor-permissions')).toBe('inventory.stock.read');
  });

  it('rejects incomplete availability responses instead of assuming zero stock', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      service.getAvailability([reservationId]),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('splits availability queries to respect the 100-variant limit', async () => {
    const variantIds = Array.from(
      { length: INVENTORY_AVAILABILITY_BATCH_SIZE + 1 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    );
    fetchMock.mockImplementation(async (input) => {
      if (!(input instanceof URL)) {
        throw new Error('Inventory availability request URL must be a URL.');
      }
      return new Response(
        JSON.stringify(
          input.searchParams.getAll('variantIds').map((variantId) => ({
            id: null,
            locationId,
            variantId,
            quantityAvailable: 1,
          })),
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const availability = await service.getAvailability(variantIds);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(availability).toHaveLength(INVENTORY_AVAILABILITY_BATCH_SIZE + 1);
    expect(availability[INVENTORY_AVAILABILITY_BATCH_SIZE]).toEqual({
      variantId: variantIds[INVENTORY_AVAILABILITY_BATCH_SIZE],
      quantityAvailable: 1,
    });
  });

  it('reserves stock through Inventory using its internal contract', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          reservationId,
          orderId,
          locationId,
          status: 'ACTIVE',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      service.reserve(orderId, 'checkout-key', [
        { variantId: reservationId, quantity: 2 },
      ]),
    ).resolves.toEqual({ reservationId, locationId, status: 'ACTIVE' });

    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toEqual(
      new URL('http://inventory.local/internal/v1/stock/reservations'),
    );
    const headers = new Headers(options?.headers);
    expect(headers.get('authorization')).toBe('Bearer inventory-secret');
    expect(headers.get('x-actor-permissions')).toBe('inventory.stock.reserve');
    expect(options?.body).toBe(
      JSON.stringify({
        orderId,
        locationId,
        idempotencyKey: 'checkout-key',
        items: [{ variantId: reservationId, quantity: 2 }],
      }),
    );
  });

  it('distinguishes confirmed insufficient stock from other reservation conflicts', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        message: `Insufficient available stock for variant ${reservationId}`,
      }), { status: 409 }),
    );
    await expect(
      service.reserve(orderId, 'checkout-key', [{ variantId: reservationId, quantity: 2 }]),
    ).rejects.toBeInstanceOf(InventoryInsufficientStockException);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'An active reservation already exists' }), { status: 409 }),
    );
    await expect(
      service.reserve(orderId, 'checkout-key', [{ variantId: reservationId, quantity: 2 }]),
    ).rejects.not.toBeInstanceOf(InventoryInsufficientStockException);
  });

  it('rejects invalid idempotency keys before contacting Inventory', async () => {
    await expect(
      service.reserve(orderId, ' ', [
        { variantId: reservationId, quantity: 1 },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the caller actor and maps Inventory permission failures to 403', async () => {
    fetchMock.mockResolvedValue(new Response('forbidden', { status: 403 }));

    await expect(
      service.dispatch(orderId, 'dispatch-key', {
        id: actorId,
        permissions: ['commerce.orders.update_status'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const [, options] = fetchMock.mock.calls[0]!;
    const headers = new Headers(options?.headers);
    expect(headers.get('x-actor-id')).toBe(actorId);
    expect(headers.get('x-actor-permissions')).toBe('inventory.stock.dispatch');
  });

  it('sends only verified return quantities to Inventory', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          returnId: reservationId,
          orderId,
          locationId,
          deliveryAttemptId: actorId,
          status: 'PROCESSED',
          items: [
            {
              variantId: reservationId,
              quantityReceived: 2,
              quantityRestockable: 1,
              reason: null,
            },
          ],
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );

    await service.registerReturn(
      {
        orderId,
        idempotencyKey: 'return-key',
        deliveryAttemptId: actorId,
        reason: 'Package returned',
        items: [
          {
            variantId: reservationId,
            quantityReceived: 2,
            quantityRestockable: 1,
          },
        ],
      },
      { id: actorId, permissions: ['inventory.stock.return'] },
    );

    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toEqual(
      new URL('http://inventory.local/internal/v1/stock/returns'),
    );
    const headers = new Headers(options?.headers);
    expect(headers.get('x-actor-id')).toBe(actorId);
    expect(headers.get('x-actor-permissions')).toBe('inventory.stock.return');
    expect(options?.body).toBe(
      JSON.stringify({
        orderId,
        idempotencyKey: 'return-key',
        deliveryAttemptId: actorId,
        reason: 'Package returned',
        items: [
          {
            variantId: reservationId,
            quantityReceived: 2,
            quantityRestockable: 1,
          },
        ],
        locationId,
      }),
    );
  });
});
