import 'dart:io';
import 'package:bhojpatra_mobile/models/restaurant_reports.dart';
import 'package:bhojpatra_mobile/screens/owner/owner_reports.dart';
import 'package:bhojpatra_mobile/screens/owner/overview_tab.dart';
import 'package:bhojpatra_mobile/theme/bhojpatra_theme.dart';
import 'package:bhojpatra_mobile/widgets/mobile_navigation.dart';
import 'package:bhojpatra_mobile/widgets/app_toast.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> reportFixture() {
  final today = dateKey(DateTime(2026, 10, 7));
  final yesterday = dateKey(DateTime(2026, 10, 6));
  return {
    'orders': [
      {
        'id': 'o1',
        'orderNo': 'ORD-0072',
        'tableName': 'AC4',
        'status': 'paid',
        'paymentStatus': 'paid',
        'businessDate': today,
        'createdAt': '${today}T08:00:00Z',
        'totalPaise': 12000,
        'tipPaise': 2000,
        'taxPaise': 500,
        'discountPaise': 1000,
      },
      {
        'id': 'o2',
        'orderNo': 'ORD-0073',
        'tableName': 'T2',
        'status': 'confirmed',
        'totalPaise': 5000,
        'businessDate': today,
      },
      {
        'id': 'cancel',
        'orderNo': 'ORD-0071',
        'tableName': 'T3',
        'status': 'cancelled',
        'totalPaise': 7000,
        'businessDate': today,
        'cancelledAt': '${today}T08:00:00Z',
        'cancellationReason': 'Guest changed plans',
      },
      {
        'id': 'old',
        'status': 'paid',
        'businessDate': yesterday,
        'totalPaise': 99900,
        'createdAt': '${yesterday}T08:00:00Z',
      },
    ],
    'orderItems': [
      {
        'id': 'i1',
        'orderId': 'o1',
        'menuItemId': 'tea',
        'nameSnapshot': 'Masala Tea',
        'quantity': 2,
        'totalPaise': 10000,
        'unitPricePaise': 5000,
        'status': 'served',
      },
    ],
    'payments': [
      {
        'orderId': 'o1',
        'method': 'cash',
        'status': 'success',
        'amountPaise': 10000,
        'createdAt': '${today}T08:00:00Z',
      },
      {
        'orderId': 'o1',
        'method': 'upi',
        'status': 'failed',
        'amountPaise': 9000,
        'createdAt': '${today}T08:00:00Z',
      },
      {
        'orderId': 'o2',
        'method': 'credit',
        'status': 'success',
        'amountPaise': 4000,
        'createdAt': '${today}T08:00:00Z',
      },
      {
        'orderId': 'old',
        'method': 'cash',
        'status': 'success',
        'amountPaise': 99900,
        'createdAt': '${yesterday}T08:00:00Z',
      },
    ],
    'expenses': [
      {
        'expenseDate': today,
        'type': 'salary',
        'amountPaise': 3000,
        'description': 'Shift salary',
        'paymentMode': 'cash',
      },
      {
        'expenseDate': today,
        'type': 'utilities',
        'amountPaise': 1000,
        'paymentMode': 'upi',
      },
    ],
    'inventoryItems': [
      {
        'name': 'Tea leaves',
        'currentStock': 2.5,
        'minimumStock': 3,
        'costPerUnit': 20000,
        'unit': 'kg',
      },
    ],
    'purchaseEntries': [
      {
        'itemName': 'Tea leaves',
        'createdAt': '${today}T08:00:00Z',
        'totalPaise': 6000,
      },
    ],
    'kots': [
      {'id': 'k1', 'status': 'new', 'orderId': 'o2'},
      {
        'id': 'k2',
        'kotNo': 'KOT-70',
        'orderNo': 'ORD-0072',
        'tableName': 'AC4',
        'status': 'cancelled',
        'cancelledAt': '${today}T08:00:00Z',
        'items': [
          {'orderItemId': 'i1', 'quantity': 1},
        ],
      },
    ],
    'tables': [
      {'id': 't1', 'activeOrderId': 'o2'},
      {'id': 't2'},
    ],
    'menuItems': [
      {'id': 'tea', 'categoryId': 'food'},
    ],
    'menuCategories': [
      {'id': 'food', 'name': 'Beverages'},
    ],
  };
}

