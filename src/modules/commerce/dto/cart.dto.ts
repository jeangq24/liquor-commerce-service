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
  @ApiPropertyOptional({
    maxLength: 180,
    description: 'Identificador opcional de la sesión del invitado.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  readonly sessionId?: string;
}

export class AddCartItemDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Identificador de la variante del catálogo.',
  })
  @IsUUID()
  readonly variantId!: string;

  @ApiProperty({
    minimum: 1,
    description: 'Cantidad entera que se agrega al carrito.',
  })
  @IsInt()
  @Min(1)
  readonly quantity!: number;
}

export class UpdateCartItemDto {
  @ApiProperty({
    minimum: 1,
    description: 'Nueva cantidad entera del artículo.',
  })
  @IsInt()
  @Min(1)
  readonly quantity!: number;
}

export class CartIdParamsDto {
  @ApiProperty({ format: 'uuid', description: 'Identificador del carrito.' })
  @IsUUID()
  readonly cartId!: string;
}

export class CartItemParamsDto extends CartIdParamsDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Identificador del artículo del carrito.',
  })
  @IsUUID()
  readonly itemId!: string;
}
