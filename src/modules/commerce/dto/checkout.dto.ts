import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  Max,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ArrayMinSize,
  IsArray,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { FulfillmentType, OrderStatus } from '../../orders/order.constants.js';
import { PaymentMethod } from '../../payments/payment.constants.js';
import { OrderAction, PaymentAction } from '../commerce-api.constants.js';

export class DeliveryDetailsDto {
  @ApiProperty({ maxLength: 120, description: 'Municipio de entrega.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  readonly municipality!: string;

  @ApiProperty({ maxLength: 120, description: 'Barrio de entrega.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  readonly neighborhood!: string;

  @ApiProperty({ description: 'Dirección de entrega.' })
  @IsString()
  @IsNotEmpty()
  readonly address!: string;

  @ApiPropertyOptional({ description: 'Referencia adicional de la dirección.' })
  @IsOptional()
  @IsString()
  readonly addressReference?: string;

  @ApiPropertyOptional({
    maxLength: 180,
    description: 'Nombre de quien recibe el pedido.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  readonly recipientName?: string;

  @ApiPropertyOptional({
    maxLength: 30,
    description: 'Teléfono de quien recibe el pedido.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  readonly recipientPhone?: string;
}

export class CheckoutDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Identificador del carrito activo.',
  })
  @IsUUID()
  readonly cartId!: string;

  @ApiProperty({
    maxLength: 180,
    description:
      'Nombre del cliente; no puede estar vacío ni contener solo espacios.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  readonly customerName!: string;

  @ApiProperty({
    maxLength: 30,
    description:
      'Teléfono del cliente; no puede estar vacío ni contener solo espacios.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  readonly customerPhone!: string;

  @ApiPropertyOptional({
    maxLength: 180,
    format: 'email',
    description: 'Correo electrónico del cliente.',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  readonly customerEmail?: string;

  @ApiProperty({
    enum: Object.values(FulfillmentType),
    description:
      'Tipo de entrega. Actualmente solo se admite PICKUP en checkout.',
  })
  @IsEnum(FulfillmentType)
  readonly fulfillmentType!: (typeof FulfillmentType)[keyof typeof FulfillmentType];

  @ApiProperty({
    enum: Object.values(PaymentMethod),
    description: 'Método de pago del pedido.',
  })
  @IsEnum(PaymentMethod)
  readonly paymentMethod!: (typeof PaymentMethod)[keyof typeof PaymentMethod];

  @ApiPropertyOptional({
    type: DeliveryDetailsDto,
    description:
      'Datos de domicilio; checkout no los admite mientras solo esté habilitada la recogida.',
  })
  @ValidateIf(
    (checkout: CheckoutDto) =>
      checkout.fulfillmentType === FulfillmentType.DELIVERY,
  )
  @ValidateNested()
  @Type(() => DeliveryDetailsDto)
  readonly delivery?: DeliveryDetailsDto;
}

export class OrderIdParamsDto {
  @ApiProperty({ format: 'uuid', description: 'Identificador del pedido.' })
  @IsUUID()
  readonly orderId!: string;
}

export class OrderListQueryDto {
  @ApiPropertyOptional({
    enum: Object.values(OrderStatus),
    description: 'Filtra los pedidos por estado.',
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  readonly status?: (typeof OrderStatus)[keyof typeof OrderStatus];

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    default: 25,
    description: 'Número máximo de pedidos a consultar.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly limit = 25;
}

export class OrderActionDto {
  @ApiProperty({
    enum: Object.values(OrderAction),
    description: 'Acción solicitada para el ciclo de vida del pedido.',
  })
  @IsEnum(OrderAction)
  readonly action!: (typeof OrderAction)[keyof typeof OrderAction];

  @ApiPropertyOptional({
    maxLength: 180,
    description:
      'Motivo obligatorio para CANCEL, DELIVERY_FAILED y RETURN_TO_STORE.',
  })
  @ValidateIf(
    (request: OrderActionDto) =>
      request.action === OrderAction.CANCEL ||
      request.action === OrderAction.DELIVERY_FAILED ||
      request.action === OrderAction.RETURN_TO_STORE,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  readonly reason?: string;

  @ApiPropertyOptional({
    type: () => [StockReturnItemDto],
    minItems: 1,
    description:
      'Artículos devueltos; obligatorio y no vacío para RETURN_TO_STORE.',
  })
  @ValidateIf(
    (request: OrderActionDto) => request.action === OrderAction.RETURN_TO_STORE,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockReturnItemDto)
  readonly items?: StockReturnItemDto[];
}

export class StockReturnItemDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Identificador de la variante devuelta.',
  })
  @IsUUID()
  readonly variantId!: string;

  @ApiProperty({
    minimum: 1,
    description: 'Cantidad entera recibida en la devolución.',
  })
  @IsInt()
  @Min(1)
  readonly quantityReceived!: number;

  @ApiProperty({
    minimum: 0,
    description:
      'Cantidad entera apta para volver al inventario; no puede superar la cantidad recibida.',
  })
  @IsInt()
  @Min(0)
  readonly quantityRestockable!: number;

  @ApiPropertyOptional({
    maxLength: 180,
    description: 'Motivo asociado al artículo devuelto.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  readonly reason?: string;
}

export class PaymentIdParamsDto {
  @ApiProperty({ format: 'uuid', description: 'Identificador del pago.' })
  @IsUUID()
  readonly paymentId!: string;
}

export class PaymentActionDto {
  @ApiProperty({
    enum: Object.values(PaymentAction),
    description: 'Acción solicitada para el pago.',
  })
  @IsEnum(PaymentAction)
  readonly action!: (typeof PaymentAction)[keyof typeof PaymentAction];

  @ApiPropertyOptional({
    maxLength: 180,
    description: 'Referencia asociada a la acción del pago.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  readonly reference?: string;
}
