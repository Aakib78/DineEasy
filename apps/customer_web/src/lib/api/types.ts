/**
 * Mirrors the shapes returned by QrController/OrdersGuestController
 * (services/api/src/modules/qr, services/api/src/modules/orders). Kept as plain hand-written
 * types rather than a shared codegen pipeline for now — see docs/architecture.md §13, the same
 * gap noted for the Flutter app's RBAC mirror in docs/flutter-app.md.
 */

export interface ResolveQrResponse {
  sessionToken: string;
  diningSessionId: string;
  guestToken: string;
  table: { id: string; name: string; floorName: string };
  outletName: string;
}

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

export type OrderStatus =
  | 'DRAFT'
  | 'PLACED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'BILLED'
  | 'PAID'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface OrderItemModifierSummary {
  id: string;
  modifierId: string;
  nameSnapshot: string;
  priceDeltaSnapshot: string;
  quantity: number;
}

export interface OrderItemSummary {
  id: string;
  menuItemId: string;
  nameSnapshot: string;
  variantNameSnapshot: string | null;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  isCancelled: boolean;
  notes: string | null;
  modifiers: OrderItemModifierSummary[];
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  type: 'DINE_IN' | 'TAKEAWAY';
  diningSessionId: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  serviceChargeTotal: string;
  roundOff: string;
  total: string;
  notes: string | null;
  items: OrderItemSummary[];
  createdAt: string;
  updatedAt: string;
}
