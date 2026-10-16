import 'dart:async';
import 'dart:convert';
import 'package:bhojpatra_mobile/api/cloud_api.dart';
import 'package:bhojpatra_mobile/models/restaurant_reports.dart';
import 'package:bhojpatra_mobile/models/session.dart';
import 'package:bhojpatra_mobile/screens/mobile_home.dart';
import 'package:bhojpatra_mobile/storage/snapshot_cache.dart';
import 'package:bhojpatra_mobile/theme/bhojpatra_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'reports_test.dart' show reportFixture;

final ownerSession = SavedSession(
  serverUrl: 'http://127.0.0.1:3000',
  login: 'owner@test.local',
  password: 'fixture-only',
  outletId: 'out_test',
  user: {'id': 'owner', 'role': 'owner', 'name': 'Test Owner'},
);

Map<String, dynamic> liveFixture() {
  final json = jsonEncode(reportFixture())
      .replaceAll('2026-10-07', dateKey(DateTime.now()))
      .replaceAll(
        '2026-10-06',
        dateKey(DateTime.now().subtract(const Duration(days: 1))),
      );
  final state = jsonDecode(json) as Map<String, dynamic>;
  state['outlet'] = {'id': 'out_test', 'name': 'Test Restaurant'};
  state['tables'] = [
    {
      'id': 't1',
      'name': 'T1',
      'status': 'occupied',
      'activeOrderId': 'o2',
      'seats': 4,
    },
    {'id': 't2', 'name': 'T2', 'status': 'available', 'seats': 4},
  ];
  return state;
}

class TestCache implements SnapshotCache {
  bool broken = true;
  final pendingRead = Completer<Map<String, dynamic>?>();
  bool delayed = false;
  @override
  Future<Map<String, dynamic>?> load() async {
    if (delayed) return pendingRead.future;
    if (broken) throw StateError('fixture cache initialization failed');
    return null;
  }

  @override
  Future<void> save(Map<String, dynamic> snapshot) async {
    if (broken) throw StateError('fixture cache write failed');
  }
}

class TestSink implements WebSocketSink {
  @override
  void add(dynamic data) {}
  @override
  Future<void> close([int? code, String? reason]) async {}
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class TestSocket implements WebSocketChannel {
  final events = StreamController<dynamic>();
  @override
  Stream<dynamic> get stream => events.stream;
  @override
  final WebSocketSink sink = TestSink();
  @override
  Future<void> get ready => Future.value();
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class TestApi extends CloudApi {
  TestApi(http.Client client) : super(ownerSession, client: client);
  final socket = TestSocket();
  @override
  WebSocketChannel connectRealtime() => socket;
  @override
  Future<bool> rediscoverDesktop() async => false;
  void publish(Map<String, dynamic> state, String revision) =>
      socket.events.add(
        jsonEncode({
          'type': 'STATE_UPDATED',
          'timestamp': revision,
          'payload': state,
        }),
      );
}

http.Response response(Map<String, dynamic> state, String revision) =>
    http.Response(
      jsonEncode({'exists': true, 'payload': state, 'updatedAt': revision}),
      200,
    );

Future<void> mount(WidgetTester tester, TestApi api, TestCache cache) async {
  SharedPreferences.setMockInitialValues({});
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      theme: Brand.theme,
      home: MobileHome(
        session: ownerSession,
        onLogout: () {},
        api: api,
        cache: cache,
        captainOnly: true,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  test(
    'missing or incomplete LAN state never becomes successful empty data',
    () async {
      for (final body in [
        {'exists': false},
        {
          'exists': true,
          'payload': {
            'outlet': {'id': 'out_test'},
          },
        },
        {
          'exists': true,
          'payload': {
            ...liveFixture(),
            'outlet': {'id': 'wrong'},
          },
        },
      ]) {
        final api = CloudApi(
          ownerSession,
          client: MockClient((_) async => http.Response(jsonEncode(body), 200)),
        );
        await expectLater(api.fetchState(), throwsException);
        api.dispose();
      }
    },
  );

  testWidgets(
    'broken Android cache does not block owner Home, Reports or Tables',
    (tester) async {
      var requests = 0;
      final api = TestApi(
        MockClient((request) async {
          requests++;
          expect(request.url.path, '/api/v1/outlets/out_test/state');
          return response(liveFixture(), '2026-10-07T12:00:00Z');
        }),
      );
      await mount(tester, api, TestCache());
      expect(requests, 1);
      expect(find.text('Rs 100.00'), findsWidgets);
      await tester.tap(find.text('Reports'));
      await tester.pumpAndSettle();
      expect(find.text('Rs 100.00'), findsWidgets);
      await tester.tap(find.widgetWithText(ChoiceChip, '7 days'));
      await tester.pumpAndSettle();
      expect(find.text('Rs 1099.00'), findsWidgets);
      await tester.tap(find.text('Tables'));
      await tester.pumpAndSettle();
      expect(find.text('T1'), findsOneWidget);
      expect(find.text('T2'), findsOneWidget);
      await tester.tap(find.text('Account'));
      await tester.pumpAndSettle();
      expect(find.text('2 tables · 4 orders · 1 menu items'), findsOneWidget);
      expect(find.textContaining('Offline cache unavailable'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await api.socket.events.close();
    },
  );

  testWidgets('delayed empty cache cannot replace loaded LAN data', (
    tester,
  ) async {
    final cache = TestCache()..delayed = true;
    final api = TestApi(
      MockClient((_) async => response(liveFixture(), '2026-10-07T12:00:00Z')),
    );
    await mount(tester, api, cache);
    expect(find.text('Rs 100.00'), findsWidgets);
    cache.pendingRead.complete({
      'outlet': {'id': 'out_test'},
      'orders': [],
      'tables': [],
    });
    await tester.pumpAndSettle();
    expect(find.text('Rs 100.00'), findsWidgets);
    await tester.pumpWidget(const SizedBox());
    await api.socket.events.close();
  });

  testWidgets(
    'realtime wins over in-flight old poll and updates every owner tab',
    (tester) async {
      final pending = Completer<http.Response>();
      var requests = 0;
      final api = TestApi(
        MockClient((_) async {
          requests++;
          if (requests == 2) return pending.future;
          return response(liveFixture(), '2026-10-07T12:00:00Z');
        }),
      );
      await mount(tester, api, TestCache());
      await tester.tap(find.text('Reports'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(ChoiceChip, '7 days'));
      await tester.pumpAndSettle();
      // The fallback poll is deliberately left waiting while Desk publishes.
      await tester.pump(const Duration(seconds: 10));
      expect(requests, 2);
      final fresh = liveFixture();
      fresh['orders'][0]['totalPaise'] = 22000;
      fresh['tables'].add({
        'id': 't3',
        'name': 'T3',
        'seats': 2,
        'status': 'available',
      });
      api.publish(fresh, '2026-10-07T12:01:00Z');
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Rs 1199.00'), findsWidgets);
      pending.complete(response(liveFixture(), '2026-10-07T12:00:00Z'));
      await tester.pumpAndSettle();
      expect(find.text('Rs 1199.00'), findsWidgets);
      await tester.tap(find.text('Home'));
      await tester.pumpAndSettle();
      expect(find.text('Rs 200.00'), findsWidgets);
      await tester.tap(find.text('Tables'));
      await tester.pumpAndSettle();
      expect(find.text('T3'), findsOneWidget);
      // Late/out-of-order messages must not revert the data either.
      api.publish(liveFixture(), '2026-10-07T11:59:00Z');
      await tester.pumpAndSettle();
      expect(find.text('T3'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await api.socket.events.close();
    },
  );
}
