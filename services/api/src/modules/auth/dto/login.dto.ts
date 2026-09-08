import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  /** Free-text client label, e.g. "POS-Counter-1 / Android" — stored for session visibility. */
  @IsOptional()
  @IsString()
  deviceInfo?: string;
}