void main() {
  setUpAll(() async {
    for (final e in {
      'Roboto': 'Roboto-Regular.ttf',
      'MaterialIcons': 'MaterialIcons-Regular.otf',
    }.entries) {
      final bytes = await File('test/fixtures/${e.value}').readAsBytes();
      final loader = FontLoader(e.key)
        ..addFont(Future.value(ByteData.sublistView(bytes)));
      await loader.load();
    }
  });
  test(
    'report ranges, tips, failed payments and credit match accounting rules',
    () {
      final today = DateTime(2026, 10, 7);
      final reports = RestaurantReports(reportFixture(), today, today);
      expect(reports.sales, 10000);
      expect(reports.paidOrders.length, 1);
      expect(reports.collected, 10000);
      expect(reports.expenseTotal, 4000);
      expect(reports.purchaseTotal, 6000);
      expect(reports.stockValue, 50000);
      expect(reports.lowStock, 1);
      expect(reports.products.single.count, 2);
      expect(reports.cancelledBills.length, 1);
      expect(reports.cancelledKots.length, 1);
      expect(reports.paymentModes.single.label, 'cash');
      expect(reports.salesTrend.single.value, 10000);
    },
  );
  test('empty data and date-only expenses are valid', () {
    final empty = RestaurantReports(
      {},
      DateTime(2026, 1),
      DateTime(2026, 12, 31),
    );
    expect(empty.sales, 0);
    expect(empty.collected, 0);
    expect(empty.products, isEmpty);
    expect(
      recordDate({'expenseDate': '2026-10-07'}, 'expenseDate'),
      '2026-10-07',
    );
  });
  test(
    'owners are recognized without captain-only entrypoint hiding their reports',
    () {
      for (final role in ['owner', 'admin', 'manager']) {
        expect(isOwnerRole(role), isTrue);
      }
      expect(isOwnerRole('captain'), isFalse);
    },
  );
  test(
    'network error is readable and does not expose raw transport exceptions',
    () {
      expect(
        friendlyError(const SocketException('Connection refused')),
        isNot(contains('SocketException')),
      );
      expect(
        friendlyError(const SocketException('Connection refused')),
        contains('draft is safe'),
      );
    },
  );
  for (final size in [
    const Size(320, 700),
    const Size(390, 844),
    const Size(1280, 800),
  ]) {
    testWidgets(
      'owner dashboard fits ${size.width.toInt()} and uses compact branded navigation',
      (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          MaterialApp(
            theme: Brand.theme.copyWith(
              textTheme: Brand.theme.textTheme.apply(fontFamily: 'Roboto'),
            ),
            home: RepaintBoundary(
              key: const Key('owner'),
              child: Scaffold(
                appBar: AppBar(
                  title: const Row(
                    children: [
                      BrandLogo(size: 32),
                      SizedBox(width: 8),
                      Text('BhojPatra'),
                    ],
                  ),
                ),
                body: OverviewTab(
                  snapshot: reportFixture(),
                  onRefresh: () async {},
                  now: DateTime(2026, 10, 7),
                ),
                bottomNavigationBar: MobileNavigation(
                  owner: true,
                  index: 0,
                  onSelect: (_) {},
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Reports'), findsOneWidget);
        expect(find.text('Captain'), findsNothing);
        expect(tester.takeException(), isNull);
        await expectLater(
          find.byKey(const Key('owner')),
          matchesGoldenFile('goldens/owner-${size.width.toInt()}.png'),
        );
      },
    );
  }
  testWidgets(
    'owner can select all eight reports and drill into product bills',
    (tester) async {
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          theme: Brand.theme,
          home: Scaffold(
            body: OwnerReports(
              snapshot: reportFixture(),
              onRefresh: () async {},
              now: DateTime(2026, 10, 7),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
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
      await tester.ensureVisible(find.widgetWithText(ChoiceChip, 'Products'));
      await tester.tap(find.widgetWithText(ChoiceChip, 'Products'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Masala Tea'));
      await tester.pumpAndSettle();
      expect(find.text('ORD-0072 • AC4'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
