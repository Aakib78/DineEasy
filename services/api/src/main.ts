import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { PrismaService } from './infrastructure/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);

  app.use(helmet());
  app.enableCors({
    origin: config.get<string[]>('app.corsOrigins')?.length
      ? config.get<string[]>('app.corsOrigins')
      : true,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1', {
    // /api/v1/system/health and /version stay reachable without the prefix confusion, and
    // Socket.IO's own /socket.io path is left alone once the realtime gateway is added.
    exclude: [],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // OpenAPI/Swagger docs — see docs/architecture.md §13 for why this exists: it's the intended
  // source of truth `packages/shared_types` should eventually be generated from (today those
  // types are hand-written, since actually running this bootstrap step needs a working
  // `@prisma/client`, and `prisma generate` can't fetch its engine binaries in every environment
  // — see docs/troubleshooting.md). `SwaggerModule.setup`'s path is literal, not affected by
  // `setGlobalPrefix` above, so this lands at exactly `/api/docs` (UI) and `/api/docs-json`
  // (the raw spec `openapi-typescript`-style tooling would consume), not `/api/v1/api/docs`.
  if (config.get<boolean>('app.apiDocsEnabled')) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('DineEasy API')
        .setDescription(
          'Restaurant operating system API — staff/POS endpoints (JWT bearer auth) and the ' +
            'no-signup QR customer endpoints (dining-session bearer auth, see GuestTokenService) ' +
            'share this one spec since they largely share the same underlying domain models.',
        )
        .setVersion(config.get<string>('app.version') ?? '0.1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'staff-jwt')
        .addBearerAuth(
          { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          'guest-dining-session-token',
        )
        .addTag('auth')
        .addTag('qr', 'No-signup customer QR entry point')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  const port = config.get<number>('app.port') ?? 3000;
  const host = config.get<string>('app.host') ?? '0.0.0.0';
  await app.listen(port, host);

  app.get(Logger).log(`DineEasy API listening on http://${host}:${port}/api/v1`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
