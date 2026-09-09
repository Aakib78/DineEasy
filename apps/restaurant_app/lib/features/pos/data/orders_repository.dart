import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'pos_cart_line.dart';
import 'pos_models.dart';

class OrdersRepository {
  OrdersRepository(this._apiClient);

  final ApiClient _apiClient;

  /// The POS terminal's "active orders" board — used here just to find whether a table already
  /// has an open order before starting a new one (see OrderEntryScreen). `source` is never
  /// client-supplied — see CreateStaffOrderDto's doc comment on the backend.
  Future<List<Order>> listActive() async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>('/orders');
      return (response.data ?? const [])
          .map((o) => Order.fromJson(o as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// Today's already-COMPLETED orders (backend: `GET /orders/completed`,
  /// `OrdersService.listCompletedForOutlet`) — the other half of `listActive`'s exclusion of
  /// COMPLETED. Closes a real gap: once an order settles to COMPLETED it drops off the active
  /// board, and until this existed there was no way back to its detail screen to reprint a
  /// receipt if staff navigated away right after taking payment. See `billing_screen.dart` and
  /// docs/printing.md.
  Future<List<Order>> listCompleted() async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>('/orders/completed');
      return (response.data ?? const [])
          .map((o) => Order.fromJson(o as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<Order> getById(String orderId) async {
    try {
      final response = await _apiClient.dio.get<Map<String, dynamic>>('/orders/$orderId');
      return Order.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<Order> createOrder({
    required String type, // 'DINE_IN' | 'TAKEAWAY'
    String? tableId,
    required List<PosCartLine> items,
    String? notes,
  }) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/orders',
        data: {
          'source': 'POS',
          'type': type,
          if (tableId != null) 'tableId': tableId,
          if (notes != null && notes.isNotEmpty) 'notes': notes,
          'items': items.map((l) => l.toOrderItemJson()).toList(),
        },
      );
      return Order.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<Order> addItems(String orderId, List<PosCartLine> items) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/orders/$orderId/items',
        data: {'items': items.map((l) => l.toOrderItemJson()).toList()},
      );
      return Order.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// READY -> SERVED (backend: `POST /orders/:id/serve`, `orders.update`). The kitchen marking
  /// every item done only gets an order to READY — the kitchen has no way to know when a
  /// waiter has actually carried the food to the table, so this is a deliberate, separate
  /// staff action rather than something auto-derived from kitchen-item status. Until this is
  /// called, the order stays "open" (Billing won't offer it — see billing_screen.dart's doc
  /// comment) even after every kitchen item shows Done.
  Future<Order> serve(String orderId) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>('/orders/$orderId/serve');
      return Order.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
