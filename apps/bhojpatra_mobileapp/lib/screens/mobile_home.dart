import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../models/session.dart';
import '../api/cloud_api.dart';
import '../api/order_sync.dart';
import '../storage/mobile_database.dart';
import '../storage/snapshot_cache.dart';
import '../utils/utils.dart';
import 'owner/overview_tab.dart';
import 'owner/owner_reports.dart';
import 'captain/captain_workspace.dart';
import 'kitchen/kitchen_workspace.dart';
import 'order_activity.dart';
import '../theme/bhojpatra_theme.dart';
import '../widgets/app_toast.dart';
import '../widgets/mobile_navigation.dart';

class MobileHome extends StatefulWidget {
  const MobileHome({
    super.key,
    required this.session,
    required this.onLogout,
    this.captainOnly = false,
    this.api,
    this.cache,
  });

  final SavedSession session;
  final VoidCallback onLogout;
  final bool captainOnly;
  final CloudApi? api;
  final SnapshotCache? cache;

  @override
  State<MobileHome> createState() => _MobileHomeState();
}

class _MobileHomeState extends State<MobileHome> with WidgetsBindingObserver {
  late final CloudApi _api;
  late final MobileOrderSync _orderSync;
  late final SnapshotCache _cache;
  bool _cacheReadStarted = false;
  String? _cacheProblem;
  Future<void> _cacheWrites = Future.value();
  DateTime? _latestRevision;
  String? _latestRevisionToken;
  WebSocketChannel? _socket;
  Map<String, dynamic> _snapshot = {};
  var _loading = true;
  var _syncing = false;
  String? _error;
  bool _connected = false;
  int _reconnectAttempt = 0;
  int _socketGeneration = 0;
  Timer? _reconnectTimer;
  Timer? _heartbeatTimer;
  Timer? _cloudSyncTimer;
  Timer? _syncRetryTimer;
  Timer? _lanPollTimer;
  bool _refreshing = false;
  int _stateGeneration = 0;
  int _syncRetryAttempt = 0;
  String? _lastUpdatedAt;
  String? _lastSyncAt;
  int _navIndex = 0;

