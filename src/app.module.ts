import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (configuration: Record<string, unknown>) => {
        const databaseUrl = configuration.DATABASE_URL;
        if (
          typeof databaseUrl !== 'string' ||
          !URL.canParse(databaseUrl) ||
          !['postgres:', 'postgresql:'].includes(
            new URL(databaseUrl).protocol,
          )
        ) {
          throw new Error(
            'DATABASE_URL must be a valid PostgreSQL connection URL.',
          );
        }

        return configuration;
      },
    }),
    DatabaseModule,
    OrdersModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
