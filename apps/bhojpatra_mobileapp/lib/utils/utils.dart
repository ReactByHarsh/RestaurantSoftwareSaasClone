import 'dart:convert';
import '../models/session.dart';

const defaultServerUrl = 'https://bhojpatra-cloud.yash-v-shinde.workers.dev';
const defaultLanServerUrl = 'Auto detect BhojPatra Desk';

String cleanBase(String value) {
  final raw = value.trim().isEmpty ? defaultServerUrl : value.trim();
  return raw.replaceAll(RegExp(r'/+$'), '');
}

String normalizeLanUrl(String value) {
  final raw = value.trim();
  if (raw.isEmpty || raw == defaultLanServerUrl) return '';
  final withScheme = raw.startsWith(RegExp(r'https?://')) ? raw : 'http://$raw';
  final uri = Uri.tryParse(withScheme);
  if (uri == null || uri.host.isEmpty) return '';
  final port = uri.hasPort ? uri.port : 3000;
  return uri
      .replace(path: '', query: '', fragment: '', port: port)
      .toString()
      .replaceAll(RegExp(r'/+$'), '');
}

String text(Object? value, {String fallback = ''}) {
  final raw = value?.toString().trim() ?? '';
  return raw.isEmpty ? fallback : raw;
}

int intValue(Object? value) {
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse(text(value)) ?? 0;
}

String money(int paise) => 'Rs ${(paise / 100).toStringAsFixed(2)}';

Object? snapshotValue(Map<String, dynamic> snapshot, String group, String key) {
  final value = snapshot[group];
  return value is Map ? value[key] : null;
}

List<Map<String, dynamic>> listOf(Object? value) {
  if (value is! List) return [];
  return value
      .whereType<Map>()
      .map((item) => Map<String, dynamic>.from(item))
      .toList();
}

Map<String, dynamic> deepCopy(Map<String, dynamic> value) {
  return Map<String, dynamic>.from(jsonDecode(jsonEncode(value)) as Map);
}

Map<String, dynamic> emptySnapshot(SavedSession session) {
  return {
    'outlet': {
      'id': session.outletId,
      'tenantId': session.tenantId,
      'name': text(
        session.user['restaurantName'],
        fallback: 'BhojPatra Restaurant',
      ),
      'code': 'MOB',
      'timezone': 'Asia/Kolkata',
      'currency': 'INR',
      'status': 'active',
      'enableDirtyTableStatus': true,
    },
    'printSettings': {},
    'menuCategories': [],
    'menuItems': [],
    'floors': [],
    'tables': [],
    'stations': [],
    'inventoryItems': [],
    'purchaseEntries': [],
    'orders': [],
    'orderItems': [],
    'kots': [],
    'payments': [],
    'auditLogs': [],
    'savedCarts': {},
  };
}

String serverModeLabel(String serverUrl) {
  final base = cleanBase(serverUrl);
  final uri = Uri.tryParse(base);
  final host = uri?.host.toLowerCase() ?? '';
  if (host == 'localhost' || host == '127.0.0.1') return 'LOCAL';
  if (host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      host.startsWith('172.') ||
      host.endsWith('.local')) {
    return 'LAN';
  }
  return 'CLOUD';
}

extension FirstWhereOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;

  T? firstWhereOrNull(bool Function(T item) test) {
    for (final item in this) {
      if (test(item)) return item;
    }
    return null;
  }
}
