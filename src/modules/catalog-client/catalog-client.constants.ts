export const DEFAULT_CATALOG_TIMEOUT_MS = 5000;
export const MAX_CATALOG_TIMEOUT_MS = 60000;
export const MAX_POSTGRES_BIGINT = 9223372036854775807n;

export const CatalogProductStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
