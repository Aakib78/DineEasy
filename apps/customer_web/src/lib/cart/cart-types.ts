/** One line in the client-side cart — see docs/qr-ordering.md: "The cart itself lives
 *  client-side ... until 'Place order'." Nothing here is persisted server-side until then. */
export interface CartLine {
  /** Client-generated id (lib/id.ts's generateId — not crypto.randomUUID directly, see that
   *  file's doc comment) so two lines for the same item+variant+modifiers combination (e.g.
   *  added at different times, maybe with different notes) stay distinct rather than silently
   *  merging. */
  lineId: string;
  menuItemId: string;
  menuItemName: string;
  variantId?: string;
  variantName?: string;
  /** Snapshot at add-to-cart time, purely for display/estimate — the server is always the
   *  authority on price (see priceEstimate.ts's doc comment). */
  unitPrice: string;
  quantity: number;
  notes?: string;
  modifierIds: string[];
  modifierSummaries: { id: string; name: string; priceDelta: string }[];
}
