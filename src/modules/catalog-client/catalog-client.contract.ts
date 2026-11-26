export const CATALOG_CLIENT = Symbol('CATALOG_CLIENT');
export const CATALOG_HTTP_TRANSPORT = Symbol('CATALOG_HTTP_TRANSPORT');

export interface CatalogVariant {
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly variantName: string;
  readonly sku: string;
  readonly priceCop: bigint;
  readonly isPurchasable: boolean;
}

export interface CatalogClient {
  getVariant(variantId: string): Promise<CatalogVariant>;
}

export interface CatalogHttpTransport {
  fetch(url: URL, options: RequestInit): Promise<Response>;
}
