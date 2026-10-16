import 'dart:convert';
import 'dart:io';
import 'package:bhojpatra_mobile/api/lan_discovery.dart';
import 'package:bhojpatra_mobile/utils/utils.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('LAN discovery validates real HTTP hello responses', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    server.listen((request) {
      expect(request.uri.path, '/api/v1/lan/hello');
      request.response.headers.contentType = ContentType.json;
      request.response.write(
        jsonEncode({
          'app': 'bhojpatra-desk',
          'outlet': {'id': 'out_test', 'name': 'Test Restaurant'},
        }),
      );
      request.response.close();
    });
    final found = await LanDiscovery.probe('http://127.0.0.1:${server.port}');
    expect(found?.outletId, 'out_test');
  });
  test('manual IPs use the actual Desk API port, not the dev website port', () {
    expect(normalizeLanUrl('192.168.1.10'), 'http://192.168.1.10:3000');
    expect(normalizeLanUrl(defaultLanServerUrl), '');
  });
}
