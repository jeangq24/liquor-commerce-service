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
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBadGatewayResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
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
import { InventoryReservationStatus } from '../orders/order.constants.js';
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

@ApiTags('Carritos')
@ApiBadRequestResponse({
  description: 'Los datos de la solicitud no son válidos.',
})
@Controller('carts')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un carrito de invitado' })
  @ApiCreatedResponse({ description: 'Carrito creado.' })
  create(@Body() body: CreateCartDto) {
    return this.cartsService.create(body.sessionId);
  }

  @Get(':cartId')
  @ApiOperation({ summary: 'Consultar un carrito y sus artículos' })
  @ApiOkResponse({ description: 'Carrito con sus artículos.' })
  @ApiNotFoundResponse({ description: 'El carrito no existe.' })
  get(@Param() params: CartIdParamsDto) {
    return this.cartsService.get(params.cartId);
  }

  @Get(':cartId/availability')
  @ApiOperation({
    summary: 'Consultar la disponibilidad de los artículos en Inventory',
  })
  @ApiOkResponse({
    description: 'Disponibilidad de cada variante del carrito.',
  })
  @ApiNotFoundResponse({ description: 'El carrito no existe.' })
  @ApiBadGatewayResponse({
    description: 'Inventory devolvió una respuesta inválida.',
  })
  @ApiServiceUnavailableResponse({
    description: 'Inventory no está disponible.',
  })
  getAvailability(@Param() params: CartIdParamsDto) {
    return this.cartsService.getAvailability(params.cartId);
  }

  @Post(':cartId/items')
  @ApiOperation({ summary: 'Agregar una variante al carrito' })
  @ApiCreatedResponse({
    description: 'Artículo agregado o cantidad incrementada.',
  })
  @ApiNotFoundResponse({ description: 'El carrito no existe.' })
  @ApiConflictResponse({ description: 'El carrito no está activo.' })
  addItem(@Param() params: CartIdParamsDto, @Body() body: AddCartItemDto) {
    return this.cartsService.addItem(
      params.cartId,
      body.variantId,
      body.quantity,
    );
  }

  @Patch(':cartId/items/:itemId')
  @ApiOperation({
    summary: 'Actualizar la cantidad de un artículo del carrito',
  })
  @ApiOkResponse({ description: 'Artículo actualizado.' })
  @ApiNotFoundResponse({ description: 'El carrito o el artículo no existe.' })
  @ApiConflictResponse({ description: 'El carrito no está activo.' })
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
  @ApiOperation({ summary: 'Eliminar un artículo del carrito' })
  @ApiNoContentResponse({ description: 'Artículo eliminado.' })
  @ApiNotFoundResponse({ description: 'El carrito o el artículo no existe.' })
  @ApiConflictResponse({ description: 'El carrito no está activo.' })
  removeItem(@Param() params: CartItemParamsDto) {
    return this.cartsService.removeItem(params.cartId, params.itemId);
  }
}

