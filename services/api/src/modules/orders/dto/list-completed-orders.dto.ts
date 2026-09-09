import { IsISO8601, IsOptional } from 'class-validator';

/**
 * `date` is a single calendar day (e.g. "2026-09-09"), not a datetime range — the Billing
 * screens' "Completed" tab filters one day at a time via a date picker, unlike the Reports
 * module's `from`/`to` range (`ReportRangeDto`). Missing `date` defaults to today — see
 * `OrdersService.listCompletedForOutlet`.
 */
export class ListCompletedOrdersDto {
  @IsOptional()
  @IsISO8601()
  date?: string;
}