  bool get _isOwner => isOwnerRole(widget.session.role);
  bool get _isKitchen =>
      !widget.captainOnly && widget.session.role == 'kitchen';
  bool get _isCloudMode => widget.session.mode.startsWith('cloud');
  String? _lastConnectionNotice;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _api = widget.api ?? CloudApi(widget.session);
    _cache = widget.cache ?? DatabaseSnapshotCache(mobileDatabase);
    _orderSync = MobileOrderSync(_api);
    _refresh(connect: true);
    if (!_isCloudMode) {
      // Poll as a fallback when Wi-Fi routers interrupt WebSockets. No cloud
      // traffic is generated in captain LAN mode.
      _lanPollTimer = Timer.periodic(
        const Duration(seconds: 10),
        (_) => _refresh(connect: !_connected),
      );
    }
    if (_isCloudMode) {
      _cloudSyncTimer = Timer.periodic(
        Duration(minutes: _isOwner ? 5 : 240),
        (_) => _refresh(),
      );
    }
  }

  @override
  void dispose() {
    _socketGeneration++;
    _reconnectTimer?.cancel();
    _heartbeatTimer?.cancel();
    _cloudSyncTimer?.cancel();
    _syncRetryTimer?.cancel();
    _lanPollTimer?.cancel();
    _api.dispose();
    _socket?.sink.close();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh(connect: true);
  }

  Future<void> _loadCache() async {
    try {
      final local = await _cache.load().timeout(const Duration(seconds: 2));
      if (mounted &&
          _snapshot.isEmpty &&
          local != null &&
          text(snapshotValue(local, 'outlet', 'id')) ==
              widget.session.outletId) {
        setState(() => _snapshot = local);
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _cacheProblem =
              'Offline cache unavailable. Live counter data still works.',
        );
      }
    }
  }

  void _cacheSnapshot(Map<String, dynamic> snapshot) {
    // Serialize cache writes, but never make rendering or LAN acknowledgments
    // wait for Android database initialization or a cache write.
    _cacheWrites = _cacheWrites.then((_) async {
      try {
        await _cache.save(snapshot).timeout(const Duration(seconds: 3));
        if (mounted && _cacheProblem != null) {
          setState(() => _cacheProblem = null);
        }
      } catch (_) {
        if (mounted) {
          setState(
            () => _cacheProblem =
                'Offline cache unavailable. Live counter data still works.',
          );
        }
      }
    });
  }

  bool _acceptSnapshot(Map<String, dynamic> snapshot, String? revision) {
    final date = DateTime.tryParse(revision ?? '');
    if (date != null &&
        _latestRevision != null &&
        date.isBefore(_latestRevision!)) {
      if (_latestRevisionToken != null) {
        _api.observeRevision(_latestRevisionToken!);
      }
      return false;
    }
    if (!mounted) return false;
    if (date != null) {
      _latestRevision = date;
      _latestRevisionToken = revision;
    }
    if (revision != null) _api.observeRevision(revision);
    setState(() {
      _snapshot = snapshot;
      _lastUpdatedAt = revision;
      _lastSyncAt = DateTime.now().toIso8601String();
      _error = null;
      _lastConnectionNotice = null;
    });
    _cacheSnapshot(snapshot);
    return true;
  }

  Future<void> _refresh({bool connect = false}) async {
    if (_refreshing || _syncing) return;
    _refreshing = true;
    final generation = _stateGeneration;
    setState(() {
      _syncing = true;
      _error = null;
    });
    try {
      Map<String, dynamic> state;
      if (!_cacheReadStarted) {
        _cacheReadStarted = true;
        unawaited(_loadCache());
      }
      state = _snapshot;
      if (_isCloudMode) {
        if (_isOwner || state.isEmpty) {
          // Owner refreshes always include expenses, stock and setup changes.
          state = await _api.fetchState();
        }
        // Owner reports are strictly read-only; a cached snapshot must never
        // become an upload/outbox that replaces newer counter data.
        if (!_isOwner) state = (await _orderSync.sync(state)).snapshot;
      } else {
        try {
          state = await _api.fetchState();
        } catch (_) {
          if (!await _api.rediscoverDesktop()) rethrow;
          state = await _api.fetchState();
          connect = true;
        }
        if (generation != _stateGeneration) return;
      }
      if (mounted && generation == _stateGeneration) {
        _acceptSnapshot(state, _api.stateRevision);
      }
      _syncRetryAttempt = 0;
      _syncRetryTimer?.cancel();
      if (mounted && connect) {
        _connectRealtime();
      }
    } catch (error) {
      if (_isCloudMode) {
        const retryMinutes = [1, 5, 15, 60];
        final delay =
            retryMinutes[_syncRetryAttempt.clamp(0, retryMinutes.length - 1)];
        _syncRetryAttempt++;
        _syncRetryTimer?.cancel();
        _syncRetryTimer = Timer(Duration(minutes: delay), () {
          if (mounted) _refresh();
        });
      }
      if (mounted) {
        final message = friendlyError(error);
        setState(() => _error = message);
        if (_lastConnectionNotice != message) {
          _lastConnectionNotice = message;
          appToast(context, message, error: true);
        }
      }
    } finally {
      _refreshing = false;
      if (mounted) {
        setState(() {
          _loading = false;
          _syncing = false;
        });
      }
    }
  }

  void _connectRealtime() {
    _reconnectTimer?.cancel();
    _heartbeatTimer?.cancel();
    final generation = ++_socketGeneration;
    _socket?.sink.close();
    try {
      _socket = _api.connectRealtime();
      setState(() => _connected = false);
      unawaited(
        _socket!.ready
            .then((_) {
              if (mounted && generation == _socketGeneration) {
                setState(() {
                  _connected = true;
                  _reconnectAttempt = 0;
                });
              }
            })
            .catchError((Object _) {
              if (mounted && generation == _socketGeneration) {
                setState(() => _connected = false);
              }
            }),
      );
      _socket!.stream.listen(
        (message) {
          if (generation != _socketGeneration || message is! String) return;
          if (message == 'pong') {
            if (mounted && !_connected) setState(() => _connected = true);
            return;
          }
          Map<String, dynamic> event;
          try {
            event = jsonDecode(message) as Map<String, dynamic>;
          } catch (_) {
            return;
          }
          final payload = event['payload'];
          final eventType = text(event['type']);
          final timestamp = text(
            event['timestamp'],
            fallback: DateTime.now().toIso8601String(),
          );
          if (!_connected && mounted) {
            setState(() {
              _connected = true;
              _reconnectAttempt = 0;
            });
          }
          if (payload is Map &&
              [
                'tables',
                'orders',
                'orderItems',
                'menuItems',
              ].every((key) => payload[key] is List) &&
              mounted) {
            final incoming = Map<String, dynamic>.from(
              payload.cast<String, dynamic>(),
            );
            if (text(snapshotValue(incoming, 'outlet', 'id')) !=
                widget.session.outletId) {
              return;
            }
            if (_acceptSnapshot(incoming, text(event['timestamp']))) {
              // Invalidate an HTTP poll that started before this live update.
              _stateGeneration++;
            }
          } else if (eventType == 'STATE_UPDATED' ||
              eventType == 'SYNC_DELTA_AVAILABLE') {
            _refresh();
          } else if (eventType == 'STAFF_UPDATED') {
            setState(() => _lastUpdatedAt = timestamp);
          }
        },
        onError: (_) {
          if (generation == _socketGeneration && mounted) {
            setState(() => _connected = false);
          }
        },
        onDone: () {
          if (generation != _socketGeneration) return;
          _heartbeatTimer?.cancel();
          if (mounted) {
            setState(() => _connected = false);
          }
          final delaySeconds = _reconnectAttempt >= 5
              ? 20
              : [2, 3, 5, 8, 13, 20][_reconnectAttempt];
          _reconnectAttempt = (_reconnectAttempt + 1).clamp(0, 5);
          _reconnectTimer = Timer(Duration(seconds: delaySeconds), () {
            if (mounted && generation == _socketGeneration) _connectRealtime();
          });
        },
      );
      _heartbeatTimer = Timer.periodic(const Duration(seconds: 15), (_) {
        if (!mounted || generation != _socketGeneration) return;
        try {
          _socket?.sink.add('ping');
        } catch (_) {}
      });
    } catch (_) {}
  }

  Future<void> _save(Map<String, dynamic> next) async {
    setState(() => _syncing = true);
    try {
      // Local commit and outbox creation happen before the network request.
      await mobileDatabase.saveSnapshot(next);
      if (mounted) setState(() => _snapshot = next);
      final accepted = _isCloudMode
          ? (await _orderSync.sync(next)).snapshot
          : await _api.saveState(next);
      if (mounted) {
        final now = DateTime.now().toIso8601String();
        setState(() {
          _snapshot = accepted;
          _lastSyncAt = now;
          _lastUpdatedAt = now;
        });
      }
    } on StateConflictException catch (error) {
      if (mounted) {
        setState(() {
          if (error.currentSnapshot != null) {
            _snapshot = error.currentSnapshot!;
          }
          _lastUpdatedAt = error.updatedAt.isEmpty
              ? DateTime.now().toIso8601String()
              : error.updatedAt;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Another device updated the restaurant. Latest data loaded; please retry your action.',
            ),
          ),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.toString().replaceFirst('Exception: ', '')),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  Future<Map<String, dynamic>> _captainCommand(
    Map<String, dynamic> command,
  ) async {
    if (_isCloudMode) {
      throw const CaptainCommandRejected(
        'Captain ordering requires the desktop LAN connection.',
      );
    }
    _stateGeneration++;
    setState(() => _syncing = true);
    try {
      final accepted = await _api.submitCaptainCommand(command);
      _acceptSnapshot(accepted, _api.stateRevision);
      if (mounted) {
        setState(() {
          _error = null;
          _connected = true;
          _lastSyncAt = DateTime.now().toIso8601String();
        });
      }
      return _snapshot;
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  Widget _account() => ListView(
    padding: const EdgeInsets.all(12),
    children: [
      Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              const BrandLogo(size: 48),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.session.userName,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      widget.session.role.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 10,
                        color: Brand.orange,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      widget.session.login,
                      style: const TextStyle(fontSize: 11, color: Brand.muted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 12),
      Card(
        child: Column(
          children: [
            ListTile(
              leading: const Icon(Icons.storefront_outlined),
              title: Text(
                text(
                  snapshotValue(_snapshot, 'outlet', 'name'),
                  fallback: 'Restaurant',
                ),
              ),
              subtitle: Text(
                _isCloudMode
                    ? 'Owner remote reports'
                    : 'Local Wi-Fi • internet not required',
              ),
            ),
            const Divider(),
            ListTile(
              leading: Icon(
                _error == null ? Icons.wifi : Icons.wifi_off,
                color: _error == null ? Brand.green : Colors.orange,
              ),
              title: Text(
                _error == null && _lastSyncAt != null
                    ? 'Connected to counter'
                    : _snapshot.isEmpty
                    ? 'Waiting for counter data'
                    : 'Offline · saved data',
              ),
              subtitle: Text(
                _api.serverUrl,
                style: const TextStyle(fontSize: 11),
              ),
              trailing: IconButton(
                tooltip: 'Reconnect',
                onPressed: _syncing ? null : () => _refresh(connect: true),
                icon: const Icon(Icons.refresh),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.schedule),
              title: const Text('Last refreshed'),
              subtitle: Text(
                (_lastSyncAt ?? _lastUpdatedAt) == null
                    ? 'Waiting for data'
                    : text(
                        DateTime.tryParse(
                          (_lastSyncAt ?? _lastUpdatedAt)!,
                        )?.toLocal(),
                      ),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.storage_outlined),
              title: const Text('Counter data loaded'),
              subtitle: Text(
                '${listOf(_snapshot['tables']).length} tables · ${listOf(_snapshot['orders']).length} orders · ${listOf(_snapshot['menuItems']).length} menu items',
              ),
            ),
            if (_cacheProblem != null)
              ListTile(
                leading: const Icon(Icons.info_outline, color: Colors.orange),
                title: Text(_cacheProblem!),
                subtitle: const Text(
                  'Keep Wi-Fi connected. Your counter data has not been changed.',
                ),
              ),
            if (_error != null)
              ListTile(
                leading: const Icon(Icons.warning_amber, color: Colors.orange),
                title: Text(_error!),
              ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      Card(
        child: Column(
          children: [
            const ListTile(
              leading: Icon(Icons.print_outlined, color: Brand.orange),
              title: Text('Kitchen printing'),
              subtitle: Text(
                'Desk sends KOTs to your configured station printer. Set printer routes in the desktop Printer Center.',
              ),
            ),
            if (_isOwner) ...[
              for (final s in listOf(_snapshot['stations']))
                ListTile(
                  dense: true,
                  title: Text(text(s['name'])),
                  subtitle: Text(
                    text(
                      s['printerTarget'],
                      fallback: 'Default KOT / bill printer',
                    ),
                  ),
                ),
            ],
            const ListTile(
              leading: Icon(Icons.shield_outlined),
              title: Text('Safe ordering'),
              subtitle: Text(
                'Drafts stay on this phone until Desk confirms. Retry uses the same request ID, not a second order.',
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 16),
      OutlinedButton.icon(
        onPressed: () async {
          final confirmed = await showDialog<bool>(
            context: context,
            builder: (dialog) => AlertDialog(
              title: const Text('Sign out?'),
              content: const Text(
                'Unsent drafts remain saved for this account on this phone.',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(dialog, false),
                  child: const Text('Stay'),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(dialog, true),
                  child: const Text('Sign out'),
                ),
              ],
            ),
          );
          if (confirmed == true) widget.onLogout();
        },
        icon: const Icon(Icons.logout, size: 18),
        label: const Text('Sign out'),
      ),
      const SizedBox(height: 14),
      const Text(
        'BhojPatra · 1.3.1',
        textAlign: TextAlign.center,
        style: TextStyle(color: Brand.muted, fontSize: 11),
      ),
    ],
  );

  Widget _page(int index) {
    if (index == 3) return _account();
    if (_snapshot.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.wifi_find, size: 46, color: Brand.muted),
            const SizedBox(height: 14),
            const Text(
              'Waiting for your counter',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            const Text(
              'Connect to Wi-Fi and keep Desk open.',
              style: TextStyle(color: Brand.muted),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _syncing ? null : () => _refresh(connect: true),
              icon: const Icon(Icons.refresh),
              label: const Text('Reconnect'),
            ),
          ],
        ),
      );
    }
    if (_isOwner && index == 0) {
      return OverviewTab(snapshot: _snapshot, onRefresh: _refresh);
    }
    if (_isOwner && index == 1) {
      return OwnerReports(snapshot: _snapshot, onRefresh: _refresh);
    }
    if (!_isOwner && index == 1) return OrderActivity(snapshot: _snapshot);
    if (!_isOwner && index == 2) {
      return _isKitchen
          ? KitchenWorkspace(snapshot: _snapshot, onSave: _save)
          : OrderActivity(snapshot: _snapshot, kitchen: true);
    }
    if (_isCloudMode) return OrderActivity(snapshot: _snapshot);
    if (_isKitchen) return KitchenWorkspace(snapshot: _snapshot, onSave: _save);
    return CaptainWorkspace(
      snapshot: _snapshot,
      session: widget.session,
      onCommand: _captainCommand,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final live = _error == null && _lastSyncAt != null;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 12,
        title: Row(
          children: [
            const BrandLogo(size: 33),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'BhojPatra',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                  ),
                  Text(
                    text(
                      snapshotValue(_snapshot, 'outlet', 'name'),
                      fallback: widget.session.userName,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 10, color: Brand.muted),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
            decoration: BoxDecoration(
              color: live ? const Color(0xffecfdf5) : const Color(0xfffffbeb),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.circle,
                  size: 6,
                  color: live ? Brand.green : Colors.orange,
                ),
                const SizedBox(width: 5),
                Text(
                  _isCloudMode
                      ? 'REMOTE'
                      : live
                      ? (_connected ? 'LIVE' : 'POLLING')
                      : 'OFFLINE',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: live ? Brand.green : Colors.orange,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Refresh connection',
            onPressed: _syncing ? null : () => _refresh(connect: true),
            icon: _syncing
                ? const SizedBox(
                    width: 17,
                    height: 17,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync, size: 21),
          ),
        ],
      ),
      body: SafeArea(
        child: _snapshot.isEmpty
            ? _page(_navIndex)
            : IndexedStack(index: _navIndex, children: List.generate(4, _page)),
      ),
      bottomNavigationBar: MobileNavigation(
        owner: _isOwner,
        index: _navIndex,
        onSelect: (i) => setState(() => _navIndex = i),
      ),
    );
  }
}
