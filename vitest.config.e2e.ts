import { defineConfig } from 'vitest/config';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://postgres:postgres@localhost:5432/licoresyaaa_test';
}
process.env.NODE_ENV = 'development';
process.env.INVENTORY_API_URL ||= 'http://127.0.0.1:3000';
process.env.INVENTORY_SERVICE_TOKEN ||=
  'test-inventory-service-token-000000000000';
process.env.INVENTORY_LOCATION_ID ||=
  '00000000-0000-4000-8000-000000000001';
process.env.COMMERCE_INTERNAL_API_TOKEN ||=
  'test-commerce-internal-token-000000000000';
process.env.CATALOG_API_URL ||= 'http://127.0.0.1:3002';
process.env.CATALOG_SERVICE_TOKEN ||=
  'test-catalog-service-token-000000000000';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
