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
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  readonly municipality!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  readonly neighborhood!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  readonly address!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readonly addressReference?: string;

  @ApiPropertyOptional({ maxLength: 180 })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  readonly recipientName?: string;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  readonly recipientPhone?: string;
}

export class CheckoutDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  readonly cartId!: string;

  @ApiProperty({ maxLength: 180 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  readonly customerName!: string;

  @ApiProperty({ maxLength: 30 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  readonly customerPhone!: string;

  @ApiPropertyOptional({ maxLength: 180 })
  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  readonly customerEmail?: string;

  @ApiProperty({ enum: Object.values(FulfillmentType) })
  @IsEnum(FulfillmentType)
  readonly fulfillmentType!: (typeof FulfillmentType)[keyof typeof FulfillmentType];

  @ApiProperty({ enum: Object.values(PaymentMethod) })
  @IsEnum(PaymentMethod)
  readonly paymentMethod!: (typeof PaymentMethod)[keyof typeof PaymentMethod];

  @ApiPropertyOptional({ type: DeliveryDetailsDto })
  @ValidateIf(
    (checkout: CheckoutDto) =>
      checkout.fulfillmentType === FulfillmentType.DELIVERY,
  )
  @ValidateNested()
  @Type(() => DeliveryDetailsDto)
  readonly delivery?: DeliveryDetailsDto;
}

export class OrderIdParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  readonly orderId!: string;
}

export class OrderListQueryDto {
  @ApiPropertyOptional({ enum: Object.values(OrderStatus) })
  @IsOptional()
  @IsEnum(OrderStatus)
  readonly status?: (typeof OrderStatus)[keyof typeof OrderStatus];

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly limit = 25;
}

export class OrderActionDto {
  @ApiProperty({ enum: Object.values(OrderAction) })
  @IsEnum(OrderAction)
  readonly action!: (typeof OrderAction)[keyof typeof OrderAction];

  @ApiPropertyOptional({ maxLength: 180 })
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

  @ApiPropertyOptional({ type: () => [StockReturnItemDto] })
  @ValidateIf(
    (request: OrderActionDto) =>
      request.action === OrderAction.RETURN_TO_STORE,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockReturnItemDto)
  readonly items?: StockReturnItemDto[];
}

export class StockReturnItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  readonly variantId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  readonly quantityReceived!: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  readonly quantityRestockable!: number;

  @ApiPropertyOptional({ maxLength: 180 })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  readonly reason?: string;
}

export class PaymentIdParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  readonly paymentId!: string;
}

export class PaymentActionDto {
  @ApiProperty({ enum: Object.values(PaymentAction) })
  @IsEnum(PaymentAction)
  readonly action!: (typeof PaymentAction)[keyof typeof PaymentAction];

  @ApiPropertyOptional({ maxLength: 180 })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  readonly reference?: string;
}
