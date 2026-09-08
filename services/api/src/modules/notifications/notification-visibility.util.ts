/**
 * Pure logic extracted out of `NotificationsService` specifically so it's testable without a
 * Prisma client — same reasoning as `orders/order-pricing.util.ts` and
 * `reports/reports.service.ts`'s `resolveRange`/`startOfDay`: this sandbox can't run anything
 * that needs `@prisma/client`'s generated types (`docs/troubleshooting.md`), but a function that
 * only ever builds and returns a plain object has no such dependency, so it can be — and is —
 * actually unit tested here (see notification-visibility.util.spec.ts).
 */

interface VisibilityUser {
  userId: string;
  permissions: string[];
}

/**
 * What `NotificationsService.listForUser`/`unreadCount`/`markRead` all filter by: a
 * notification is visible to `user` if it's addressed to them by name, or if it's an
 * outlet-wide broadcast (`recipientUserId` null) whose `requiredPermission` they hold — a null
 * `requiredPermission` on a broadcast means everyone at the outlet, regardless of role. See
 * the `Notification` Prisma model's doc comment for the full field-level reasoning.
 */
export function buildNotificationVisibilityWhere(
  organizationId: string,
  outletId: string,
  user: VisibilityUser,
) {
  return {
    organizationId,
    outletId,
    OR: [
      { recipientUserId: user.userId },
      {
        recipientUserId: null,
        OR: [{ requiredPermission: null }, { requiredPermission: { in: user.permissions } }],
      },
    ],
  };
}
