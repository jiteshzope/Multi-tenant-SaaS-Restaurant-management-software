import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators';
import { SessionsService } from './sessions.service';
import { OpenSessionDto } from './dto/sessions.dto';
import type { AuthUser } from '../../types/auth-user';

@ApiTags('sessions')
@ApiBearerAuth()
@Controller('sessions')
@Roles('OWNER', 'WAITER')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Open a session, or return the one already open (idempotent)' })
  open(@CurrentUser() user: AuthUser, @Body() dto: OpenSessionDto) {
    return this.sessions.open(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Order timeline for the table-detail screen' })
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.detail(user, id);
  }

  @Get(':id/bill')
  @ApiOperation({ summary: 'Merged lines + server-computed subtotal, tax and total' })
  bill(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.bill(user, id);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '409 ORDERS_IN_PROGRESS while the kitchen is still cooking' })
  close(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.close(user, id);
  }

  @Get('table/:tableId/history')
  history(@CurrentUser() user: AuthUser, @Param('tableId', ParseUUIDPipe) tableId: string) {
    return this.sessions.history(user, tableId);
  }
}
