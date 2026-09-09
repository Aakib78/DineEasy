-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_menuItemVariantId_fkey";

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menuItemVariantId_fkey" FOREIGN KEY ("menuItemVariantId") REFERENCES "menu_item_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "notifications_recipient_lookup_idx" RENAME TO "notifications_organizationId_outletId_recipientUserId_readA_idx";