@ApiTags('Finalización de compra')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Crear o consultar una compra para recogida',
    description:
      'La reserva de inventario se procesa de forma asíncrona. Repita la misma solicitud con la misma clave para consultar su resultado.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Clave no vacía de hasta 180 caracteres. Debe conservarse para repetir la misma solicitud.',
    schema: { type: 'string', maxLength: 180 },
  })
  @ApiAcceptedResponse({
    description: 'Compra aceptada; la reserva de inventario está pendiente.',
    schema: {
      type: 'object',
      required: ['orderId', 'status', 'inventoryReservationStatus'],
      properties: {
        orderId: {
          type: 'string',
          format: 'uuid',
          description: 'Identificador del pedido.',
        },
        status: { type: 'string', description: 'Estado actual del pedido.' },
        inventoryReservationStatus: {
          type: 'string',
          description: 'Estado de la reserva de inventario.',
        },
      },
    },
  })
  @ApiOkResponse({
    description:
      'La reserva ya no está pendiente ni fallida; se devuelve el estado actual del pedido.',
    schema: {
      type: 'object',
      required: ['orderId', 'status', 'inventoryReservationStatus'],
      properties: {
        orderId: {
          type: 'string',
          format: 'uuid',
          description: 'Identificador del pedido.',
        },
        status: { type: 'string', description: 'Estado actual del pedido.' },
        inventoryReservationStatus: {
          type: 'string',
          description: 'Estado de la reserva de inventario.',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Solicitud, clave o carrito no válidos; también se rechaza el domicilio.',
  })
  @ApiNotFoundResponse({ description: 'El carrito o una variante no existe.' })
  @ApiBadGatewayResponse({
    description:
      'Catalog devolvió una respuesta inválida o rechazó la consulta.',
  })
  @ApiServiceUnavailableResponse({ description: 'Catalog no está disponible.' })
  @ApiConflictResponse({
    description:
      'Falta de inventario, carrito modificado o clave reutilizada con datos diferentes.',
  })
  async checkout(
    @Body() body: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!idempotencyKey?.trim() || idempotencyKey.length > 180) {
      throw new BadRequestException(
        'The Idempotency-Key header is required and must be at most 180 characters.',
      );
    }

    const result = await this.checkoutService.checkout(
      body,
      idempotencyKey.trim(),
    );
    if (
      result.inventoryReservationStatus === InventoryReservationStatus.FAILED
    ) {
      response.status(HttpStatus.CONFLICT);
    } else if (
      result.inventoryReservationStatus !== InventoryReservationStatus.PENDING
    ) {
      response.status(HttpStatus.OK);
    }
    return result;
  }
}

@ApiTags('Pedidos')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-actor-id',
  description: 'UUID v4 del actor, proporcionado por el BFF de confianza.',
  required: true,
})
@ApiHeader({
  name: 'x-actor-permissions',
  description:
    'Permisos separados por comas, proporcionados por el BFF de confianza.',
  required: true,
})
@UseGuards(CommerceInternalAuthGuard, CommercePermissionGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersApiService) {}

  @Get()
  @RequirePermissions(CommercePermission.ORDERS_READ)
  @ApiOperation({
    summary: 'Consultar pedidos recientes',
    description: 'Requiere el permiso commerce.orders.read.',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta la autenticación o el contexto del actor no es válido.',
  })
  @ApiForbiddenResponse({
    description: 'El actor no tiene el permiso necesario.',
  })
  @ApiBadRequestResponse({ description: 'Los filtros no son válidos.' })
  @ApiOkResponse({ description: 'Lista de pedidos.' })
  list(@Query() query: OrderListQueryDto) {
    return this.ordersService.list(query.status, query.limit);
  }

  @Get(':orderId')
  @RequirePermissions(CommercePermission.ORDERS_READ)
  @ApiOperation({
    summary: 'Consultar un pedido con artículos, pago y entrega',
    description: 'Requiere el permiso commerce.orders.read.',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta la autenticación o el contexto del actor no es válido.',
  })
  @ApiForbiddenResponse({
    description: 'El actor no tiene el permiso necesario.',
  })
  @ApiBadRequestResponse({ description: 'El identificador no es válido.' })
  @ApiNotFoundResponse({ description: 'El pedido no existe.' })
  @ApiOkResponse({ description: 'Detalle del pedido.' })
  get(@Param() params: OrderIdParamsDto) {
    return this.ordersService.get(params.orderId);
  }

  @Post(':orderId/actions')
  @RequirePermissions(CommercePermission.ORDERS_UPDATE_STATUS)
  @ApiOperation({
    summary: 'Ejecutar una acción del ciclo de vida del pedido',
    description:
      'Requiere commerce.orders.update_status; CANCEL también requiere commerce.orders.cancel y RETURN_TO_STORE requiere inventory.stock.return.',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta la autenticación o el contexto del actor no es válido.',
  })
  @ApiForbiddenResponse({
    description: 'El actor no tiene los permisos necesarios.',
  })
  @ApiBadRequestResponse({
    description: 'Los datos de la acción no son válidos.',
  })
  @ApiNotFoundResponse({ description: 'El pedido no existe.' })
  @ApiConflictResponse({
    description: 'La acción no es válida para el estado actual del pedido.',
  })
  @ApiBadGatewayResponse({
    description:
      'Inventory devolvió una respuesta inválida o que no corresponde a la reserva.',
  })
  @ApiServiceUnavailableResponse({
    description: 'Inventory no está disponible.',
  })
  @ApiCreatedResponse({
    description:
      'Acción ejecutada; se devuelve el detalle actualizado del pedido.',
  })
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

@ApiTags('Pagos')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-actor-id',
  description: 'UUID v4 del actor, proporcionado por el BFF de confianza.',
  required: true,
})
@ApiHeader({
  name: 'x-actor-permissions',
  description:
    'Permisos separados por comas, proporcionados por el BFF de confianza.',
  required: true,
})
@UseGuards(CommerceInternalAuthGuard, CommercePermissionGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsApiService) {}

  @Get(':paymentId')
  @RequirePermissions(CommercePermission.PAYMENTS_READ)
  @ApiOperation({
    summary: 'Consultar el estado y la referencia de un pago',
    description: 'Requiere el permiso commerce.payments.read.',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta la autenticación o el contexto del actor no es válido.',
  })
  @ApiForbiddenResponse({
    description: 'El actor no tiene el permiso necesario.',
  })
  @ApiBadRequestResponse({ description: 'El identificador no es válido.' })
  @ApiNotFoundResponse({ description: 'El pago no existe.' })
  @ApiOkResponse({ description: 'Datos del pago.' })
  get(@Param() params: PaymentIdParamsDto) {
    return this.paymentsService.get(params.paymentId);
  }

  @Post(':paymentId/actions')
  @ApiOperation({
    summary: 'Ejecutar una acción de pago',
    description:
      'El permiso requerido depende de la acción: commerce.payments.review, commerce.payments.approve o commerce.payments.record_cash.',
  })
  @ApiUnauthorizedResponse({
    description: 'Falta la autenticación o el contexto del actor no es válido.',
  })
  @ApiForbiddenResponse({
    description: 'El actor no tiene el permiso necesario.',
  })
  @ApiBadRequestResponse({
    description: 'Los datos de la acción no son válidos.',
  })
  @ApiNotFoundResponse({ description: 'El pago no existe.' })
  @ApiConflictResponse({
    description: 'La acción no es válida para el estado actual del pago.',
  })
  @ApiCreatedResponse({
    description: 'Acción ejecutada; se devuelve el pago actualizado.',
  })
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
