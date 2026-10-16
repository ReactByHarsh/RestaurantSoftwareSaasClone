import 'dart:convert';
import 'dart:io';
import 'package:bhojpatra_mobile/api/cloud_api.dart';
import 'package:bhojpatra_mobile/models/restaurant_reports.dart';
import 'package:bhojpatra_mobile/models/session.dart';
import 'package:bhojpatra_mobile/screens/mobile_home.dart';
import 'package:bhojpatra_mobile/theme/bhojpatra_theme.dart';
import 'package:bhojpatra_mobile/utils/utils.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'owner_loading_test.dart' show TestCache, TestSocket;

// This optional read-only integration test deliberately uses the real network,
// rather than Flutter's default test HTTP client which always returns 400.
class CounterNetworkOverrides extends HttpOverrides {}

class CounterPayloadApi extends CloudApi {
  CounterPayloadApi(super.session, Map<String, dynamic> state)
    : super(
        client: MockClient(
          (_) async => http.Response.bytes(
            utf8.encode(
              jsonEncode({
                'exists': true,
                'payload': state,
                'updatedAt': '2026-10-07T12:00:00Z',
              }),
            ),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          ),
        ),
      );
  final socket = TestSocket();
  @override
  WebSocketChannel connectRealtime() => socket;
  @override
  Future<bool> rediscoverDesktop() async => false;
}

void main() {
  final url = Platform.environment['BHOJPATRA_OWNER_TEST_URL'];
  late SavedSession verifiedSession;
  late Map<String, dynamic> verifiedSnapshot;
  test(
    'real owner login reads full Desk state, reports and authenticated realtime',
    () => HttpOverrides.runWithHttpOverrides(() async {
      // Read-only diagnostics. Never creates orders or writes counter state.
      final session = await CloudApi.login(
        url!,
        Platform.environment['BHOJPATRA_OWNER_TEST_LOGIN']!,
        Platform.environment['BHOJPATRA_OWNER_TEST_PASSWORD']!,
      );
      expect({'owner', 'admin', 'manager'}, contains(session.role));
      final api = CloudApi(session);
      addTearDown(api.dispose);
      final snapshot = await api.fetchState();
      verifiedSession = session;
      verifiedSnapshot = snapshot;
      expect(snapshotValue(snapshot, 'outlet', 'id'), session.outletId);
      expect(listOf(snapshot['tables']), isNotEmpty);
      expect(listOf(snapshot['orders']), isNotEmpty);
      expect(listOf(snapshot['menuItems']), isNotEmpty);
      final now = DateTime.now();
      final all = RestaurantReports(snapshot, DateTime(2020), now);
      expect(all.sales, greaterThan(0));
      expect(all.products, isNotEmpty);
      expect(all.collected, greaterThan(0));
      final today = RestaurantReports(snapshot, now, now);
      final expectedToday = listOf(snapshot['orders'])
          .where(
            (o) => o['businessDate'] == dateKey(now) && o['status'] == 'paid',
          )
          .length;
      expect(today.paidOrders.length, expectedToday);
      final socket = api.connectRealtime();
      addTearDown(() => socket.sink.close());
      final event = jsonDecode(
        await socket.stream.first.timeout(const Duration(seconds: 8)) as String,
      );
      expect(event['type'], 'CONNECTED');
      // Counts only: don't print names, orders, auth headers or private payloads.
      // ignore: avoid_print
      print(
        'Owner LAN verified: ${listOf(snapshot['orders']).length} orders, ${listOf(snapshot['tables']).length} tables, ${listOf(snapshot['menuItems']).length} menu items, ${today.paidOrders.length} paid bills today.',
      );
    }, CounterNetworkOverrides()),
    skip: url == null
        ? 'Set scoped owner test credentials to run read-only live LAN verification.'
        : false,
  );
  testWidgets('full running-counter payload renders owner tabs and date ranges', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = CounterPayloadApi(verifiedSession, verifiedSnapshot);
    await tester.runAsync(() async {
      expect(
        listOf((await api.fetchState())['orders']).length,
        listOf(verifiedSnapshot['orders']).length,
      );
    });
    await tester.pumpWidget(
      MaterialApp(
        theme: Brand.theme,
        home: MobileHome(
          session: verifiedSession,
          onLogout: () {},
          captainOnly: true,
          api: api,
          cache: TestCache(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final now = DateTime.now();
    expect(
      find.text(money(RestaurantReports(verifiedSnapshot, now, now).sales)),
      findsWidgets,
    );
    await tester.tap(find.text('Reports'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ChoiceChip, '7 days'));
    await tester.pumpAndSettle();
    expect(
      find.text(
        money(
          RestaurantReports(
            verifiedSnapshot,
            now.subtract(const Duration(days: 6)),
            now,
          ).sales,
        ),
      ),
      findsWidgets,
    );
    for (final tab in [
      'Products',
      'Payments',
      'Expenses',
      'Stock',
      'Purchases',
      'Cancellations',
      'Summary',
      'Sales',
    ]) {
      final chip = find.widgetWithText(ChoiceChip, tab);
      await tester.ensureVisible(chip);
      await tester.tap(chip);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    }
    await tester.tap(find.text('Tables'));
    await tester.pumpAndSettle();
    expect(
      find.text(text(listOf(verifiedSnapshot['tables']).first['name'])),
      findsOneWidget,
    );
    await tester.tap(find.text('Account'));
    await tester.pumpAndSettle();
    expect(
      find.text(
        '${listOf(verifiedSnapshot['tables']).length} tables · ${listOf(verifiedSnapshot['orders']).length} orders · ${listOf(verifiedSnapshot['menuItems']).length} menu items',
      ),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await api.socket.events.close();
  }, skip: url == null);
}
