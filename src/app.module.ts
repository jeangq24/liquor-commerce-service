import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { CommerceModule } from './modules/commerce/commerce.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (configuration: Record<string, unknown>) => {
        const databaseUrl = configuration.DATABASE_URL;
        if (
          typeof databaseUrl !== 'string' ||
          !URL.canParse(databaseUrl) ||
          !['postgres:', 'postgresql:'].includes(new URL(databaseUrl).protocol)
        ) {
          throw new Error(
            'DATABASE_URL must be a valid PostgreSQL connection URL.',
          );
        }

        const inventoryUrl = configuration.INVENTORY_API_URL;
        if (typeof inventoryUrl !== 'string' || !URL.canParse(inventoryUrl)) {
          throw new Error('INVENTORY_API_URL must be a valid HTTP(S) URL.');
        }
        const parsedInventoryUrl = new URL(inventoryUrl);
        if (
          !['http:', 'https:'].includes(parsedInventoryUrl.protocol) ||
          !['', '/'].includes(parsedInventoryUrl.pathname) ||
          parsedInventoryUrl.username ||
          parsedInventoryUrl.password ||
          parsedInventoryUrl.search ||
          parsedInventoryUrl.hash
        ) {
          throw new Error('INVENTORY_API_URL must be a valid HTTP(S) URL.');
        }

        for (const tokenName of [
          'INVENTORY_SERVICE_TOKEN',
          'COMMERCE_INTERNAL_API_TOKEN',
        ]) {
          const token = configuration[tokenName];
          if (
            typeof token !== 'string' ||
            token !== token.trim() ||
            token.length < 32
          ) {
            throw new Error(`${tokenName} must contain at least 32 characters.`);
          }
        }
        if (
          typeof configuration.INVENTORY_LOCATION_ID !== 'string' ||
          !isUUID(configuration.INVENTORY_LOCATION_ID, '4')
        ) {
          throw new Error('INVENTORY_LOCATION_ID must be a valid UUID v4.');
        }
        const inventoryTimeout = Number(
          configuration.INVENTORY_TIMEOUT_MS ?? 5000,
        );
        if (
          !Number.isSafeInteger(inventoryTimeout) ||
          inventoryTimeout < 1 ||
          inventoryTimeout > 60000
        ) {
          throw new Error(
            'INVENTORY_TIMEOUT_MS must be an integer between 1 and 60000.',
          );
        }
        const port = Number(configuration.PORT ?? 3001);
        if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
          throw new Error('PORT must be an integer between 1 and 65535.');
        }
        const host = configuration.HOST ?? '0.0.0.0';
        if (typeof host !== 'string' || !host.trim()) {
          throw new Error('HOST must be a non-empty hostname or IP address.');
        }

        return configuration;
      },
    }),
    DatabaseModule,
    OrdersModule,
    PaymentsModule,
    CommerceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
