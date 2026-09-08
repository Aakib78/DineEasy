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
}
