import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Onboarding step 1 of the spec §68 acceptance flow: "Restaurant owner creates account" +
 * "Creates restaurant". Deliberately does NOT create an outlet here — that's a separate,
 * explicit step (POST /api/v1/outlets) matching the spec's flow, so a single organization
 * can be onboarded before any outlet exists yet.
 */
export class RegisterOrganizationDto {
  @IsString()
  @MinLength(2)
  organizationName!: string;

  @IsString()
  @MinLength(2)
  ownerName!: string;

  @IsEmail()
  ownerEmail!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
