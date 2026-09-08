import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
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
