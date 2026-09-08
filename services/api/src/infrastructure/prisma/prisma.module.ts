import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * @Global so every feature module can inject PrismaService without re-importing this module
 * everywhere — a deliberate, contained exception to normal module boundaries, matching how
 * most NestJS+Prisma projects structure the DB layer.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
