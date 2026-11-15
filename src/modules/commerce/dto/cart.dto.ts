import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCartDto {
  @ApiPropertyOptional({ maxLength: 180 })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  readonly sessionId?: string;
}

export class AddCartItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  readonly variantId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  readonly quantity!: number;
}

export class UpdateCartItemDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  readonly quantity!: number;
}

export class CartIdParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  readonly cartId!: string;
}

export class CartItemParamsDto extends CartIdParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  readonly itemId!: string;
}
