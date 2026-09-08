import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotFoundDomainError } from '../../common/errors/domain-errors';
import { AuditLogService } from '../audit/audit-log.service';
import { CreatePrinterDto } from './dto/create-printer.dto';
import { EnqueuePrintJobDto } from './dto/enqueue-print-job.dto';
import { UpdatePrintJobStatusDto } from './dto/update-print-job-status.dto';

const MAX_ATTEMPTS = 3;

/**
 * The printer domain (spec §13) is deliberately a dumb job queue, not a driver: DineEasy's
 * backend never opens a raw socket to a receipt/KOT printer or constructs ESC/POS bytes
 * itself. A small print-agent process running on the restaurant's own LAN (out of scope for
 * this repo — see docs/printing.md) polls `nextQueuedJob` for its printer, renders the
 * opaque `payload` however its specific hardware needs, and reports back with
 * `updateJobStatus`. This keeps the backend hardware-independent — swapping a USB thermal
 * printer for a networked one, or adding a driver for a different vendor, never touches
 * OrdersModule/KitchenModule/BillingModule, which only ever call `enqueueJob`.
 */
@Injectable()
export class PrintersService {
  private readonly logger = new Logger(PrintersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async createPrinter(
    organizationId: string,
    outletId: string,
    dto: CreatePrinterDto,
    actorUserId: string,
  ) {
    const printer = await this.prisma.printer.create({
      data: {
        outletId,
        name: dto.name,
        type: dto.type,
        connectionType: dto.connectionType ?? 'NETWORK',
        ipAddress: dto.ipAddress,
        port: dto.port,
        stationId: dto.stationId,
      },
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'printer.created',
      entityType: 'Printer',
      entityId: printer.id,
      newState: printer,
    });

    return printer;
  }

  async listPrinters(outletId: string) {
    return this.prisma.printer.findMany({
      where: { outletId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async enqueueJob(outletId: string, printerId: string, dto: EnqueuePrintJobDto) {
    await this.getPrinterOrThrow(outletId, printerId);
    return this.prisma.printerJob.create({ data: { printerId, payload: dto.payload } });
  }

  /**
   * Called by OrdersService right after a KOT is created and by BillingService right after
   * an invoice is generated — best-effort, fire-and-forget from the caller's point of view
   * (an outlet with no printer configured yet, or a transient DB hiccup here, must never
   * block placing an order or generating a bill; see the class doc comment's "fail open"
   * philosophy, same as RedisService). v1 has no per-station routing (see
   * OrdersService.createKitchenOrder), so a KOT job goes to every active KITCHEN printer at
   * the outlet — fine for the common single-printer kitchen, a known simplification for a
   * multi-station one.
   */
  async enqueueForType(
    outletId: string,
    type: 'KITCHEN' | 'RECEIPT',
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const printers = await this.prisma.printer.findMany({
        where: { outletId, type, isActive: true },
      });
      await Promise.all(
        printers.map((p) => this.prisma.printerJob.create({ data: { printerId: p.id, payload } })),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to enqueue ${type} print job for outlet ${outletId} (degrading gracefully): ${(err as Error).message}`,
      );
    }
  }

  /** What a print agent polls — the oldest still-queued job for its printer, if any. */
  async nextQueuedJob(outletId: string, printerId: string) {
    await this.getPrinterOrThrow(outletId, printerId);
    return this.prisma.printerJob.findFirst({
      where: { printerId, status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listJobs(outletId: string, printerId: string) {
    await this.getPrinterOrThrow(outletId, printerId);
    return this.prisma.printerJob.findMany({
      where: { printerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Reported by the print agent. A FAILED job is automatically re-queued up to MAX_ATTEMPTS, then left FAILED for a human to notice. */
  async updateJobStatus(jobId: string, dto: UpdatePrintJobStatusDto) {
    const job = await this.prisma.printerJob.findFirst({ where: { id: jobId } });
    if (!job) throw new NotFoundDomainError('PrinterJob', jobId);

    if (dto.status === 'FAILED') {
      const attempts = job.attempts + 1;
      const willRetry = attempts < MAX_ATTEMPTS;
      await this.prisma.printerJob.updateMany({
        where: { id: jobId },
        data: { status: willRetry ? 'QUEUED' : 'FAILED', attempts, lastError: dto.error },
      });
    } else {
      await this.prisma.printerJob.updateMany({
        where: { id: jobId },
        data: { status: dto.status },
      });
    }

    return this.prisma.printerJob.findFirst({ where: { id: jobId } });
  }

  private async getPrinterOrThrow(outletId: string, id: string) {
    const printer = await this.prisma.printer.findFirst({ where: { outletId, id } });
    if (!printer) throw new NotFoundDomainError('Printer', id);
    return printer;
  }
}
