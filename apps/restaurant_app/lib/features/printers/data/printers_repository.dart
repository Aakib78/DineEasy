import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'printers_models.dart';

class PrintersRepository {
  PrintersRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<Printer>> listPrinters() async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>('/printers');
      return (response.data ?? const [])
          .map((p) => Printer.fromJson(p as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// `ipAddress`/`port` only matter (and are only sent) for `NETWORK` — a `USB` printer is
  /// found by device class at send time (`services/print-agent/src/printer-usb.ts`), so this
  /// row never needs to identify one — see `docs/printing.md`'s USB section for why.
  Future<void> createPrinter({
    required String name,
    required PrinterType type,
    required PrinterConnectionType connectionType,
    String? ipAddress,
    int? port,
  }) async {
    try {
      await _apiClient.dio.post<void>(
        '/printers',
        data: {
          'name': name,
          'type': printerTypeToJson(type),
          'connectionType': printerConnectionTypeToJson(connectionType),
          if (connectionType == PrinterConnectionType.network && ipAddress != null)
            'ipAddress': ipAddress,
          if (connectionType == PrinterConnectionType.network && port != null) 'port': port,
        },
      );
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// Last 50 jobs for one printer, newest first — no pagination/status filter on this endpoint
  /// (`PrintersService.listJobs`). Backs the printer health/job-history screen; see
  /// `PrinterJob`'s doc comment for what's (not) reliably in `payload`.
  Future<List<PrinterJob>> listJobs(String printerId) async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>('/printers/$printerId/jobs');
      return (response.data ?? const [])
          .map((j) => PrinterJob.fromJson(j as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
