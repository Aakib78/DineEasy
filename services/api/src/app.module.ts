import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import configuration from './common/config/configuration';
import { validateEnv } from './common/config/env.validation';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { RolesModule } from './modules/roles/roles.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { OutletsModule } from './modules/outlets/outlets.module';
import { UsersModule } from './modules/users/users.module';
import { AuditModule } from './modules/audit/audit.module';
import { SystemModule } from './modules/system/system.module';
import { GuestAuthModule } from './common/guest-auth/guest-auth.module';
import { TaxModule } from './modules/tax/tax.module';
import { ModifiersModule } from './modules/modifiers/modifiers.module';
import { MenuModule } from './modules/menu/menu.module';
import { TablesModule } from './modules/tables/tables.module';
import { DiningSessionsModule } from './modules/dining-sessions/dining-sessions.module';
import { QrModule } from './modules/qr/qr.module';
import { DailyCounterModule } from './common/counters/daily-counter.module';
import { OrdersModule } from './modules/orders/orders.module';
import { KitchenModule } from './modules/kitchen/kitchen.module';
import { BillingModule } from './modules/billing/billing.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RealtimeModule } from './common/realtime/realtime.module';
import { PrintersModule } from './modules/printers/printers.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnv }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req) => (req.headers['x-request-id'] as string) ?? '',
        // Never log secrets/tokens (spec §45) — redact common sensitive headers/fields.
        redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password'],
        transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.RATE_LIMIT_TTL_SECONDS ?? '60', 10) * 1000,
        limit: parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10),
      },
    ]),
    PrismaModule,
    RedisModule,
    AuthModule,
    RolesModule,
    OrganizationsModule,
    OutletsModule,
    UsersModule,
    AuditModule,
    SystemModule,
    GuestAuthModule,
    RealtimeModule,
    TaxModule,
    ModifiersModule,
    MenuModule,
    TablesModule,
    DiningSessionsModule,
    QrModule,
    DailyCounterModule,
    OrdersModule,
    KitchenModule,
    BillingModule,
    PaymentsModule,
    PrintersModule,
    ReportsModule,
    NotificationsModule,
  ],
  providers: [
    // Guard order matters: JwtAuthGuard runs first (populates request.user or allows
    // @Public() routes through), then PermissionsGuard (reads request.user), then the
    // rate limiter. Nest runs APP_GUARD providers in registration order.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
