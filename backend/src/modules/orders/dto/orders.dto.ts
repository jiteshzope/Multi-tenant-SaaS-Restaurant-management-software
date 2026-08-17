import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * NO PRICE FIELD — by design. Prices are resolved server-side from menu_items
 * at insert time; accepting one from the browser would let a ₹320 biryani be
 * ordered for ₹1.
 */
export class OrderItemDto {
  @ApiProperty()
  @IsUUID()
  menuItemId!: string;

  @ApiProperty({ minimum: 1, maximum: 999 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;

  @ApiPropertyOptional({ example: 'no ice' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class PlaceOrderDto {
  @ApiPropertyOptional({ description: 'Either sessionId or tableId is required' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Opens/reuses the table’s open session' })
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @ApiPropertyOptional({ example: 'less spicy' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ['PREPARING', 'COMPLETED'] })
  @IsIn(['PREPARING', 'COMPLETED'])
  status!: 'PREPARING' | 'COMPLETED';
}
