import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

/**
 * Validates process.env at startup (spec §57: "Validate required environment variables at
 * startup"). If a required variable is missing/malformed, the app refuses to boot with a
 * clear error rather than failing confusingly later on first use.
 */
class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT!: number;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_ACCESS_TTL!: string;

  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  JWT_REFRESH_TTL!: string;

  @IsInt()
  @Min(4)
  @Max(31)
  BCRYPT_SALT_ROUNDS!: number;

  @IsString()
  QR_TOKEN_SECRET!: string;

  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  @IsOptional()
  @IsString()
  LOG_LEVEL?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(
      `Invalid/missing environment variables. Check your .env against .env.example:\n${details}`,
    );
  }

  return validated;
}
