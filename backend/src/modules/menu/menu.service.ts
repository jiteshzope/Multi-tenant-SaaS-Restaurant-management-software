import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import {
  CategoryNotEmptyException,
  NotFoundException,
} from '../../common/exceptions/domain.exception';
import type {
  CreateCategoryDto,
  CreateMenuItemDto,
  ToggleAvailabilityDto,
  UpdateCategoryDto,
  UpdateMenuItemDto,
} from './dto/menu.dto';

const ITEM_FIELDS = {
  id: true,
  categoryId: true,
  name: true,
  description: true,
  price: true,
  isVeg: true,
  isAvailable: true,
  displayOrder: true,
} as const;

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Query 13 — the whole menu nested, one round trip. */
  async fullMenu(restaurantId: string) {
    const categories = await this.prisma.menuCategory.findMany({
      where: { restaurantId, isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        displayOrder: true,
        items: {
          where: { isActive: true },
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
          select: ITEM_FIELDS,
        },
      },
    });
    return categories;
  }

  /** Query 9 — categories with a live item count. */
  async categories(restaurantId: string) {
    const rows = await this.prisma.menuCategory.findMany({
      where: { restaurantId, isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        displayOrder: true,
        _count: { select: { items: { where: { isActive: true } } } },
      },
    });
    return rows.map(({ _count, ...c }) => ({ ...c, itemCount: _count.items }));
  }

  /** Query 11 — the waiter's right-hand 70% column. */
  async itemsOfCategory(restaurantId: string, categoryId: string) {
    await this.assertCategory(restaurantId, categoryId);
    return this.prisma.menuItem.findMany({
      where: { restaurantId, categoryId, isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: ITEM_FIELDS,
    });
  }

  /** Query 12 — the search bar, across all categories, backed by the trigram index. */
  async search(restaurantId: string, q: string) {
    const rows = await this.prisma.menuItem.findMany({
      where: {
        restaurantId,
        isActive: true,
        name: { contains: q, mode: 'insensitive' },
      },
      orderBy: { name: 'asc' },
      take: 50,
      select: { ...ITEM_FIELDS, category: { select: { id: true, name: true } } },
    });
    return rows.map(({ category, ...item }) => ({
      ...item,
      categoryName: category.name,
    }));
  }

  async createCategory(restaurantId: string, dto: CreateCategoryDto) {
    const category = await this.prisma.menuCategory.create({
      data: { restaurantId, name: dto.name, displayOrder: dto.displayOrder ?? 0 },
      select: { id: true, name: true, displayOrder: true, isActive: true, createdAt: true },
    });
    this.realtime.menuUpdated(restaurantId, { type: 'category.created', entityId: category.id });
    return { ...category, itemCount: 0 };
  }

  async updateCategory(restaurantId: string, id: string, dto: UpdateCategoryDto) {
    await this.assertCategory(restaurantId, id);
    const category = await this.prisma.menuCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
      },
      select: { id: true, name: true, displayOrder: true, isActive: true },
    });
    this.realtime.menuUpdated(restaurantId, { type: 'category.updated', entityId: id });
    return category;
  }

  /** Query 16 — refuses while active items remain, so nothing disappears silently. */
  async deleteCategory(restaurantId: string, id: string) {
    await this.assertCategory(restaurantId, id);

    const remaining = await this.prisma.menuItem.count({
      where: { restaurantId, categoryId: id, isActive: true },
    });
    if (remaining > 0) throw new CategoryNotEmptyException();

    // Soft-deleted items still hold an ON DELETE RESTRICT reference, so the
    // category is soft-deleted too — history stays intact either way.
    const total = await this.prisma.menuItem.count({ where: { restaurantId, categoryId: id } });
    if (total > 0) {
      await this.prisma.menuCategory.update({ where: { id }, data: { isActive: false } });
    } else {
      await this.prisma.menuCategory.delete({ where: { id } });
    }

    this.realtime.menuUpdated(restaurantId, { type: 'category.deleted', entityId: id });
    return { id, deleted: true };
  }

  async createItem(restaurantId: string, dto: CreateMenuItemDto) {
    await this.assertCategory(restaurantId, dto.categoryId);

    const item = await this.prisma.menuItem.create({
      data: {
        restaurantId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description ?? null,
        price: new Prisma.Decimal(dto.price),
        isVeg: dto.isVeg ?? null,
        displayOrder: dto.displayOrder ?? 0,
      },
      select: ITEM_FIELDS,
    });
    this.realtime.menuUpdated(restaurantId, { type: 'item.created', entityId: item.id });
    return item;
  }

  async updateItem(restaurantId: string, id: string, dto: UpdateMenuItemDto) {
    await this.assertItem(restaurantId, id);

    const item = await this.prisma.menuItem.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.price !== undefined ? { price: new Prisma.Decimal(dto.price) } : {}),
        ...(dto.isVeg !== undefined ? { isVeg: dto.isVeg } : {}),
        ...(dto.isAvailable !== undefined ? { isAvailable: dto.isAvailable } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
      },
      select: ITEM_FIELDS,
    });
    this.realtime.menuUpdated(restaurantId, { type: 'item.updated', entityId: id });
    return item;
  }

  /** Query 15 — "out of stock today". Past orders keep their price snapshot. */
  async setAvailability(restaurantId: string, id: string, dto: ToggleAvailabilityDto) {
    await this.assertItem(restaurantId, id);
    const item = await this.prisma.menuItem.update({
      where: { id },
      data: { isAvailable: dto.isAvailable },
      select: ITEM_FIELDS,
    });
    this.realtime.menuUpdated(restaurantId, { type: 'item.availability', entityId: id });
    return item;
  }

  /** Soft delete — order history must keep working. */
  async deleteItem(restaurantId: string, id: string) {
    await this.assertItem(restaurantId, id);
    await this.prisma.menuItem.update({
      where: { id },
      data: { isActive: false, isAvailable: false },
    });
    this.realtime.menuUpdated(restaurantId, { type: 'item.deleted', entityId: id });
    return { id, deleted: true };
  }

  /* --- tenant guards: a cross-tenant id must look exactly like a missing one --- */

  private async assertCategory(restaurantId: string, id: string) {
    const found = await this.prisma.menuCategory.findFirst({
      where: { id, restaurantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Category');
    return found;
  }

  private async assertItem(restaurantId: string, id: string) {
    const found = await this.prisma.menuItem.findFirst({
      where: { id, restaurantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Menu item');
    return found;
  }
}
