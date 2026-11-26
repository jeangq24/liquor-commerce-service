import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CatalogHttpTransport } from './catalog-client.contract.js';
import { CatalogClientService } from './catalog-client.service.js';

describe('CatalogClientService', () => {
  const variantId = '00000000-0000-4000-8000-000000000001';
  const productId = '00000000-0000-4000-8000-000000000002';
  const variant = {
    id: variantId,
    productId,
    productName: 'Product',
    productStatus: 'PUBLISHED',
    variantName: 'Bottle',
    sku: 'BOTTLE',
    priceCop: '9007199254740993',
    isActive: true,
    isPurchasable: true,
  };
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let client: CatalogClientService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    const transport: CatalogHttpTransport = { fetch: fetchMock };
    client = new CatalogClientService(
      new ConfigService({
        CATALOG_API_URL: 'http://catalog.local',
        CATALOG_SERVICE_TOKEN: 'catalog-test-token',
      }),
      transport,
    );
  });

  it('uses the internal contract and preserves bigint prices', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(variant)));
    await expect(client.getVariant(variantId)).resolves.toMatchObject({
      id: variantId,
      priceCop: 9007199254740993n,
      isPurchasable: true,
    });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toEqual(new URL(`http://catalog.local/internal/v1/variants/${variantId}`));
    expect(new Headers(options?.headers).get('authorization')).toBe(
      'Bearer catalog-test-token',
    );
  });

  it.each([
    { ...variant, id: productId },
    { ...variant, priceCop: '9223372036854775808' },
    { ...variant, isActive: false },
    { ...variant, priceCop: 100 },
  ])('rejects invalid or inconsistent catalog responses', async (payload) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(payload)));
    await expect(client.getVariant(variantId)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('reports an unknown variant', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(client.getVariant(variantId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
