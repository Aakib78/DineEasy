import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'kds_models.dart';

class KitchenRepository {
  KitchenRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<KdsTicket>> listQueue({String? stationId}) async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>(
        '/kitchen/queue',
        queryParameters: stationId != null ? {'stationId': stationId} : null,
      );
      return (response.data ?? const [])
          .map((t) => KdsTicket.fromJson(t as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<List<KitchenStation>> listStations() async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>('/kitchen/stations');
      return (response.data ?? const [])
          .map((s) => KitchenStation.fromJson(s as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// `newStatus` must be a legal next step from the item's current status — enforced
  /// authoritatively by `assertKitchenItemTransition` on the backend; the KDS screen only
  /// ever offers the one legal next action per item, but a second staff member acting on the
  /// same ticket from another terminal a moment earlier can still make this 409/422, which
  /// surfaces as an ordinary `ApiException` for the screen to show.
  Future<void> updateItemStatus(String kitchenOrderItemId, KitchenItemStatus newStatus) async {
    try {
      await _apiClient.dio.patch<void>(
        '/kitchen/items/$kitchenOrderItemId/status',
        data: {'status': kitchenItemStatusToJson(newStatus)},
      );
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
