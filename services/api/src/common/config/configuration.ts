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
    // On by default outside production (a LAN-only restaurant deployment isn't public-internet-
    // facing, so exposing /api/docs is low-risk day to day), but an explicit API_DOCS_ENABLED
    // always wins either way — set it to 'false' to turn the docs UI off anywhere, or 'true' to
    // turn it on in production too, without touching NODE_ENV.
    apiDocsEnabled:
      process.env.API_DOCS_ENABLED !== undefined
        ? process.env.API_DOCS_ENABLED === 'true'
        : process.env.NODE_ENV !== 'production',
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
