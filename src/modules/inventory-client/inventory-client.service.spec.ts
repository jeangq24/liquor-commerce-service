import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InventoryClientService } from './inventory-client.service.js';

describe('InventoryClientService', () => {
  const orderId = '00000000-0000-4000-8000-000000000002';
  const reservationId = '00000000-0000-4000-8000-000000000003';
  const locationId = '00000000-0000-4000-8000-000000000001';
  const actorId = '00000000-0000-4000-8000-000000000004';
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let service: InventoryClientService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    service = new InventoryClientService(
      new ConfigService({
        INVENTORY_API_URL: 'http://inventory.local/',
        INVENTORY_SERVICE_TOKEN: 'inventory-secret',
        INVENTORY_LOCATION_ID: locationId,
        INVENTORY_TIMEOUT_MS: '1000',
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reserves stock through Inventory using its internal contract', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ reservationId, locationId, status: 'ACTIVE' }),
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
      new Response(JSON.stringify({ returnId: reservationId }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
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
