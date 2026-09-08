export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  app: {
    name: process.env.APP_NAME ?? 'DineEasy',
    version: process.env.APP_VERSION ?? '0.1.0',
    port: parseInt(process.env.API_PORT ?? '3000', 10),
    host: process.env.API_HOST ?? '0.0.0.0',
    corsOrigins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  locale: {
    timezone: process.env.TZ ?? 'Asia/Kolkata',
    locale: process.env.DEFAULT_LOCALE ?? 'en-IN',
    currency: process.env.DEFAULT_CURRENCY ?? 'INR',
    country: process.env.DEFAULT_COUNTRY ?? 'IN',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12', 10),
  },
  qr: {
    tokenSecret: process.env.QR_TOKEN_SECRET,
  },
  rateLimit: {
    ttlSeconds: parseInt(process.env.RATE_LIMIT_TTL_SECONDS ?? '60', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
});
