/** Mirrors the shapes returned by `MenuService.getPublicTree`
 * (`services/api/src/modules/menu/menu.service.ts`), served to guests via
 * `GET /qr/menu` (`QrController`). */

export interface Modifier {
  id: string;
  name: string;
  /** Decimal, serialized as a string by the API — see docs/database.md on why money is never a float. */
  priceDelta: string;
  isActive: boolean;
  displayOrder: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  modifiers: Modifier[];
}

/** The join-row shape from `MenuItem.modifierGroups` — the group itself is nested under `modifierGroup`. */
export interface MenuItemModifierGroupLink {
  id: string;
  displayOrder: number;
  modifierGroup: ModifierGroup;
}

export interface MenuItemVariant {
  id: string;
  name: string;
  priceOverride: string;
  isDefault: boolean;
  displayOrder: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePrice: string;
  isVegetarian: boolean;
  isAvailable: boolean;
  variants: MenuItemVariant[];
  modifierGroups: MenuItemModifierGroupLink[];
}

export interface MenuCategory {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  items: MenuItem[];
}
