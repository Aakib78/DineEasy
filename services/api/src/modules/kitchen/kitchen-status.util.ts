/**
 * Pure logic extracted out of `KitchenService.recomputeOrderStatus` specifically so it's
 * testable without a Prisma client — same reasoning as `orders/order-pricing.util.ts` and
 * `payments/payment-math.util.ts` (see those files' doc comments, and `docs/troubleshooting.md`
 * for why this sandbox can't run anything needing `@prisma/client`'s generated types). This is
 * the actual derivation spec §8 calls out by name — "the order status reflects what's actually
 * happening in the kitchen, not a separate staff-declared flag that can drift out of sync with
 * it" — so it's worth testing on its own merits, not only because it happens to be extractable.
 */

/**
 * What `KITCHEN_DRIVEN_PATH` should be advanced to given every `KitchenOrderItem` status
 * currently under an order's KOT(s), or `null` if nothing about the order's own status should
 * change. Never returns a status *behind* where a kitchen-driven order already is — that's
 * `KitchenService.advanceOrderTo`'s job (it only moves forward along `KITCHEN_DRIVEN_PATH`,
 * comparing against the order's actual current status, which this function has no access to and
 * doesn't need: it only looks at item statuses).
 */
export function deriveKitchenDrivenOrderStatus(
  itemStatuses: string[],
): 'READY' | 'PREPARING' | null {
  const relevant = itemStatuses.filter((status) => status !== 'CANCELLED');
  // A ticket where every item was cancelled has nothing left to derive from — leave the order's
  // status alone rather than asserting it's "done" by an empty vacuous truth (`[].every(...)`
  // would otherwise return true here, which is correct-but-misleading: nothing actually
  // *finished*, everything was called off).
  if (relevant.length === 0) return null;

  const allDone = relevant.every((status) => status === 'READY' || status === 'COMPLETED');
  if (allDone) return 'READY';

  const anyStarted = relevant.some((status) => status !== 'NEW');
  if (anyStarted) return 'PREPARING';

  // Every relevant item is still NEW — nothing has happened yet, so there's nothing to advance.
  return null;
}
