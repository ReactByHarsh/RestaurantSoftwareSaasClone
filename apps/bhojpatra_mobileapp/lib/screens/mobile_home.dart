import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../models/session.dart';
import '../api/cloud_api.dart';
import '../utils/utils.dart';
import 'owner/owner_home.dart';
import 'captain/captain_workspace.dart';
import 'kitchen/kitchen_workspace.dart';
import 'settings_screen.dart';

class MobileHome extends StatefulWidget {
  const MobileHome({super.key, required this.session, required this.onLogout});

  final SavedSession session;
  final VoidCallback onLogout;

  @override
  State<MobileHome> createState() => _MobileHomeState();
}

class _MobileHomeState extends State<MobileHome> {
  late final CloudApi _api;
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
  String? _lastUpdatedAt;
  String? _lastSyncAt;

  bool get _isOwner =>
      {'owner', 'admin', 'manager'}.contains(widget.session.role);
  bool get _isKitchen => widget.session.role == 'kitchen';
  bool get _isCloudMode => widget.session.mode.startsWith('cloud');
  String get _serverMode => _isCloudMode
      ? 'CLOUD LIVE'
      : serverModeLabel(widget.session.serverUrl);

  @override
  void initState() {
    super.initState();
    _api = CloudApi(widget.session);
    _refresh(connect: true);
  }

  @override
  void dispose() {
    _socketGeneration++;
    _reconnectTimer?.cancel();
    _heartbeatTimer?.cancel();
    _socket?.sink.close();
    super.dispose();
  }

  Future<void> _refresh({bool connect = false}) async {
    setState(() {
      _syncing = true;
      _error = null;
    });
    try {
      final state = await _api.fetchState();
      if (mounted) {
        setState(() {
          _snapshot = state;
          _lastSyncAt = DateTime.now().toIso8601String();
          _error = null;
        });
      }
      if (connect) {
        _connectRealtime();
      }
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
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
      _socket!.stream.listen(
        (message) {
          if (generation != _socketGeneration || message is! String) return;
          if (message == 'pong') {
            if (mounted && !_connected) setState(() => _connected = true);
            return;
          }
          final event = jsonDecode(message) as Map<String, dynamic>;
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
          if (payload is Map && payload['orders'] is List && mounted) {
            setState(() {
              _snapshot = Map<String, dynamic>.from(
                payload.cast<String, dynamic>(),
              );
              _lastUpdatedAt = timestamp;
              _lastSyncAt = timestamp;
              _error = null;
            });
          } else if (eventType == 'STATE_UPDATED') {
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
      final accepted = await _api.saveState(next);
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

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 8,
        title: Row(
          children: [
            Icon(
              Icons.restaurant,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                _isKitchen
                    ? 'Kitchen ${_isCloudMode ? 'Cloud' : 'LAN'}'
                    : (_isOwner
                          ? 'Owner ${_isCloudMode ? 'Cloud' : 'LAN'}'
                          : 'Captain ${_isCloudMode ? 'Cloud' : 'LAN'}'),
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: _connected
                          ? Colors.green.shade50
                          : Colors.orange.shade50,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: _connected
                            ? Colors.green.shade200
                            : Colors.orange.shade200,
                ),
              ),
              child: Text(
                '$_serverMode ${_connected ? 'LIVE' : 'OFFLINE'}',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: _connected
                            ? Colors.green.shade800
                            : Colors.orange.shade800,
                ),
              ),
            ),
          ],
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(28),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '${_isCloudMode ? 'Cloud server' : 'LAN server'}: ${widget.session.serverUrl}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: Colors.black54,
                    ),
                  ),
                ),
                if (_lastUpdatedAt != null)
                  Text(
                    '${_lastSyncAt != null ? 'Synced' : 'Updated'} ${TimeOfDay.fromDateTime(DateTime.parse(_lastUpdatedAt!)).format(context)}',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: Colors.black54,
                    ),
                  ),
              ],
            ),
          ),
        ),
        actions: [
          if (_syncing)
            const Padding(
              padding: EdgeInsets.all(14),
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          if (_isOwner)
            IconButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) =>
                      SettingsScreen(snapshot: _snapshot, onSave: _save),
                ),
              ),
              icon: const Icon(Icons.settings),
            ),
          IconButton(
            onPressed: () => _refresh(connect: true),
            icon: const Icon(Icons.sync),
          ),
          IconButton(
            onPressed: widget.onLogout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: SafeArea(
        child: _error != null && _snapshot.isEmpty
            ? Center(
                child: Text(
                  _error!,
                  style: const TextStyle(
                    color: Colors.red,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              )
            : _isOwner
            ? OwnerHome(
                snapshot: _snapshot,
                session: widget.session,
                onRefresh: _refresh,
                onSave: _save,
              )
            : _isKitchen
            ? KitchenWorkspace(snapshot: _snapshot, onSave: _save)
            : CaptainWorkspace(
                snapshot: _snapshot,
                session: widget.session,
                onSave: _save,
              ),
      ),
    );
  }
}
