import { IsISO8601, IsOptional } from 'class-validator';

/**
 * Query params shared by every report endpoint. Missing `from`/`to` defaults to "today" in
 * the service layer — a manager opening the reports screen with no filters wants today's
 * numbers, not an unbounded all-time scan.
 */
export class ReportRangeDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
