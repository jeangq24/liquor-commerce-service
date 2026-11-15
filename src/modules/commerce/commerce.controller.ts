import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiUnauthorizedResponse,
  ApiHeader,
  ApiTags,
} from '@nestjs/swagger';
import { CommerceInternalAuthGuard } from '../../common/guards/commerce-internal-auth.guard.js';
import { CommercePermissionGuard } from '../../common/guards/commerce-permission.guard.js';
import { CurrentActor } from '../../common/security/commerce-actor.decorator.js';
import type { CommerceActor } from '../../common/security/commerce-actor.js';
import { RequirePermissions } from '../../common/security/require-permissions.decorator.js';
import { CommercePermission } from './commerce-permissions.constants.js';
import { CartsService } from './carts.service.js';
import { CheckoutService } from './checkout.service.js';
import { OrdersApiService } from './orders-api.service.js';
import { PaymentsApiService } from './payments-api.service.js';
import {
  AddCartItemDto,
  CartIdParamsDto,
  CartItemParamsDto,
  CheckoutDto,
  CreateCartDto,
  OrderActionDto,
  OrderIdParamsDto,
  OrderListQueryDto,
  PaymentActionDto,
  PaymentIdParamsDto,
  UpdateCartItemDto,
} from './dto/index.js';

@ApiTags('Carts')
@Controller('carts')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a guest cart' })
  @ApiCreatedResponse()
  create(@Body() body: CreateCartDto) {
    return this.cartsService.create(body.sessionId);
  }

  @Get(':cartId')
  @ApiOperation({ summary: 'Get a cart and its items' })
  @ApiOkResponse()
  get(@Param() params: CartIdParamsDto) {
    return this.cartsService.get(params.cartId);
  }

  @Get(':cartId/availability')
  @ApiOperation({
    summary: 'Check the cart quantities against Inventory availability',
  })
  @ApiOkResponse()
  getAvailability(@Param() params: CartIdParamsDto) {
    return this.cartsService.getAvailability(params.cartId);
  }

  @Post(':cartId/items')
  @ApiOperation({ summary: 'Add a variant to a cart' })
  @ApiCreatedResponse()
  addItem(@Param() params: CartIdParamsDto, @Body() body: AddCartItemDto) {
    return this.cartsService.addItem(
      params.cartId,
      body.variantId,
      body.quantity,
    );
  }

  @Patch(':cartId/items/:itemId')
  @ApiOperation({ summary: 'Update a cart item quantity' })
  @ApiOkResponse()
  updateItem(
    @Param() params: CartItemParamsDto,
    @Body() body: UpdateCartItemDto,
  ) {
    return this.cartsService.updateItem(
      params.cartId,
      params.itemId,
      body.quantity,
    );
  }

  @Delete(':cartId/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an item from a cart' })
  @ApiNoContentResponse()
  removeItem(@Param() params: CartItemParamsDto) {
    return this.cartsService.removeItem(params.cartId, params.itemId);
  }
}

@ApiTags('Checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post()
  @ApiOperation({ summary: 'Create an order and reserve inventory' })
  @ApiServiceUnavailableResponse({
    description:
      'Checkout is disabled until Catalog exposes its authoritative variant and price API.',
  })
  checkout(
    @Body() body: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey?.trim() || idempotencyKey.length > 180) {
      throw new BadRequestException(
        'The Idempotency-Key header is required and must be at most 180 characters.',
      );
    }

    return this.checkoutService.checkout(body, idempotencyKey.trim());
  }
}

@ApiTags('Orders')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-actor-id',
  description: 'Actor UUID injected by the trusted BFF.',
  required: true,
})
@ApiHeader({
  name: 'x-actor-permissions',
  description: 'Comma-separated permissions resolved by the trusted BFF.',
  required: true,
})
@UseGuards(CommerceInternalAuthGuard, CommercePermissionGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersApiService) {}

  @Get()
  @RequirePermissions(CommercePermission.ORDERS_READ)
  @ApiOperation({ summary: 'List recent orders' })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiOkResponse()
  list(@Query() query: OrderListQueryDto) {
    return this.ordersService.list(query.status, query.limit);
  }

  @Get(':orderId')
  @RequirePermissions(CommercePermission.ORDERS_READ)
  @ApiOperation({ summary: 'Get an order with items, payment and delivery' })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiOkResponse()
  get(@Param() params: OrderIdParamsDto) {
    return this.ordersService.get(params.orderId);
  }

  @Post(':orderId/actions')
  @RequirePermissions(CommercePermission.ORDERS_UPDATE_STATUS)
  @ApiOperation({ summary: 'Execute a validated order lifecycle action' })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiOkResponse()
  transition(
    @Param() params: OrderIdParamsDto,
    @Body() body: OrderActionDto,
    @CurrentActor() actor: CommerceActor,
  ) {
    return this.ordersService.transition(
      params.orderId,
      body.action,
      actor,
      body.reason,
      body.items,
    );
  }
}

@ApiTags('Payments')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-actor-id',
  description: 'Actor UUID injected by the trusted BFF.',
  required: true,
})
@ApiHeader({
  name: 'x-actor-permissions',
  description: 'Comma-separated permissions resolved by the trusted BFF.',
  required: true,
})
@UseGuards(CommerceInternalAuthGuard, CommercePermissionGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsApiService) {}

  @Get(':paymentId')
  @RequirePermissions(CommercePermission.PAYMENTS_READ)
  @ApiOperation({ summary: 'Get payment status and reference' })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiOkResponse()
  get(@Param() params: PaymentIdParamsDto) {
    return this.paymentsService.get(params.paymentId);
  }

  @Post(':paymentId/actions')
  @ApiOperation({ summary: 'Execute a validated payment action' })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiOkResponse()
  transition(
    @Param() params: PaymentIdParamsDto,
    @Body() body: PaymentActionDto,
    @CurrentActor() actor: CommerceActor,
  ) {
    return this.paymentsService.transition(
      params.paymentId,
      body.action,
      actor,
      body.reference,
    );
  }
}
