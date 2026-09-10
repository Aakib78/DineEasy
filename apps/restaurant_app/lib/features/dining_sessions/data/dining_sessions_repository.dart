import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'dining_session_models.dart';

/// `GET /dining-sessions`/`GET /dining-sessions/:id` (`DiningSessionsController`), both
/// `tables.view`-gated — same permission `TablesManagementScreen` (this repository's only
/// consumer) is already shown behind, so anyone who can see that screen can call both.
class DiningSessionsRepository {
  DiningSessionsRepository(this._apiClient);

  final ApiClient _apiClient;

  /// Every currently-OPEN session at the signed-in user's active outlet — used to know which
  /// table has which session id, so a tap on an occupied table can jump straight to
  /// [getById]'s fuller detail without an intermediate picker.
  Future<List<DiningSession>> listOpen() async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>('/dining-sessions');
      return (response.data ?? const [])
          .map((s) => DiningSession.fromJson(s as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<DiningSession> getById(String sessionId) async {
    try {
      final response = await _apiClient.dio.get<Map<String, dynamic>>(
        '/dining-sessions/$sessionId',
      );
      return DiningSession.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
