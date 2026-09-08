import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'pos_models.dart';

class TablesRepository {
  TablesRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<Floor>> listFloors() async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>('/floors');
      return (response.data ?? const [])
          .map((f) => Floor.fromJson(f as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<Floor> createFloor({required String name, int? displayOrder}) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/floors',
        data: {'name': name, if (displayOrder != null) 'displayOrder': displayOrder},
      );
      return Floor.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<List<RestaurantTable>> listTables() async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>('/tables');
      return (response.data ?? const [])
          .map((t) => RestaurantTable.fromJson(t as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<RestaurantTable> createTable({
    required String floorId,
    required String name,
    int? capacity,
    int? displayOrder,
  }) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/tables',
        data: {
          'floorId': floorId,
          'name': name,
          if (capacity != null) 'capacity': capacity,
          if (displayOrder != null) 'displayOrder': displayOrder,
        },
      );
      return RestaurantTable.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// Partial update — only the fields passed are sent, matching `UpdateTableDto`'s all-optional
  /// shape on the backend. `status` is a manual staff override (see `RestaurantTable`'s doc
  /// comment on the backend: it is not kept in lockstep with whether an order actually exists).
  Future<RestaurantTable> updateTable(
    String tableId, {
    String? name,
    int? capacity,
    int? displayOrder,
    TableStatus? status,
  }) async {
    try {
      final response = await _apiClient.dio.patch<Map<String, dynamic>>(
        '/tables/$tableId',
        data: {
          if (name != null) 'name': name,
          if (capacity != null) 'capacity': capacity,
          if (displayOrder != null) 'displayOrder': displayOrder,
          if (status != null) 'status': tableStatusToJson(status),
        },
      );
      return RestaurantTable.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// Rotates the table's QR token — any dining session already open on the table is unaffected
  /// (see TablesService.regenerateQrCode's doc comment on the backend). Returns only the new
  /// `TableQrCode` row, not the whole table, so callers that need the table's other fields
  /// unchanged should keep using their existing `RestaurantTable` and just merge `qrCode`.
  Future<TableQrCode> regenerateQrCode(String tableId) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/tables/$tableId/qr/regenerate',
      );
      return TableQrCode.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
