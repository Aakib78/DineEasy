import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotFoundDomainError } from '../../common/errors/domain-errors';
import { AuditLogService } from '../audit/audit-log.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { UpsertVariantDto } from './dto/upsert-variant.dto';

const ITEM_INCLUDE = {
  variants: { orderBy: { displayOrder: 'asc' as const } },
  modifierGroups: {
    include: { modifierGroup: { include: { modifiers: { where: { isActive: true } } } } },
  },
};

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * v1 keeps exactly one Menu per outlet ("Main Menu") — the schema supports several (future
   * lunch/dinner menus) but nothing in v1 exposes multi-menu switching yet. Auto-created on
   * first use so staff never have to think about a "Menu" object at all, only categories/items.
   */
  async getOrCreateDefaultMenu(outletId: string) {
    const existing = await this.prisma.menu.findFirst({ where: { outletId } });
    if (existing) return existing;
    return this.prisma.menu.create({ data: { outletId, name: 'Main Menu' } });
  }

  /** Full nested tree for the outlet's menu — staff editing view (includes inactive/unavailable). */
  async getFullTree(outletId: string) {
    const menu = await this.getOrCreateDefaultMenu(outletId);
    return this.prisma.menuCategory.findMany({
      where: { menuId: menu.id },
      include: { items: { include: ITEM_INCLUDE, orderBy: { displayOrder: 'asc' } } },
      orderBy: { displayOrder: 'asc' },
    });
  }

  /** Customer-facing tree — active categories/items only, per spec §12 availability rules. */
  async getPublicTree(outletId: string) {
    const menu = await this.getOrCreateDefaultMenu(outletId);
    return this.prisma.menuCategory.findMany({
      where: { menuId: menu.id, isActive: true },
      include: {
        items: {
          where: { isActive: true },
          include: ITEM_INCLUDE,
          orderBy: { displayOrder: 'asc' },
        },
      },
      orderBy: { displayOrder: 'asc' },
    });
  }

  // ---------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------

  async createCategory(organizationId: string, outletId: string, dto: CreateCategoryDto, actorUserId: string) {
    const menu = await this.getOrCreateDefaultMenu(outletId);
    const category = await this.prisma.menuCategory.create({
      data: { menuId: menu.id, name: dto.name, description: dto.description, displayOrder: dto.displayOrder ?? 0 },
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'menu_category.created',
      entityType: 'MenuCategory',
      entityId: category.id,
      newState: category,
    });

    return category;
  }

  async updateCategory(organizationId: string, outletId: string, id: string, dto: UpdateCategoryDto, actorUserId: string) {
    const category = await this.findCategoryOrThrow(outletId, id);
    const updated = await this.prisma.menuCategory.update({ where: { id: category.id }, data: dto });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'menu_category.updated',
      entityType: 'MenuCategory',
      entityId: id,
      previousState: category,
      newState: updated,
    });

    return updated;
  }

  private async findCategoryOrThrow(outletId: string, id: string) {
    const menu = await this.getOrCreateDefaultMenu(outletId);
    const category = await this.prisma.menuCategory.findFirst({ where: { id, menuId: menu.id } });
    if (!category) throw new NotFoundDomainError('MenuCategory', id);
    return category;
  }

  // ---------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------

  async createItem(organizationId: string, outletId: string, dto: CreateMenuItemDto, actorUserId: string) {
    await this.findCategoryOrThrow(outletId, dto.categoryId);

    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.menuItem.create({
        data: {
          categoryId: dto.categoryId,
          taxGroupId: dto.taxGroupId,
          name: dto.name,
          description: dto.description,
          sku: dto.sku,
          imageUrl: dto.imageUrl,
          basePrice: dto.basePrice,
          isVegetarian: dto.isVegetarian ?? true,
          displayOrder: dto.displayOrder ?? 0,
        },
      });

      if (dto.variants?.length) {
        await tx.menuItemVariant.createMany({
          data: dto.variants.map((v, i) => ({
            menuItemId: created.id,
            name: v.name,
            priceOverride: v.priceOverride,
            isDefault: v.isDefault ?? i === 0,
            displayOrder: i,
          })),
        });
      }

      if (dto.modifierGroupIds?.length) {
        await tx.menuItemModifierGroup.createMany({
          data: dto.modifierGroupIds.map((modifierGroupId, i) => ({
            menuItemId: created.id,
            modifierGroupId,
            displayOrder: i,
          })),
        });
      }

      return created;
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'menu_item.created',
      entityType: 'MenuItem',
      entityId: item.id,
      newState: dto,
    });

    return this.getItemById(outletId, item.id);
  }

  async getItemById(outletId: string, id: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id, category: { menu: { outletId } } },
      include: ITEM_INCLUDE,
    });
    if (!item) throw new NotFoundDomainError('MenuItem', id);
    return item;
  }

  async updateItem(organizationId: string, outletId: string, id: string, dto: UpdateMenuItemDto, actorUserId: string) {
    const before = await this.getItemById(outletId, id);

    await this.prisma.$transaction(async (tx) => {
      const { modifierGroupIds, ...itemFields } = dto;

      await tx.menuItem.update({ where: { id }, data: itemFields });

      if (modifierGroupIds) {
        await tx.menuItemModifierGroup.deleteMany({ where: { menuItemId: id } });
        await tx.menuItemModifierGroup.createMany({
          data: modifierGroupIds.map((modifierGroupId, i) => ({ menuItemId: id, modifierGroupId, displayOrder: i })),
        });
      }
    });

    const after = await this.getItemById(outletId, id);

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      // Price changes are a named example in spec §23 — flag them distinctly for easier
      // audit-log scanning even though the row shape is the same as any other item update.
      action: before.basePrice.toString() !== after.basePrice.toString() ? 'menu_item.price_changed' : 'menu_item.updated',
      entityType: 'MenuItem',
      entityId: id,
      previousState: before,
      newState: after,
    });

    return after;
  }

  // ---------------------------------------------------------------------
  // Variants
  // ---------------------------------------------------------------------

  async addVariant(organizationId: string, outletId: string, menuItemId: string, dto: UpsertVariantDto, actorUserId: string) {
    await this.getItemById(outletId, menuItemId); // ownership check

    const variant = await this.prisma.menuItemVariant.create({
      data: { menuItemId, name: dto.name, priceOverride: dto.priceOverride, isDefault: dto.isDefault ?? false },
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'menu_item_variant.created',
      entityType: 'MenuItemVariant',
      entityId: variant.id,
      newState: variant,
    });

    return variant;
  }
}
