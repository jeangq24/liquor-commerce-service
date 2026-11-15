import { Module } from '@nestjs/common';
import { CommerceInternalAuthGuard } from '../../common/guards/commerce-internal-auth.guard.js';
import { CommercePermissionGuard } from '../../common/guards/commerce-permission.guard.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { InventoryClientModule } from '../inventory-client/inventory-client.module.js';
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
import { CommerceRepository } from './commerce.repository.js';
import { OrdersApiService } from './orders-api.service.js';
import { PaymentsApiService } from './payments-api.service.js';

@Module({
  imports: [
    DatabaseModule,
    InventoryClientModule,
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
    CommerceInternalAuthGuard,
    CommercePermissionGuard,
    CartsService,
    CheckoutService,
    OrdersApiService,
    PaymentsApiService,
  ],
})
export class CommerceModule {}
