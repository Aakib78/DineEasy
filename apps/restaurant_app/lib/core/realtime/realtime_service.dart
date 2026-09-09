import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

/// Thin wrapper around a single Socket.IO connection to `RealtimeGateway`
/// (`services/api/src/common/realtime/realtime.gateway.ts`, docs/architecture.md §8). Every
/// event this emits is a content-free "something changed, go refetch" hint — exactly like
/// `apps/customer_web/src/lib/realtime/useOrderUpdates.ts` on the guest side — never
/// authoritative data on its own. One instance is shared for the whole authenticated app
/// session (see `realtimeServiceProvider` in `realtime_providers.dart`, connected/disconnected
/// from `HomeShell`) rather than each screen opening its own socket.
///
/// Deliberately NOT a replacement for the existing `Timer.periodic` polling on the KDS board
/// (`kds_screen.dart`) and the notifications badge (`home_shell.dart`) — this is a fast-path
/// layered on top of it, not instead of it. If the socket never connects at all (a captive
/// portal, a proxy blocking WebSocket upgrades, the server mid-restart when a screen first
/// mounts), those polling loops are what keep each screen eventually correct — exactly the
/// same "hint, never authoritative" property `RealtimeGateway`'s own doc comment describes: a
/// missed or out-of-order event here can never leave a screen showing stale-but-confident data,
/// only a slightly-later-than-ideal refresh via the poll that's still running underneath it.
class RealtimeService {
  final _orderUpdated = StreamController<void>.broadcast();
  final _tableUpdated = StreamController<void>.broadcast();
  final _kitchenQueueUpdated = StreamController<void>.broadcast();
  final _notificationCreated = StreamController<void>.broadcast();

  io.Socket? _socket;
  String? _connectedForToken;

  /// `order.updated` — an order's status or contents changed (create, add items, cancel item,
  /// any status transition including billing/payment). Consumers should refetch whatever order
  /// list/detail they're showing; the payload (an order id) is deliberately ignored here since
  /// every current consumer just wants "go refetch," not a targeted diff.
  Stream<void> get orderUpdated => _orderUpdated.stream;

  /// `table.updated` — a table's occupancy state changed (a dining session opened or closed).
  Stream<void> get tableUpdated => _tableUpdated.stream;

  /// `kitchen.queue_updated` — the KDS board's ticket set changed (new items sent, an order
  /// cancelled outright).
  Stream<void> get kitchenQueueUpdated => _kitchenQueueUpdated.stream;

  /// `notification.created` — a new row exists in this outlet's Notification list.
  Stream<void> get notificationCreated => _notificationCreated.stream;

  /// `apiBaseUrl` is the REST base (e.g. `http://192.168.1.49:3000/api/v1` — see
  /// `AppConfig.apiBaseUrl`); `RealtimeGateway` is mounted on the same NestJS server at Socket.IO's
  /// default path, so this strips the `/api/v1` REST prefix to get its bare origin (mirrors
  /// `apps/customer_web/src/lib/realtime/useOrderUpdates.ts`'s `wsOrigin` derivation). No-ops if
  /// already connected with this exact token — callers can call this freely on every auth-state
  /// rebuild without tearing down and reopening a perfectly good connection each time.
  void connect({required String apiBaseUrl, required String accessToken}) {
    if (_socket != null && _connectedForToken == accessToken) return;
    disconnect();

    final origin = apiBaseUrl.replaceFirst(RegExp(r'/api/v1/?$'), '');
    final socket = io.io(
      origin,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': accessToken})
          .enableReconnection()
          .build(),
    );

    socket.on('order.updated', (_) => _orderUpdated.add(null));
    socket.on('table.updated', (_) => _tableUpdated.add(null));
    socket.on('kitchen.queue_updated', (_) => _kitchenQueueUpdated.add(null));
    socket.on('notification.created', (_) => _notificationCreated.add(null));

    _socket = socket;
    _connectedForToken = accessToken;
  }

  /// Called on logout — an authenticated socket must not outlive the session that opened it.
  void disconnect() {
    _socket?.dispose();
    _socket = null;
    _connectedForToken = null;
  }

  void dispose() {
    disconnect();
    _orderUpdated.close();
    _tableUpdated.close();
    _kitchenQueueUpdated.close();
    _notificationCreated.close();
  }
}
