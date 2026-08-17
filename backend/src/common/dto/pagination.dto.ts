import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

/** Keyset pagination — see database/CLAUDE.md query 45. */
export class PaginationDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'ISO timestamp cursor from the previous page' })
  @IsOptional()
  @IsISO8601()
  cursor?: string;
}

export class DateRangeDto {
  @ApiPropertyOptional({ description: 'Inclusive start, ISO 8601. Defaults to 30 days ago.' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Exclusive end, ISO 8601. Defaults to now.' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
