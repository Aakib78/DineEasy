/// Data models for the `printers.manage`-gated `/printers` endpoints
/// (`services/api/src/modules/printers/printers.controller.ts` — note the whole controller,
/// including `list()`, requires `printers.manage`; there's no separate view-only permission for
/// this resource, unlike staff/`staff.view` vs `staff.manage`). Mirrors
/// `packages/shared_types/src/printers.ts`'s `Printer` shape and
/// `apps/pos_web/src/features/printers/PrintersScreen.tsx`'s feature set — this is that same
/// screen, ported into the Flutter app's Settings destination (see docs/architecture.md §15,
/// "Flutter's Settings nav destination is still a placeholder").
library;

enum PrinterType { kitchen, receipt }

enum PrinterConnectionType { network, usb }

PrinterType _typeFromJson(String raw) => switch (raw) {
      'KITCHEN' => PrinterType.kitchen,
      'RECEIPT' => PrinterType.receipt,
      _ => throw ArgumentError('Unknown printer type: $raw'),
    };

String printerTypeToJson(PrinterType type) => switch (type) {
      PrinterType.kitchen => 'KITCHEN',
      PrinterType.receipt => 'RECEIPT',
    };

PrinterConnectionType _connectionTypeFromJson(String raw) => switch (raw) {
      'NETWORK' => PrinterConnectionType.network,
      'USB' => PrinterConnectionType.usb,
      _ => throw ArgumentError('Unknown printer connection type: $raw'),
    };

String printerConnectionTypeToJson(PrinterConnectionType type) => switch (type) {
      PrinterConnectionType.network => 'NETWORK',
      PrinterConnectionType.usb => 'USB',
    };

class Printer {
  const Printer({
    required this.id,
    required this.name,
    required this.type,
    required this.connectionType,
    required this.ipAddress,
    required this.port,
    required this.isActive,
  });

  factory Printer.fromJson(Map<String, dynamic> json) {
    return Printer(
      id: json['id'] as String,
      name: json['name'] as String,
      type: _typeFromJson(json['type'] as String),
      // Backend default is 'NETWORK' when omitted at creation (see CreatePrinterDto), but every
      // row returned by the API always has a concrete value — this parses defensively anyway
      // rather than assuming, since a null here would otherwise throw deep in a switch below.
      connectionType: _connectionTypeFromJson(json['connectionType'] as String? ?? 'NETWORK'),
      ipAddress: json['ipAddress'] as String?,
      port: json['port'] as int?,
      isActive: json['isActive'] as bool? ?? true,
    );
  }

  final String id;
  final String name;
  final PrinterType type;
  final PrinterConnectionType connectionType;
  final String? ipAddress;
  final int? port;
  final bool isActive;
}

/// `QUEUED` -> `SENT` (success) or `FAILED` is the whole lifecycle in practice — `ACKED` is a
/// reserved schema value nothing sets today. A job only becomes terminally `FAILED` after 3 send
/// attempts (`PrintersService.updateJobStatus`'s retry logic on the backend) — one that failed
/// once and got requeued shows back up as `QUEUED` with `attempts > 0` and `lastError` still
/// populated, not as `FAILED`. See `PrinterJob`'s doc comment below.
enum PrinterJobStatus { queued, sent, failed, acked }

PrinterJobStatus _jobStatusFromJson(String raw) => switch (raw) {
      'QUEUED' => PrinterJobStatus.queued,
      'SENT' => PrinterJobStatus.sent,
      'FAILED' => PrinterJobStatus.failed,
      'ACKED' => PrinterJobStatus.acked,
      _ => PrinterJobStatus.queued,
    };

/// One row per print attempt, from `GET /printers/:id/jobs` (`PrintersService.listJobs`) — the
/// last 50 for one printer, newest first, no pagination/status filter on this endpoint today.
/// Mirrors `packages/shared_types/src/printers.ts`'s `PrinterJob`; see that file's doc comment
/// for the full detail on why `payload` is untyped and what it defensively can/can't be assumed
/// to contain (`orderNumber` reliably, `kotNumber`/`invoiceNumber` depending on job kind).
class PrinterJob {
  const PrinterJob({
    required this.id,
    required this.status,
    required this.attempts,
    required this.lastError,
    required this.payload,
    required this.createdAt,
  });

  factory PrinterJob.fromJson(Map<String, dynamic> json) => PrinterJob(
        id: json['id'] as String,
        status: _jobStatusFromJson(json['status'] as String? ?? 'QUEUED'),
        attempts: json['attempts'] as int? ?? 0,
        lastError: json['lastError'] as String?,
        payload: (json['payload'] as Map<String, dynamic>?) ?? const {},
        createdAt: DateTime.parse(json['createdAt'] as String),
      );

  final String id;
  final PrinterJobStatus status;
  final int attempts;
  final String? lastError;
  final Map<String, dynamic> payload;
  final DateTime createdAt;
}
