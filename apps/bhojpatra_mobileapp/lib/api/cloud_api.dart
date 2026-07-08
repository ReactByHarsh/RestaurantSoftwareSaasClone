import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';
import 'lan_discovery.dart';
import '../models/session.dart';
import '../utils/utils.dart';

class CloudApi {
  CloudApi(this.session);

  final SavedSession session;

  String get _base => cleanBase(session.serverUrl);

  Map<String, String> get _headers => {
    'Accept': 'application/json',
    'Authorization':
        'Basic ${base64Encode(utf8.encode('${session.login}:${session.password}'))}',
  };

  static Future<SavedSession> login(
    String serverUrl,
    String loginId,
    String password, {
    String mode = 'lan',
  }) async {
    final base = mode == 'lan'
        ? normalizeLanUrl(serverUrl)
        : cleanBase(serverUrl);
    if (base.isEmpty) {
      throw Exception('BhojPatra Desk was not found on this Wi-Fi');
    }
    final response = await http
        .post(
          Uri.parse('$base/api/v1/auth/login'),
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: jsonEncode({
            'emailOrPhone': loginId.trim(),
            'password': password,
          }),
        )
        .timeout(
          mode == 'lan'
              ? const Duration(seconds: 4)
              : const Duration(seconds: 12),
        );
    final payload = _jsonMap(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(text(payload['error'], fallback: 'Login failed'));
    }
    final outlets = (payload['outlets'] as List?) ?? const [];
    if (outlets.isEmpty) throw Exception('No outlet assigned to this login');
    final session = SavedSession(
      serverUrl: base,
      login: loginId.trim(),
      password: password,
      outletId: text((outlets.first as Map)['id']),
      user: Map<String, dynamic>.from(payload['user'] as Map),
      mode: mode,
    );
    return session;
  }

  static Future<SavedSession> loginAutoLan(
    String serverUrl,
    String loginId,
    String password,
  ) async {
    final errors = <String>[];
    final manualUrl = normalizeLanUrl(serverUrl);
    if (manualUrl.isNotEmpty) {
      try {
        return await login(manualUrl, loginId, password, mode: 'lan');
      } catch (error) {
        errors.add(error.toString().replaceFirst('Exception: ', ''));
      }
    }

    final candidates = await LanDiscovery.discover(preferredUrl: manualUrl);
    for (final candidate in candidates) {
      try {
        return await login(candidate.url, loginId, password, mode: 'lan');
      } catch (error) {
        errors.add(
          '${candidate.url}: ${error.toString().replaceFirst('Exception: ', '')}',
        );
      }
    }

    if (candidates.isEmpty) {
      throw Exception(
        'BhojPatra Desk was not found. Keep desktop open, phone on same Wi-Fi/hotspot, and allow Windows Firewall for BhojPatra Desk.',
      );
    }
    throw Exception(
      errors.isEmpty ? 'Login failed on discovered desktop' : errors.first,
    );
  }

  Future<Map<String, dynamic>> fetchState() async {
    final response = await http.get(
      Uri.parse(
        '$_base/api/v1/outlets/${Uri.encodeComponent(session.outletId)}/state',
      ),
      headers: _headers,
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Cloud sync fetch failed (${response.statusCode})');
    }
    final payload = jsonDecode(response.body) as Map<String, dynamic>;
    if (payload['exists'] == true && payload['payload'] is Map) {
      return Map<String, dynamic>.from(payload['payload'] as Map);
    }
    return emptySnapshot(session);
  }

  Future<void> saveState(Map<String, dynamic> snapshot) async {
    final tenantId = text(
      snapshotValue(snapshot, 'outlet', 'tenantId'),
      fallback: session.tenantId,
    );
    final response = await http.put(
      Uri.parse(
        '$_base/api/v1/outlets/${Uri.encodeComponent(session.outletId)}/state',
      ),
      headers: {..._headers, 'Content-Type': 'application/json'},
      body: jsonEncode({
        'tenantId': tenantId,
        'payload': snapshot,
        'clientId':
            'flutter-${session.role}-${DateTime.now().millisecondsSinceEpoch}',
      }),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Cloud sync save failed (${response.statusCode})');
    }
  }

  WebSocketChannel connectRealtime() {
    final uri =
        Uri.parse(
          '$_base/api/v1/outlets/${Uri.encodeComponent(session.outletId)}/realtime',
        ).replace(
          scheme: _base.startsWith('https') ? 'wss' : 'ws',
          queryParameters: {
            'clientId': 'flutter-${session.userId}',
            'login': session.login,
            'secret': session.password,
          },
        );
    return WebSocketChannel.connect(uri);
  }
}

Map<String, dynamic> _jsonMap(String body) {
  try {
    final decoded = jsonDecode(body);
    return decoded is Map
        ? Map<String, dynamic>.from(decoded)
        : <String, dynamic>{};
  } catch (_) {
    return <String, dynamic>{};
  }
}
