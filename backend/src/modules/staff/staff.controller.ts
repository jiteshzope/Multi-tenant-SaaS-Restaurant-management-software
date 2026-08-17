import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RestaurantId, Roles } from '../../common/decorators';
import { StaffService } from './staff.service';
import type { AuthUser } from '../../types/auth-user';
import {
  CreateStaffDto,
  ResetStaffPasswordDto,
  UpdateStaffDto,
  UpdateStaffStatusDto,
} from './dto/staff.dto';

@ApiTags('staff')
@ApiBearerAuth()
@Controller('staff')
@Roles('OWNER')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @ApiOperation({ summary: 'All staff of this restaurant' })
  list(@RestaurantId() restaurantId: string) {
    return this.staff.list(restaurantId);
  }

  @Get('waiters')
  @ApiOperation({ summary: 'Active waiters — the assignment dropdown' })
  waiters(@RestaurantId() restaurantId: string) {
    return this.staff.waiters(restaurantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a waiter or the kitchen handler' })
  create(
    @RestaurantId() restaurantId: string,
    @Body() dto: CreateStaffDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.staff.create(restaurantId, dto, user.userId);
  }

  @Patch(':userId')
  update(
    @RestaurantId() restaurantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staff.update(restaurantId, userId, dto);
  }

  @Patch(':userId/password')
  @ApiOperation({ summary: 'Reset a staff password — revokes all their sessions' })
  resetPassword(
    @RestaurantId() restaurantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ResetStaffPasswordDto,
  ) {
    return this.staff.resetPassword(restaurantId, userId, dto);
  }

  @Patch(':userId/status')
  @ApiOperation({ summary: 'Activate / deactivate. The owner can never be deactivated.' })
  setStatus(
    @RestaurantId() restaurantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateStaffStatusDto,
  ) {
    return this.staff.setStatus(restaurantId, userId, dto);
  }
}
