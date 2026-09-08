import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

/**
 * Not `@Global()` (unlike `RealtimeModule`) — matches `AuditModule`'s shape: a domain module
 * that wants to create notifications imports this one explicitly and injects
 * `NotificationsService`, same as every existing consumer of `AuditLogService` already does
 * for audit entries. Explicit imports over global injection keep the dependency graph legible —
 * `grep -l NotificationsModule` tells you exactly which modules can create notifications.
 */
@Module({
  providers: [NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
