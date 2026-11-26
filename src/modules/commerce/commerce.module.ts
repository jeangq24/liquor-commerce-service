import { Module } from '@nestjs/common';
import { CommerceInternalAuthGuard } from '../../common/guards/commerce-internal-auth.guard.js';
import { CommercePermissionGuard } from '../../common/guards/commerce-permission.guard.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { InventoryClientModule } from '../inventory-client/inventory-client.module.js';
import { CatalogClientModule } from '../catalog-client/catalog-client.module.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import {
  CartsController,
  CheckoutController,
  OrdersController,
  PaymentsController,
} from './commerce.controller.js';
import { CartsService } from './carts.service.js';
import { CheckoutService } from './checkout.service.js';
import { CHECKOUT_REPOSITORY } from './checkout.contract.js';
import { DrizzleCheckoutRepository } from './checkout.repository.js';
import { CheckoutResponseMapper } from './checkout-response.mapper.js';
import { CommerceRepository } from './commerce.repository.js';
import {
  CARTS_REPOSITORY,
  ORDERS_REPOSITORY,
  PAYMENTS_REPOSITORY,
} from './commerce.repository.port.js';
import { CommerceResponseMapper } from './commerce-response.mapper.js';
import { OrdersApiService } from './orders-api.service.js';
import { PaymentsApiService } from './payments-api.service.js';

@Module({
  imports: [
    DatabaseModule,
    InventoryClientModule,
    CatalogClientModule,
    OutboxModule,
    OrdersModule,
    PaymentsModule,
  ],
  controllers: [
    CartsController,
    CheckoutController,
    OrdersController,
    PaymentsController,
  ],
  providers: [
    CommerceRepository,
    DrizzleCheckoutRepository,
    {
      provide: CHECKOUT_REPOSITORY,
      useExisting: DrizzleCheckoutRepository,
    },
    {
      provide: CARTS_REPOSITORY,
      useExisting: CommerceRepository,
    },
    {
      provide: ORDERS_REPOSITORY,
      useExisting: CommerceRepository,
    },
    {
      provide: PAYMENTS_REPOSITORY,
      useExisting: CommerceRepository,
    },
    CommerceResponseMapper,
    CommerceInternalAuthGuard,
    CommercePermissionGuard,
    CartsService,
    CheckoutService,
    CheckoutResponseMapper,
    OrdersApiService,
    PaymentsApiService,
  ],
})
export class CommerceModule {}
