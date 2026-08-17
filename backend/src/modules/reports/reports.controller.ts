import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RestaurantId, Roles } from '../../common/decorators';
import { DateRangeDto } from '../../common/dto/pagination.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@Roles('OWNER')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Today: sessions, orders, revenue, average bill, open tables' })
  summary(@RestaurantId() restaurantId: string) {
    return this.reports.summary(restaurantId);
  }

  @Get('daily')
  daily(@RestaurantId() restaurantId: string, @Query() range: DateRangeDto) {
    return this.reports.daily(restaurantId, range);
  }

  @Get('top-items')
  topItems(@RestaurantId() restaurantId: string, @Query() range: DateRangeDto) {
    return this.reports.topItems(restaurantId, range);
  }

  @Get('waiters')
  waiters(@RestaurantId() restaurantId: string, @Query() range: DateRangeDto) {
    return this.reports.waiters(restaurantId, range);
  }

  @Get('prep-time')
  prepTime(@RestaurantId() restaurantId: string, @Query() range: DateRangeDto) {
    return this.reports.prepTime(restaurantId, range);
  }

  @Get('hourly')
  hourly(@RestaurantId() restaurantId: string, @Query() range: DateRangeDto) {
    return this.reports.hourly(restaurantId, range);
  }
}
