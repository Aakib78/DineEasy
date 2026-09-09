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
