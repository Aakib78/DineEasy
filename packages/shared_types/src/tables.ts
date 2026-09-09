/** Mirrors `TablesController`/`TablesService`'s response shapes
 * (`services/api/src/modules/tables`) — the staff-facing floor/table management + POS floor
 * view. Same shape `apps/restaurant_app/lib/features/pos/data/pos_models.dart` hand-mirrors on
 * the Dart side. */

export interface Floor {
  id: string;
  name: string;
  displayOrder: number;
}

export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'DISABLED';

/** `RestaurantTable.qrCode` — a table has exactly one (`tableId` is `@unique` in schema.prisma). */
export interface TableQrCode {
  token: string;
  isActive: boolean;
}

export interface RestaurantTable {
  id: string;
  floorId: string;
  name: string;
  capacity: number;
  displayOrder: number;
  status: TableStatus;
  /** `TablesService.TABLE_INCLUDE` only ever returns the current OPEN dining session, if any —
   * a non-empty array is "occupied by an open session right now," used by the POS floor view
   * to render occupancy at a glance (see that service's doc comment on the backend). */
  diningSessions: { id: string }[];
  qrCode: TableQrCode | null;
}
