import { Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RestaurantId, Roles } from '../../common/decorators';
import { KitchenService } from './kitchen.service';
import type { AuthUser } from '../../types/auth-user';

@ApiTags('kitchen')
@ApiBearerAuth()
@Controller('kitchen')
@Roles('OWNER', 'KITCHEN')
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get('board')
  @ApiOperation({ summary: 'Today’s orders grouped into PENDING / PREPARING / COMPLETED' })
  board(@RestaurantId() restaurantId: string) {
    return this.kitchen.board(restaurantId);
  }

  @Get('counts')
  counts(@RestaurantId() restaurantId: string) {
    return this.kitchen.counts(restaurantId);
  }

  @Patch('orders/:id/start')
  @ApiOperation({ summary: 'PENDING → PREPARING' })
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.kitchen.start(user, id);
  }

  @Patch('orders/:id/complete')
  @ApiOperation({ summary: 'PREPARING → COMPLETED' })
  complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.kitchen.complete(user, id);
  }

  @Patch('orders/:id/reopen')
  @ApiOperation({
    summary: 'COMPLETED → PREPARING — undo a mistaken complete',
    description:
      'Keeps the original preparing_at, so the card returns to its previous position in ' +
      'the PREPARING queue. Refused with SESSION_NOT_OPEN once the table has been billed.',
  })
  reopen(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.kitchen.reopen(user, id);
  }
}
