import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'pos_models.dart';

class MenuRepository {
  MenuRepository(this._apiClient);

  final ApiClient _apiClient;

  /// `GET /menu` — the staff full tree (includes unavailable/inactive items, unlike the QR
  /// guest tree — see MenuService.getFullTree on the backend), so POS staff can still see (and
  /// re-enable) an item a diner wouldn't be offered.
  Future<List<MenuCategory>> getFullTree() async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>('/menu');
      return (response.data ?? const [])
          .map((c) => MenuCategory.fromJson(c as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
