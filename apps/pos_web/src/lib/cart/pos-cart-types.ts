/** One line in the POS's in-memory cart — the web equivalent of
 * `apps/restaurant_app/lib/features/pos/data/pos_cart_line.dart`'s `PosCartLine`, itself the
 * staff-side counterpart of the guest PWA's `CartLine` (`apps/customer_web/src/lib/cart/cart-types.ts`).
 * Nothing here is persisted — a POS terminal stays open through a shift, so unlike the guest
 * app there's no reload-survival need, and a half-built order accidentally surviving a reload
 * would be more confusing than helpful for staff (they'd rather just re-add the items). */
export interface PosCartLine {
  /** Client-generated id (`generateId` from `@dineeasy/shared-types`) — never sent to the
   * server, just enough to target quantity/remove actions on the right line. */
  lineId: string;
  menuItemId: string;
  menuItemName: string;
  variantId?: string;
  variantName?: string;
  /** Decimal string — display estimate only, see `price.ts`'s doc comment. */
  unitPrice: string;
  quantity: number;
  notes?: string;
  modifierIds: string[];
  modifierSummaries: { id: string; name: string; priceDelta: string }[];
}
