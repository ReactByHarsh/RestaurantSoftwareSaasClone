import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../utils/utils.dart';

class LanDesktopCandidate {
  const LanDesktopCandidate({
    required this.url,
    required this.source,
    this.name,
    this.outletName,
    this.licensed,
  });

  final String url;
  final String source;
  final String? name;
  final String? outletName;
  final bool? licensed;
}

class LanDiscovery {
  static const int httpPort = 3000;
  static const int discoveryPort = 3001;
  static const String probeMessage = 'BHOJPATRA_DISCOVER_V1';

  static Future<List<LanDesktopCandidate>> discover({
    String? preferredUrl,
    Duration timeout = const Duration(seconds: 5),
  }) async {
    final candidates = <LanDesktopCandidate>[];
    final seen = <String>{};

    Future<void> addProbe(String url, String source) async {
      final normalized = normalizeLanUrl(url);
      if (normalized.isEmpty || !seen.add(normalized)) return;
      final candidate = await probe(normalized, source: source);
      if (candidate != null) candidates.add(candidate);
    }

    final preferred = preferredUrl?.trim();
    if (preferred != null &&
        preferred.isNotEmpty &&
        preferred != defaultLanServerUrl) {
      await addProbe(preferred, 'saved');
    }

    await _discoverByUdp(candidates, seen);

    for (final url in await _likelyHotspotUrls()) {
      await addProbe(url, 'hotspot');
    }

    final remaining = timeout - const Duration(seconds: 2);
    if (candidates.isEmpty && remaining.inMilliseconds > 0) {
      await _scanLocalSubnets(candidates, seen, timeout: remaining);
    }

    return candidates;
  }

  static Future<LanDesktopCandidate?> probe(
    String url, {
    String source = 'manual',
  }) async {
    final normalized = normalizeLanUrl(url);
    if (normalized.isEmpty) return null;
    final uri = Uri.tryParse('$normalized/api/v1/lan/hello');
    if (uri == null) return null;
    try {
      final response = await http
          .get(uri, headers: {'Accept': 'application/json'})
          .timeout(const Duration(milliseconds: 750));
      if (response.statusCode < 200 || response.statusCode >= 300) return null;
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      if (payload['app'] != 'bhojpatra-desk') return null;
      final outlet = payload['outlet'];
      return LanDesktopCandidate(
        url: normalized,
        source: source,
        name: text(payload['name'], fallback: 'BhojPatra Desk'),
        outletName: outlet is Map ? text(outlet['name']) : null,
        licensed: payload['licensed'] is bool
            ? payload['licensed'] as bool
            : null,
      );
    } catch (_) {
      return null;
    }
  }

  static Future<void> _discoverByUdp(
    List<LanDesktopCandidate> candidates,
    Set<String> seen,
  ) async {
    RawDatagramSocket? socket;
    try {
      socket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
      socket.broadcastEnabled = true;
      final payload = utf8.encode(probeMessage);
      final targets = <InternetAddress>{
        InternetAddress('255.255.255.255'),
        ...await _broadcastAddresses(),
      };
      for (final target in targets) {
        socket.send(payload, target, discoveryPort);
      }

      final completer = Completer<void>();
      late StreamSubscription subscription;
      subscription = socket.listen((event) async {
        if (event != RawSocketEvent.read) return;
        final datagram = socket?.receive();
        if (datagram == null) return;
        final url = normalizeLanUrl(
          'http://${datagram.address.address}:$httpPort',
        );
        if (!seen.add(url)) return;
        final candidate = await probe(url, source: 'auto');
        if (candidate != null) candidates.add(candidate);
        if (!completer.isCompleted) completer.complete();
      });
      await completer.future.timeout(
        const Duration(milliseconds: 1200),
        onTimeout: () {},
      );
      await subscription.cancel();
    } catch (_) {
      // UDP broadcast is best-effort; hotspot routers often disable it.
    } finally {
      socket?.close();
    }
  }

  static Future<List<String>> _likelyHotspotUrls() async {
    final urls = <String>{
      'http://192.168.1.100:$httpPort',
      'http://192.168.0.100:$httpPort',
      'http://192.168.43.1:$httpPort',
      'http://192.168.43.100:$httpPort',
      'http://192.168.137.1:$httpPort',
      'http://192.168.137.100:$httpPort',
      'http://172.20.10.1:$httpPort',
    };
    for (final address in await _localIpv4Addresses()) {
      final parts = address.address.split('.');
      if (parts.length != 4) continue;
      urls.add('http://${parts[0]}.${parts[1]}.${parts[2]}.1:$httpPort');
      urls.add('http://${parts[0]}.${parts[1]}.${parts[2]}.100:$httpPort');
    }
    return urls.toList();
  }

  static Future<void> _scanLocalSubnets(
    List<LanDesktopCandidate> candidates,
    Set<String> seen, {
    required Duration timeout,
  }) async {
    final addresses = await _localIpv4Addresses();
    final targets = <String>[];
    for (final address in addresses) {
      final parts = address.address.split('.');
      if (parts.length != 4) continue;
      final prefix = '${parts[0]}.${parts[1]}.${parts[2]}';
      for (var host = 1; host <= 254; host++) {
        if ('$prefix.$host' == address.address) continue;
        targets.add('http://$prefix.$host:$httpPort');
      }
    }

    final deadline = DateTime.now().add(timeout);
    const batchSize = 32;
    for (var index = 0; index < targets.length; index += batchSize) {
      if (DateTime.now().isAfter(deadline) || candidates.isNotEmpty) return;
      final batch = targets
          .skip(index)
          .take(batchSize)
          .where((url) => seen.add(normalizeLanUrl(url)));
      final results = await Future.wait(
        batch.map((url) => probe(url, source: 'scan')),
      );
      candidates.addAll(results.whereType<LanDesktopCandidate>());
    }
  }

  static Future<List<InternetAddress>> _localIpv4Addresses() async {
    try {
      final interfaces = await NetworkInterface.list(
        includeLoopback: false,
        type: InternetAddressType.IPv4,
      );
      return interfaces
          .expand((interface) => interface.addresses)
          .where((address) => _isPrivateIpv4(address.address))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  static Future<List<InternetAddress>> _broadcastAddresses() async {
    final addresses = await _localIpv4Addresses();
    final broadcasts = <InternetAddress>[];
    for (final address in addresses) {
      final parts = address.address.split('.');
      if (parts.length == 4) {
        broadcasts.add(
          InternetAddress('${parts[0]}.${parts[1]}.${parts[2]}.255'),
        );
      }
    }
    return broadcasts;
  }

  static bool _isPrivateIpv4(String value) {
    final parts = value.split('.').map(int.tryParse).toList();
    if (parts.length != 4 || parts.any((part) => part == null)) return false;
    final first = parts[0]!;
    final second = parts[1]!;
    return first == 10 ||
        (first == 172 && second >= 16 && second <= 31) ||
        (first == 192 && second == 168);
  }
}
