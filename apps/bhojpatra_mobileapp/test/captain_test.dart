import 'dart:convert';
import 'dart:io';
import 'package:bhojpatra_mobile/api/cloud_api.dart';
import 'package:bhojpatra_mobile/models/captain_draft.dart';
import 'package:bhojpatra_mobile/models/session.dart';
import 'package:bhojpatra_mobile/screens/captain/captain_workspace.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:bhojpatra_mobile/theme/bhojpatra_theme.dart';

final session = SavedSession(
  serverUrl: 'http://192.168.1.10:3000',
  login: 'captain@test.local',
  password: 'test-only',
  outletId: 'out_test',
  user: {'id': 'cap1', 'name': 'Captain', 'role': 'captain'},
);
Map<String, dynamic> fixture() => {
  'outlet': {'id': 'out_test', 'name': 'Test Restaurant'},
  'floors': [
    {
      'id': 'ac',
      'name': 'AC Section',
      'menuPriceOption': 'special',
      'priceAdjustmentValue': 10,
    },
  ],
  'tables': [
    {
      'id': 't1',
      'name': 'T1',
      'floorId': 'ac',
      'seats': 4,
      'status': 'available',
    },
    {
      'id': 't2',
      'name': 'T2',
      'floorId': 'ac',
      'seats': 4,
      'status': 'available',
    },
  ],
  'menuCategories': [
    {'id': 'food', 'name': 'Food'},
  ],
  'menuItems': [
    {
      'id': 'tea',
      'name': 'Tea',
      'categoryId': 'food',
      'pricePaise': 2000,
      'specialPricePaise': 3000,
      'itemType': 'veg',
    },
    {'id': 'stock', 'name': 'Stock only', 'productType': 'purchase_only'},
    {'id': 'hidden', 'name': 'Hidden', 'activeOnApp': false},
  ],
  'orders': [],
  'orderItems': [],
  'kots': [],
};
void main() {
  setUpAll(() async {
    for (final entry in {
      'Roboto': 'Roboto-Regular.ttf',
      'MaterialIcons': 'MaterialIcons-Regular.otf',
    }.entries) {
      final bytes = await File('test/fixtures/${entry.value}').readAsBytes();
      final loader = FontLoader(entry.key)
        ..addFont(Future.value(ByteData.sublistView(bytes)));
      await loader.load();
    }
  });
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test('separate table drafts persist and retry IDs survive restart', () async {
    final store = CaptainDraftStore('out_test', 'cap1');
    final one = CaptainDraft(tableId: 't1');
    final two = CaptainDraft(tableId: 't2');
    one.add(fixture()['menuItems'][0], quantity: 5, note: 'Less sugar');
    two.add(fixture()['menuItems'][0], quantity: 2);
    final request = one.command();
    await store.save({'t1': one, 't2': two});
    final restored = await store.load();
    expect(restored['t1']!.count, 5);
    expect(restored['t2']!.count, 2);
    expect(restored['t1']!.command()['requestId'], request['requestId']);
    expect(restored['t1']!.pending, isTrue);
    restored['t1']!.add(fixture()['menuItems'][0]);
    expect(restored['t1']!.count, 5);
    expect(await CaptainDraftStore('different_outlet', 'cap1').load(), isEmpty);
  });
  test('section special price and premium match Desk', () {
    expect(
      menuSectionPrice(fixture()['menuItems'][0], fixture()['floors'][0]),
      3300,
    );
    expect(
      menuSectionPrice(
        {'pricePaise': 2000},
        {
          'menuPriceOption': 'special',
          'priceAdjustmentType': 'amount',
          'priceAdjustmentValue': 500,
        },
      ),
      2500,
    );
  });
  test(
    'command uses authenticated order-only endpoint and confirms matching receipt',
    () async {
      final draft = CaptainDraft(tableId: 't1')
        ..add(fixture()['menuItems'][0], quantity: 5);
      final cmd = draft.command();
      final api = CloudApi(
        session,
        client: MockClient((request) async {
          expect(request.url.path, '/api/v1/outlets/out_test/captain/commands');
          expect(request.headers['Authorization'], startsWith('Basic '));
          final body = jsonDecode(request.body) as Map;
          expect(body['items'][0]['quantity'], 5);
          expect(body.containsKey('payload'), isFalse);
          return http.Response(
            jsonEncode({
              'ok': true,
              'requestId': body['requestId'],
              'payload': fixture(),
            }),
            200,
          );
        }),
      );
      addTearDown(api.dispose);
      expect((await api.submitCaptainCommand(cmd))['outlet']['id'], 'out_test');
    },
  );
  test('missing endpoint and rejected order never look like success', () async {
    for (final status in [404, 409]) {
      final api = CloudApi(
        session,
        client: MockClient(
          (_) async => http.Response('{"error":"Table checked out"}', status),
        ),
      );
      addTearDown(api.dispose);
      await expectLater(
        api.submitCaptainCommand({'requestId': 'request-test'}),
        throwsA(isA<CaptainCommandRejected>()),
      );
    }
  });
  test('lost or mismatched acknowledgment is retryable, not success', () async {
    final api = CloudApi(
      session,
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({'ok': true, 'requestId': 'wrong', 'payload': fixture()}),
          200,
        ),
      ),
    );
    addTearDown(api.dispose);
    await expectLater(
      api.submitCaptainCommand({'requestId': 'right'}),
      throwsException,
    );
  });
  for (final size in [
    const Size(320, 640),
    const Size(390, 844),
    const Size(1280, 800),
  ]) {
    testWidgets(
      'captain orders and drafts fit ${size.width.toInt()}px screen',
      (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        Map<String, dynamic>? sent;
        await tester.pumpWidget(
          MaterialApp(
            theme: Brand.theme.copyWith(
              textTheme: Brand.theme.textTheme.apply(fontFamily: 'Roboto'),
            ),
            home: Scaffold(
              body: RepaintBoundary(
                key: const Key('captain'),
                child: ColoredBox(
                  color: Brand.background,
                  child: CaptainWorkspace(
                    snapshot: fixture(),
                    session: session,
                    onCommand: (cmd) async {
                      sent = cmd;
                      return fixture();
                    },
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('T1'));
        await tester.pumpAndSettle();
        expect(find.text('Stock only'), findsNothing);
        expect(find.text('Hidden'), findsNothing);
        for (var i = 0; i < 5; i++) {
          await tester.tap(find.byTooltip('Add Tea'));
          await tester.pumpAndSettle();
        }
        expect(find.textContaining('5 items •'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await expectLater(
          find.byKey(const Key('captain')),
          matchesGoldenFile('goldens/captain-${size.width.toInt()}.png'),
        );
        await tester.tap(find.byTooltip('Back to tables'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('T2'));
        await tester.pumpAndSettle();
        expect(find.textContaining('0 items •'), findsOneWidget);
        await tester.tap(find.byTooltip('Back to tables'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('T1'));
        await tester.pumpAndSettle();
        expect(find.textContaining('5 items •'), findsOneWidget);
        await tester.tap(find.text('Send order / KOT'));
        await tester.pumpAndSettle();
        expect((sent!['items'] as List).length, 1);
        expect(sent!['items'][0]['quantity'], 5);
        expect(find.text('Order confirmed on BhojPatra Desk'), findsOneWidget);
        expect(find.textContaining('0 items •'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'network failure keeps draft and retries exactly the same request',
    (tester) async {
      var attempts = 0;
      String? requestId;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CaptainWorkspace(
              snapshot: fixture(),
              session: session,
              onCommand: (command) async {
                attempts++;
                if (attempts == 1) {
                  requestId = command['requestId'] as String;
                  throw const SocketException('Wi-Fi lost');
                }
                expect(command['requestId'], requestId);
                return fixture();
              },
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('T1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Add Tea'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Send order / KOT'));
      await tester.pumpAndSettle();
      expect(find.text('Retry confirmation'), findsOneWidget);
      expect(find.textContaining('1 items •'), findsOneWidget);
      await tester.tap(find.text('Retry confirmation'));
      await tester.pumpAndSettle();
      expect(attempts, 2);
      expect(find.textContaining('0 items •'), findsOneWidget);
    },
  );
}
