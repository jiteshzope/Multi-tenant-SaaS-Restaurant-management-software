import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators';
import { OrdersService } from './orders.service';
import { PlaceOrderDto, UpdateOrderStatusDto } from './dto/orders.dto';
import type { AuthUser } from '../../types/auth-user';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Roles('OWNER', 'WAITER')
  @ApiOperation({ summary: 'Send an order to the kitchen. Prices are resolved server-side.' })
  place(@CurrentUser() user: AuthUser, @Body() dto: PlaceOrderDto) {
    return this.orders.place(user, dto);
  }

  @Get(':id')
  @Roles('OWNER', 'WAITER', 'KITCHEN')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.detail(user, id);
  }

  @Patch(':id/status')
  @Roles('OWNER', 'KITCHEN')
  @ApiOperation({ summary: 'Guarded transition — 409 ORDER_ALREADY_MOVED if someone beat you' })
  status(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.transition(user, id, dto.status);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'WAITER')
  @ApiOperation({ summary: 'Only while still PENDING' })
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.cancel(user, id);
  }
}
