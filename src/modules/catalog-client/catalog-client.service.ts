import {
  BadGatewayException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import {
  CATALOG_HTTP_TRANSPORT,
  type CatalogClient,
  type CatalogHttpTransport,
  type CatalogVariant,
} from './catalog-client.contract.js';
import {
  CatalogProductStatus,
  DEFAULT_CATALOG_TIMEOUT_MS,
  MAX_POSTGRES_BIGINT,
} from './catalog-client.constants.js';

@Injectable()
export class CatalogClientService implements CatalogClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(
    config: ConfigService,
    @Inject(CATALOG_HTTP_TRANSPORT)
    private readonly transport: CatalogHttpTransport,
  ) {
    this.baseUrl = config.getOrThrow<string>('CATALOG_API_URL');
    this.token = config.getOrThrow<string>('CATALOG_SERVICE_TOKEN');
    this.timeoutMs = Number(
      config.get<string>('CATALOG_TIMEOUT_MS', String(DEFAULT_CATALOG_TIMEOUT_MS)),
    );
  }

  async getVariant(variantId: string): Promise<CatalogVariant> {
    let response: Response;
    try {
      response = await this.transport.fetch(
        new URL(`/internal/v1/variants/${encodeURIComponent(variantId)}`, this.baseUrl),
        {
          method: 'GET',
          headers: { authorization: `Bearer ${this.token}` },
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
    } catch (error) {
      throw new ServiceUnavailableException('Catalog service is unavailable.', {
        cause: error,
      });
    }

    if (response.status === 404) {
      throw new NotFoundException(`Catalog variant ${variantId} was not found.`);
    }
    if (!response.ok) {
      throw new BadGatewayException(
        `Catalog service rejected the request with status ${response.status}.`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new BadGatewayException('Catalog returned invalid JSON.', { cause: error });
    }
    return this.parseVariant(payload, variantId);
  }

  private parseVariant(payload: unknown, variantId: string): CatalogVariant {
    if (!isRecord(payload)) {
      throw new BadGatewayException('Catalog returned an invalid variant.');
    }
    const data: Record<string, unknown> = payload;
    if (
      data.id !== variantId ||
      typeof data.productId !== 'string' ||
      !isUUID(data.productId, '4') ||
      typeof data.productName !== 'string' ||
      !data.productName.trim() ||
      data.productName.length > 180 ||
      typeof data.variantName !== 'string' ||
      !data.variantName.trim() ||
      data.variantName.length > 180 ||
      typeof data.sku !== 'string' ||
      !data.sku.trim() ||
      data.sku.length > 100 ||
      typeof data.priceCop !== 'string' ||
      !/^[1-9][0-9]{0,18}$/.test(data.priceCop) ||
      BigInt(data.priceCop) > MAX_POSTGRES_BIGINT ||
      typeof data.isActive !== 'boolean' ||
      typeof data.isPurchasable !== 'boolean' ||
      !Object.values(CatalogProductStatus).some((status) => status === data.productStatus) ||
      data.isPurchasable !==
        (data.isActive && data.productStatus === CatalogProductStatus.PUBLISHED)
    ) {
      throw new BadGatewayException('Catalog returned an invalid variant.');
    }
    return {
      id: variantId,
      productId: data.productId,
      productName: data.productName,
      variantName: data.variantName,
      sku: data.sku,
      priceCop: BigInt(data.priceCop),
      isPurchasable: data.isPurchasable,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
