import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PrintersService } from './printers.service';
import { CreatePrinterDto } from './dto/create-printer.dto';
import { EnqueuePrintJobDto } from './dto/enqueue-print-job.dto';
import { UpdatePrintJobStatusDto } from './dto/update-print-job-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/rbac/permissions.catalog';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { requireActiveOutlet } from '../../common/utils/require-active-outlet.util';

@Controller('printers')
@RequirePermission(PERMISSIONS.PRINTERS_MANAGE)
export class PrintersController {
  constructor(private readonly printersService: PrintersService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePrinterDto) {
    return this.printersService.createPrinter(
      user.organizationId,
      requireActiveOutlet(user),
      dto,
      user.userId,
    );
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.printersService.listPrinters(requireActiveOutlet(user));
  }

  @Post(':id/jobs')
  enqueueJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: EnqueuePrintJobDto,
  ) {
    return this.printersService.enqueueJob(requireActiveOutlet(user), id, dto);
  }

  @Get(':id/jobs')
  listJobs(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.printersService.listJobs(requireActiveOutlet(user), id);
  }

  /** Polled by the LAN print agent — see PrintersService's doc comment. */
  @Get(':id/jobs/next')
  nextJob(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.printersService.nextQueuedJob(requireActiveOutlet(user), id);
  }

  @Patch('jobs/:jobId/status')
  updateJobStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
    @Body() dto: UpdatePrintJobStatusDto,
  ) {
    return this.printersService.updateJobStatus(requireActiveOutlet(user), jobId, dto);
  }

  /** Staff-initiated, distinct from `updateJobStatus` above (which is the print agent's own
   * report-back channel) — see `PrintersService.retryJob`'s doc comment. */
  @Post('jobs/:jobId/retry')
  retryJob(@CurrentUser() user: AuthenticatedUser, @Param('jobId') jobId: string) {
    return this.printersService.retryJob(
      user.organizationId,
      requireActiveOutlet(user),
      jobId,
      user.userId,
    );
  }
}
