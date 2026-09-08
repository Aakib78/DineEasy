-- Hand-authored (like the initial migration — see docs/troubleshooting.md for why: this
-- sandbox's `prisma migrate dev` can't fetch its schema-engine binary). Written to match
-- exactly what Prisma itself would generate from the `Notification` model added to
-- schema.prisma alongside this migration: same table/column/constraint naming convention as
-- 20260908000000_init/migration.sql (compare its audit_logs table, the closest analog).

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ORDER_READY');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "requiredPermission" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- Prisma's own auto-generated name for this one (every column concatenated) would run past
-- Postgres's 63-byte identifier limit, and Prisma's own collision-safe truncation can't be
-- replicated by hand with confidence — so this uses a shorter, deliberately-chosen name
-- instead. That's a cosmetic difference from what `prisma migrate dev` would print if it could
-- run here, not a functional one: nothing in the app or in Prisma's drift detection compares
-- index names, only that the columns/constraints they cover are correct.
CREATE INDEX "notifications_recipient_lookup_idx" ON "notifications"("organizationId", "outletId", "recipientUserId", "readAt");
CREATE INDEX "notifications_entityType_entityId_idx" ON "notifications"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
