import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { RestaurantId, Roles } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';

export class UpdateRestaurantDto {
  @ApiPropertyOptional()
  @IsOptional()
  // The return type is declared because class-transformer types `value` as
  // `any`, so an unannotated arrow leaks `any` back into the DTO.
  @Transform(({ value }): unknown => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ description: 'Decimal string, 0–100', example: '5.00' })
  @IsOptional()
  @IsString()
  @Matches(/^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/, {
    message: 'taxPercent must be a number between 0 and 100 with at most 2 decimals',
  })
  taxPercent?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

const PROFILE = {
  id: true,
  name: true,
  slug: true,
  phone: true,
  address: true,
  currency: true,
  timezone: true,
  taxPercent: true,
  isActive: true,
  createdAt: true,
} as const;

@ApiTags('restaurant')
@ApiBearerAuth()
@Controller('restaurant')
export class RestaurantsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'The signed-in user’s restaurant profile' })
  get(@RestaurantId() restaurantId: string) {
    return this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: PROFILE,
    });
  }

  @Patch()
  @Roles('OWNER')
  @ApiOperation({ summary: 'Update the profile. New tax applies to future bills only.' })
  update(@RestaurantId() restaurantId: string, @Body() dto: UpdateRestaurantDto) {
    return this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.taxPercent !== undefined ? { taxPercent: dto.taxPercent } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      },
      select: PROFILE,
    });
  }
}
