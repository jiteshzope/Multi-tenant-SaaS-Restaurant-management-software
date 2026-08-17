import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RestaurantId, Roles } from '../../common/decorators';
import { TableAccessGuard } from '../../common/guards/table-access.guard';
import { TablesService } from './tables.service';
import type { AuthUser } from '../../types/auth-user';
import {
  AssignWaiterDto,
  BulkCreateTablesDto,
  CreateTableDto,
  UpdateTableDto,
} from './dto/tables.dto';

@ApiTags('tables')
@ApiBearerAuth()
@Controller('tables')
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  @Get()
  @Roles('OWNER')
  @ApiOperation({ summary: 'The owner’s table grid — status, waiter, running total' })
  grid(@RestaurantId() restaurantId: string) {
    return this.tables.grid(restaurantId);
  }

  @Get('my')
  @Roles('WAITER', 'OWNER')
  @ApiOperation({ summary: 'Tables currently assigned to the signed-in waiter' })
  my(@RestaurantId() restaurantId: string, @CurrentUser() user: AuthUser) {
    return this.tables.myTables(restaurantId, user.userId);
  }

  @Get(':id')
  @Roles('OWNER', 'WAITER')
  @UseGuards(TableAccessGuard)
  one(@RestaurantId() restaurantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.tables.one(restaurantId, id);
  }

  @Post()
  @Roles('OWNER')
  create(@RestaurantId() restaurantId: string, @Body() dto: CreateTableDto) {
    return this.tables.create(restaurantId, dto);
  }

  @Post('bulk')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Create tables `from`…`to`; existing numbers are skipped' })
  bulk(@RestaurantId() restaurantId: string, @Body() dto: BulkCreateTablesDto) {
    return this.tables.bulkCreate(restaurantId, dto);
  }

  @Patch(':id')
  @Roles('OWNER')
  update(
    @RestaurantId() restaurantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableDto,
  ) {
    return this.tables.update(restaurantId, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Soft delete — session history hangs off this row' })
  remove(@RestaurantId() restaurantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.tables.remove(restaurantId, id);
  }

  /* --- assignments ------------------------------------------------------- */

  @Put(':id/assignment')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Assign or reassign — old row closed and new one opened together' })
  assign(
    @RestaurantId() restaurantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignWaiterDto,
  ) {
    return this.tables.assign(restaurantId, id, dto);
  }

  @Delete(':id/assignment')
  @Roles('OWNER')
  unassign(@RestaurantId() restaurantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.tables.unassign(restaurantId, id);
  }

  @Get(':id/assignment/history')
  @Roles('OWNER')
  history(@RestaurantId() restaurantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.tables.assignmentHistory(restaurantId, id);
  }
}
