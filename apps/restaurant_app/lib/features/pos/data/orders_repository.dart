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

  /// COMPLETED orders for one calendar day (backend: `GET /orders/completed?date=...`,
  /// `OrdersService.listCompletedForOutlet`) — the other half of `listActive`'s exclusion of
  /// COMPLETED. Closes a real gap: once an order settles to COMPLETED it drops off the active
  /// board, and until this existed there was no way back to its detail screen to reprint a
  /// receipt if staff navigated away right after taking payment. See `billing_screen.dart` and
  /// docs/printing.md.
  ///
  /// `date` is omitted for "today" (server default) or sent as a bare `"YYYY-MM-DD"` — NOT
  /// `DateTime.toIso8601String()`. That was the original (buggy) approach: `date` here is a
  /// *local* `DateTime` (`DateTime(y, m, d)` defaults to local time), so its ISO string has no
  /// `Z`/offset suffix, and a date-*time* string with no offset is parsed by JS's `new Date(...)`
  /// as local time **in whatever timezone the server process runs in** — not the user's device
  /// timezone, and not UTC. The backend's `startOfDay()` then extracts UTC year/month/day from
  /// that misinterpreted instant, silently shifting the requested day (by a few hours or a full
  /// day, depending on the server's local offset) — which is exactly why "today"'s completed
  /// orders could go missing. A bare date-only string like `"2026-09-09"` has no such ambiguity:
  /// per the ECMAScript spec, `new Date("2026-09-09")` is always UTC, matching `startOfDay`'s own
  /// UTC-based day math exactly. `apps/pos_web`'s `<input type="date">` already sent this same
  /// bare form and never had the bug — this makes the two clients consistent.
  Future<List<Order>> listCompleted({DateTime? date}) async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>(
        '/orders/completed',
        queryParameters: date != null ? {'date': _isoDate(date)} : null,
      );
      return (response.data ?? const [])
          .map((o) => Order.fromJson(o as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  static String _isoDate(DateTime date) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${date.year.toString().padLeft(4, '0')}-${two(date.month)}-${two(date.day)}';
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

  /// `orders.discount`-gated (Owner/Manager only). Only allowed while the order isn't yet
  /// financially settled (not PAID/COMPLETED/CANCELLED/REFUNDED — BILLED is fine), and only once
  /// per order — the backend has no "remove/replace discount" endpoint, so a discount is
  /// permanent once applied (`OrdersService.applyDiscount`'s doc comment on the backend). Returns
  /// the full, re-fetched order — server-recomputed totals, never trust a client-side calc.
  Future<Order> applyDiscount(
    String orderId, {
    required String type, // 'PERCENTAGE' | 'FIXED'
    required num value,
    String? reason,
  }) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/orders/$orderId/discount',
        data: {'type': type, 'value': value, if (reason != null && reason.isNotEmpty) 'reason': reason},
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

  /// PLACED -> ACCEPTED (backend: `POST /orders/:id/accept`, `orders.update`) — front-of-house
  /// acknowledgment that a newly placed order (staff- or QR-guest-sourced) has been seen and is
  /// legitimate. Every order already has a KOT and sits in the kitchen queue the moment it's
  /// PLACED, so this doesn't gate the kitchen seeing it; it's most meaningful for a QR order
  /// nobody at the restaurant has looked at yet. Also happens implicitly the moment the kitchen
  /// starts any item on a still-PLACED order — see `OrdersService.acceptOrder`'s doc comment on
  /// the backend for the full detail — so calling this explicitly only matters for an order
  /// nobody's started cooking yet.
  Future<Order> accept(String orderId) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>('/orders/$orderId/accept');
      return Order.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// `orders.cancel`-gated (Owner/Manager only — Waiter/Cashier can build and update an order
  /// but not void one). Blocked once the order is BILLED+settled (the bill already reflects the
  /// item) — see `OrdersService.cancelItem`'s doc comment for why that's a stricter cutoff than
  /// [cancel] below. Returns the full, re-fetched order.
  Future<Order> cancelItem(String orderId, String itemId) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/orders/$orderId/items/$itemId/cancel',
      );
      return Order.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// `orders.cancel`-gated. Legal from any pre-payment status (CANCELLED is reachable from
  /// everything except PAID/COMPLETED, which can only be REFUNDED once money has moved — see
  /// `order-state-machine.ts` on the backend); the backend 400s otherwise. `reason` is optional
  /// and only for the audit trail.
  Future<Order> cancel(String orderId, {String? reason}) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/orders/$orderId/cancel',
        data: reason != null && reason.isNotEmpty ? {'reason': reason} : null,
      );
      return Order.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
