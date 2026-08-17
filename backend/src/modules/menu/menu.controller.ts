import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RestaurantId, Roles } from '../../common/decorators';
import { MenuService } from './menu.service';
import {
  CreateCategoryDto,
  CreateMenuItemDto,
  MenuSearchDto,
  ToggleAvailabilityDto,
  UpdateCategoryDto,
  UpdateMenuItemDto,
} from './dto/menu.dto';

@ApiTags('menu')
@ApiBearerAuth()
@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  @ApiOperation({ summary: 'The whole menu, nested — categories with their items' })
  full(@RestaurantId() restaurantId: string) {
    return this.menu.fullMenu(restaurantId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Item search across all categories' })
  search(@RestaurantId() restaurantId: string, @Query() dto: MenuSearchDto) {
    return this.menu.search(restaurantId, dto.q);
  }

  @Get('categories')
  categories(@RestaurantId() restaurantId: string) {
    return this.menu.categories(restaurantId);
  }

  @Post('categories')
  @Roles('OWNER')
  createCategory(@RestaurantId() restaurantId: string, @Body() dto: CreateCategoryDto) {
    return this.menu.createCategory(restaurantId, dto);
  }

  @Patch('categories/:id')
  @Roles('OWNER')
  updateCategory(
    @RestaurantId() restaurantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.menu.updateCategory(restaurantId, id, dto);
  }

  @Delete('categories/:id')
  @Roles('OWNER')
  @ApiOperation({ summary: '409 CATEGORY_NOT_EMPTY while it still holds active items' })
  deleteCategory(@RestaurantId() restaurantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.menu.deleteCategory(restaurantId, id);
  }

  @Get('categories/:id/items')
  items(@RestaurantId() restaurantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.menu.itemsOfCategory(restaurantId, id);
  }

  @Post('items')
  @Roles('OWNER')
  createItem(@RestaurantId() restaurantId: string, @Body() dto: CreateMenuItemDto) {
    return this.menu.createItem(restaurantId, dto);
  }

  @Patch('items/:id')
  @Roles('OWNER')
  updateItem(
    @RestaurantId() restaurantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.menu.updateItem(restaurantId, id, dto);
  }

  @Patch('items/:id/availability')
  @Roles('OWNER')
  setAvailability(
    @RestaurantId() restaurantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleAvailabilityDto,
  ) {
    return this.menu.setAvailability(restaurantId, id, dto);
  }

  @Delete('items/:id')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Soft delete — past orders keep their price snapshot' })
  deleteItem(@RestaurantId() restaurantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.menu.deleteItem(restaurantId, id);
  }
}
