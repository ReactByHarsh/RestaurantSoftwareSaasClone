import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../models/restaurant_reports.dart';
import '../../theme/bhojpatra_theme.dart';
import '../../utils/utils.dart';
import '../../widgets/report_widgets.dart';
import '../../widgets/app_toast.dart';
import '../order_activity.dart';

class OwnerReports extends StatefulWidget {
  const OwnerReports({
    super.key,
    required this.snapshot,
    required this.onRefresh,
    this.now,
  });
  final Map<String, dynamic> snapshot;
  final Future<void> Function() onRefresh;
  final DateTime? now;
  @override
  State<OwnerReports> createState() => _OwnerReportsState();
}

class _OwnerReportsState extends State<OwnerReports> {
  late DateTime from, to;
  @override
  void initState() {
    super.initState();
    from = DateUtils.dateOnly(widget.now ?? DateTime.now());
    to = from;
  }

  String tab = 'Sales', period = 'Today';
  static const tabs = [
    'Sales',
    'Products',
    'Payments',
    'Expenses',
    'Stock',
    'Purchases',
    'Cancellations',
    'Summary',
  ];
  void _period(String value) {
    final now = DateUtils.dateOnly(widget.now ?? DateTime.now());
    setState(() {
      period = value;
      to = now;
      from = value == '7 days'
          ? now.subtract(const Duration(days: 6))
          : value == 'Month'
          ? DateTime(now.year, now.month)
          : now;
    });
  }

  Future<void> _range() async {
    final range = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      initialDateRange: DateTimeRange(start: from, end: to),
    );
    if (range != null && mounted) {
      setState(() {
        from = range.start;
        to = range.end;
        period = 'Custom';
      });
    }
  }

  void _rows(String title, List<Widget> rows) => showModalBottomSheet<void>(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => SizedBox(
      height: MediaQuery.sizeOf(context).height * .75,
      child: Column(
        children: [
          ListTile(
            title: Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            trailing: IconButton(
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.close),
            ),
          ),
          const Divider(),
          Expanded(
            child: rows.isEmpty
                ? const Center(child: Text('No records'))
                : ListView(children: rows),
          ),
        ],
      ),
    ),
  );
  List<Widget> _orderRows(List<Map<String, dynamic>> rows) => rows
      .map(
        (o) => ListTile(
          dense: true,
          title: Text(
            '${text(o['orderNo'])} • ${text(o['tableName'], fallback: 'Counter')}',
          ),
          subtitle: Text('${text(o['businessDate'])} • ${text(o['status'])}'),
          trailing: Text(money(billTotal(o))),
          onTap: () => showOrderDetails(context, widget.snapshot, o),
        ),
      )
      .toList();

  Widget _summary(RestaurantReports r) {
    final cashIn = r.payments
        .where((p) => p['method'] == 'cash')
        .fold<int>(0, (s, p) => s + intValue(p['amountPaise']));
    final cashOut = r.expenses
        .where((e) => e['paymentMode'] == 'cash')
        .fold<int>(0, (s, e) => s + intValue(e['amountPaise']));
    final categoryIds = {
      for (final m in listOf(widget.snapshot['menuItems']))
        m['id']: m['categoryId'],
    };
    final categories = {
      for (final c in listOf(widget.snapshot['menuCategories']))
        c['id']: c['name'],
    };
    final categoriesRows = r.items
        .map(
          (i) => {
            ...i,
            'category': categories[categoryIds[i['menuItemId']]] ?? 'Other',
          },
        )
        .toList();
    return Column(
      children: [
        MetricGrid(
          values: [
            (
              'Bills settled',
              '${r.paidOrders.length}',
              Icons.receipt_outlined,
              Brand.orange,
            ),
            (
              'Items sold',
              '${r.items.fold<int>(0, (s, i) => s + intValue(i['quantity']))}',
              Icons.shopping_bag_outlined,
              Brand.green,
            ),
            (
              'Sales less expenses',
              money(r.sales - r.expenseTotal),
              Icons.trending_up,
              Brand.green,
            ),
            (
              'Cash less expenses',
              money(cashIn - cashOut),
              Icons.account_balance_wallet_outlined,
              const Color(0xff2563eb),
            ),
          ],
        ),
        const SizedBox(height: 10),
        ReportPanel(
          title: 'Business summary',
          subtitle:
              'Sales less expenses is not accounting profit; purchases and cost of goods are separate.',
          child: Column(
            children: [
              _value('Bill sales (tips excluded)', r.sales),
              _value('Taxes in bills', r.taxes),
              _value('Discounts', r.discounts),
              _value('Successful collections', r.collected),
              _value('Recorded expenses', r.expenseTotal),
              _value('Purchases', r.purchaseTotal),
              _value(
                'Average bill',
                r.paidOrders.isEmpty
                    ? 0
                    : (r.sales / r.paidOrders.length).round(),
              ),
              _value(
                'Cancelled bill amount',
                r.cancelledBills.fold<int>(0, (s, o) => s + billTotal(o)),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        ReportPanel(
          title: 'Category sales',
          child: InteractiveBars(
            values: r.group(categoriesRows, 'category', 'totalPaise'),
          ),
        ),
      ],
    );
  }

  Widget _value(String name, int amount) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Row(
      children: [
        Expanded(child: Text(name, style: const TextStyle(fontSize: 12))),
        Text(
          money(amount),
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
        ),
      ],
    ),
  );
  Future<void> _copyReport(RestaurantReports r) async {
    final csv = <List<Object?>>[
      ['BhojPatra', tab, dateKey(from), dateKey(to)],
    ];
    switch (tab) {
      case 'Products':
        csv.add(['Product', 'Quantity', 'Amount (INR)']);
        csv.addAll(
          r.products.map(
            (v) => [v.label, v.count, (v.value / 100).toStringAsFixed(2)],
          ),
        );
      case 'Payments':
        csv.add(['Mode', 'Transactions', 'Collected (INR)']);
        csv.addAll(
          r.paymentModes.map(
            (v) => [v.label, v.count, (v.value / 100).toStringAsFixed(2)],
          ),
        );
      case 'Expenses':
        csv.add(['Date', 'Type', 'Description', 'Amount (INR)']);
        csv.addAll(
          r.expenses.map(
            (e) => [
              e['expenseDate'],
              e['type'],
              e['description'],
              (intValue(e['amountPaise']) / 100).toStringAsFixed(2),
            ],
          ),
        );
      case 'Stock':
        csv.add(['Item', 'Stock', 'Unit', 'Minimum']);
        csv.addAll(
          r.inventory.map(
            (i) => [i['name'], i['currentStock'], i['unit'], i['minimumStock']],
          ),
        );
      case 'Purchases':
        csv.add(['Date', 'Item', 'Supplier', 'Amount (INR)']);
        csv.addAll(
          r.purchases.map(
            (p) => [
              recordDate(p),
              p['itemName'],
              p['supplier'],
              (intValue(p['totalPaise']) / 100).toStringAsFixed(2),
            ],
          ),
        );
      case 'Cancellations':
        csv.add(['Type', 'Number', 'Table', 'Reason']);
        csv.addAll(
          r.cancelledBills.map(
            (o) => [
              'Bill',
              o['orderNo'],
              o['tableName'],
              o['cancellationReason'],
            ],
          ),
        );
        csv.addAll(
          r.cancelledKots.map(
            (k) => ['KOT', k['kotNo'], k['tableName'], k['cancellationReason']],
          ),
        );
      case 'Summary':
        csv.add(['Metric', 'Amount (INR)']);
        csv.addAll(
          [
            ['Sales', r.sales],
            ['Collections', r.collected],
            ['Expenses', r.expenseTotal],
            ['Purchases', r.purchaseTotal],
            ['Taxes', r.taxes],
            ['Discounts', r.discounts],
          ].map((v) => [v[0], ((v[1] as int) / 100).toStringAsFixed(2)]),
        );
      default:
        csv.add(['Bill', 'Date', 'Table', 'Total (INR)']);
        csv.addAll(
          r.paidOrders.map(
            (o) => [
              o['orderNo'],
              o['businessDate'],
              o['tableName'],
              (billTotal(o) / 100).toStringAsFixed(2),
            ],
          ),
        );
    }
    await Clipboard.setData(
      ClipboardData(
        text: csv
            .map(
              (row) => row
                  .map((v) => '"${text(v).replaceAll('"', '""')}"')
                  .join(','),
            )
            .join('\n'),
      ),
    );
    if (mounted) {
      appToast(
        context,
        'Report copied as CSV. Paste into Sheets or a message.',
      );
    }
  }

  Widget _content(RestaurantReports r) {
    switch (tab) {
      case 'Products':
        return ReportPanel(
          title: 'Product sales',
          subtitle:
              'Tap a product to view its bills · ${r.products.length} products',
          child: Column(
            children: [
              InteractiveBars(
                values: r.products,
                onSelect: (v) {
                  final ids = r.items
                      .where(
                        (i) =>
                            text(
                              i['menuItemId'],
                              fallback: text(i['nameSnapshot']),
                            ) ==
                            v.id,
                      )
                      .map((i) => i['orderId'])
                      .toSet();
                  _rows(
                    '${v.label} • ${v.count} sold',
                    _orderRows(
                      r.paidOrders.where((o) => ids.contains(o['id'])).toList(),
                    ),
                  );
                },
              ),
              for (final v in r.products.skip(12))
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(v.label),
                  subtitle: Text('${v.count} sold'),
                  trailing: Text(money(v.value.round())),
                  onTap: () {
                    final ids = r.items
                        .where(
                          (i) =>
                              text(
                                i['menuItemId'],
                                fallback: text(i['nameSnapshot']),
                              ) ==
                              v.id,
                        )
                        .map((i) => i['orderId'])
                        .toSet();
                    _rows(
                      v.label,
                      _orderRows(
                        r.paidOrders
                            .where((o) => ids.contains(o['id']))
                            .toList(),
                      ),
                    );
                  },
                ),
            ],
          ),
        );
      case 'Payments':
        return Column(
          children: [
            MetricGrid(
              values: [
                (
                  'Collected',
                  money(r.collected),
                  Icons.payments_outlined,
                  Brand.green,
                ),
                (
                  'Transactions',
                  '${r.payments.length}',
                  Icons.credit_card_outlined,
                  Brand.orange,
                ),
              ],
            ),
            const SizedBox(height: 10),
            ReportPanel(
              title: 'Payment split',
              subtitle:
                  'Successful collections by transaction date. Credit is not cash received.',
              child: PaymentDonut(values: r.paymentModes),
            ),
            const SizedBox(height: 10),
            ReportPanel(
              title: 'Collections by mode',
              child: InteractiveBars(
                values: r.paymentModes,
                color: Brand.green,
                onSelect: (v) => _rows(
                  '${v.label.toUpperCase()} payments',
                  r.payments
                      .where((p) => p['method'] == v.label)
                      .map(
                        (p) => ListTile(
                          dense: true,
                          title: Text(
                            text(
                              listOf(
                                widget.snapshot['orders'],
                              ).firstWhereOrNull(
                                (o) => o['id'] == p['orderId'],
                              )?['orderNo'],
                              fallback: text(p['orderId']),
                            ),
                          ),
                          subtitle: Text(
                            '${recordDate(p)} • ${text(p['referenceNo'])}',
                          ),
                          trailing: Text(money(intValue(p['amountPaise']))),
                        ),
                      )
                      .toList(),
                ),
              ),
            ),
          ],
        );
      case 'Expenses':
        final months = r.expenses
            .map(
              (e) => {
                ...e,
                'month': text(
                  e['expenseDate'],
                ).substring(0, text(e['expenseDate']).length.clamp(0, 7)),
              },
            )
            .toList();
        return Column(
          children: [
            MetricGrid(
              values: [
                (
                  'Expenses',
                  money(r.expenseTotal),
                  Icons.money_off,
                  const Color(0xffe11d48),
                ),
                (
                  'Entries',
                  '${r.expenses.length}',
                  Icons.receipt_long_outlined,
                  Brand.orange,
                ),
              ],
            ),
            const SizedBox(height: 10),
            ReportPanel(
              title: 'Expenses by type',
              child: InteractiveBars(
                values: r.expenseTypes,
                color: const Color(0xffe11d48),
                onSelect: (v) => _rows(
                  v.label,
                  r.expenses
                      .where((e) => e['type'] == v.label)
                      .map(
                        (e) => ListTile(
                          dense: true,
                          title: Text(
                            text(e['description'], fallback: v.label),
                          ),
                          subtitle: Text(
                            '${text(e['expenseDate'])} • ${text(e['paymentMode'])}',
                          ),
                          trailing: Text(money(intValue(e['amountPaise']))),
                        ),
                      )
                      .toList(),
                ),
              ),
            ),
            const SizedBox(height: 10),
            ReportPanel(
              title: 'Daily expenses',
              child: InteractiveBars(
                values: r.expenseTrend,
                color: const Color(0xffe11d48),
                limit: 31,
              ),
            ),
            const SizedBox(height: 10),
            ReportPanel(
              title: 'Monthly expenses',
              child: InteractiveBars(
                values: r.group(months, 'month', 'amountPaise'),
              ),
            ),
          ],
        );
      case 'Stock':
        final values =
            r.inventory
                .map(
                  (i) => ReportValue(
                    text(i['name']),
                    ((i['currentStock'] as num? ?? 0) *
                            (i['costPerUnit'] as num? ?? 0))
                        .round(),
                  ),
                )
                .toList()
              ..sort((a, b) => b.value.compareTo(a.value));
        return Column(
          children: [
            MetricGrid(
              values: [
                (
                  'Current stock value',
                  money(r.stockValue),
                  Icons.inventory_2_outlined,
                  Brand.green,
                ),
                (
                  'Low / empty stock',
                  '${r.lowStock}',
                  Icons.warning_amber,
                  const Color(0xffe11d48),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ReportPanel(
              title: 'Current stock value',
              subtitle:
                  'Live stock snapshot, not a historical balance for the date range.',
              child: InteractiveBars(values: values, color: Brand.green),
            ),
            const SizedBox(height: 10),
            ReportPanel(
              title: 'Stock levels',
              child: Column(
                children: [
                  for (final i in r.inventory)
                    ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        (i['currentStock'] as num? ?? 0) <=
                                (i['minimumStock'] as num? ?? 0)
                            ? Icons.warning_amber
                            : Icons.check_circle_outline,
                        size: 18,
                        color:
                            (i['currentStock'] as num? ?? 0) <=
                                (i['minimumStock'] as num? ?? 0)
                            ? Colors.red
                            : Brand.green,
                      ),
                      title: Text(
                        text(i['name']),
                        style: const TextStyle(fontSize: 12),
                      ),
                      subtitle: Text('Minimum: ${i['minimumStock']}'),
                      trailing: Text('${i['currentStock']} ${text(i['unit'])}'),
                    ),
                ],
              ),
            ),
          ],
        );
      case 'Purchases':
        return Column(
          children: [
            MetricGrid(
              values: [
                (
                  'Purchase total',
                  money(r.purchaseTotal),
                  Icons.shopping_cart_outlined,
                  Brand.orange,
                ),
                (
                  'Entries',
                  '${r.purchases.length}',
                  Icons.receipt_outlined,
                  Brand.green,
                ),
              ],
            ),
            const SizedBox(height: 10),
            ReportPanel(
              title: 'Purchase trend',
              child: InteractiveBars(values: r.purchaseTrend, limit: 31),
            ),
            const SizedBox(height: 10),
            ReportPanel(
              title: 'Purchase register',
              child: Column(
                children: [
                  for (final p in r.purchases)
                    ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text(text(p['itemName'])),
                      subtitle: Text(
                        '${recordDate(p)} • ${text(p['supplier'])} • ${text(p['invoiceNo'])}',
                      ),
                      trailing: Text(
                        money(intValue(p['totalPaise'])),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                ],
              ),
            ),
          ],
        );
      case 'Cancellations':
        final orderItems = listOf(widget.snapshot['orderItems']);
        final kotRows = r.cancelledKots
            .map(
              (k) => {
                ...k,
                'date': recordDate(
                  k,
                  k['cancelledAt'] == null ? 'createdAt' : 'cancelledAt',
                ),
                'amount': listOf(k['items']).fold<int>(
                  0,
                  (s, i) =>
                      s +
                      intValue(
                            orderItems.firstWhereOrNull(
                              (x) => x['id'] == i['orderItemId'],
                            )?['unitPricePaise'],
                          ) *
                          intValue(i['quantity']),
                ),
              },
            )
            .toList();
        return Column(
          children: [
            MetricGrid(
              values: [
                (
                  'Cancelled bills',
                  '${r.cancelledBills.length}',
                  Icons.cancel_outlined,
                  const Color(0xffe11d48),
                ),
                (
                  'Cancelled KOTs',
                  '${r.cancelledKots.length}',
                  Icons.receipt_long_outlined,
                  Brand.orange,
                ),
              ],
            ),
            const SizedBox(height: 10),
            ReportPanel(
              title: 'Cancelled KOT amounts',
              subtitle: 'Item-rate value, separate from cancelled bill totals.',
              child: InteractiveBars(
                values: r.group(kotRows, 'date', 'amount', date: true),
                color: const Color(0xffe11d48),
              ),
            ),
            const SizedBox(height: 10),
            ReportPanel(
              title: 'Bill cancellations',
              child: Column(
                children: [
                  if (r.cancelledBills.isEmpty)
                    const Text('No cancelled bills'),
                  for (final o in r.cancelledBills)
                    ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        '${text(o['orderNo'])} • ${text(o['tableName'])}',
                      ),
                      subtitle: Text(
                        text(
                          o['cancellationReason'],
                          fallback: 'No reason recorded',
                        ),
                      ),
                      trailing: Text(money(billTotal(o))),
                      onTap: () =>
                          showOrderDetails(context, widget.snapshot, o),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            ReportPanel(
              title: 'KOT cancellations',
              child: Column(
                children: [
                  if (kotRows.isEmpty) const Text('No cancelled KOTs'),
                  for (final k in kotRows)
                    ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        '${text(k['kotNo'])} • ${text(k['orderNo'])} • ${text(k['tableName'])}',
                      ),
                      subtitle: Text(
                        text(
                          k['cancellationReason'],
                          fallback: 'No reason recorded',
                        ),
                      ),
                      trailing: Text(money(intValue(k['amount']))),
                    ),
                ],
              ),
            ),
          ],
        );
      case 'Summary':
        return _summary(r);
      default:
        return Column(
          children: [
            MetricGrid(
              values: [
                ('Sales', money(r.sales), Icons.currency_rupee, Brand.orange),
                (
                  'Settled bills',
                  '${r.paidOrders.length}',
                  Icons.receipt_long_outlined,
                  Brand.green,
                ),
                (
                  'Discounts',
                  money(r.discounts),
                  Icons.discount_outlined,
                  const Color(0xff7c3aed),
                ),
                (
                  'Taxes',
                  money(r.taxes),
                  Icons.account_balance_outlined,
                  const Color(0xff2563eb),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ReportPanel(
              title: 'Daily sales',
              subtitle:
                  'Tap a day to view its bills. Settled bills, excluding tips.',
              child: InteractiveBars(
                values: r.salesTrend,
                limit: 31,
                onSelect: (v) => _rows(
                  v.label,
                  _orderRows(
                    r.paidOrders
                        .where(
                          (o) =>
                              (recordDate(o, 'businessDate').isNotEmpty
                                  ? recordDate(o, 'businessDate')
                                  : recordDate(o)) ==
                              v.label,
                        )
                        .toList(),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 10),
            ReportPanel(
              title: 'Bill register',
              child: Column(
                children: [
                  ..._orderRows(r.paidOrders.take(30).toList()),
                  if (r.paidOrders.length > 30)
                    TextButton(
                      onPressed: () =>
                          _rows('All settled bills', _orderRows(r.paidOrders)),
                      child: Text('View all ${r.paidOrders.length} bills'),
                    ),
                ],
              ),
            ),
          ],
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final reports = RestaurantReports(widget.snapshot, from, to);
    return Column(
      children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
          child: Column(
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Reports',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Copy report CSV',
                    onPressed: () => _copyReport(reports),
                    icon: const Icon(Icons.copy_outlined, size: 18),
                  ),
                  TextButton.icon(
                    onPressed: _range,
                    icon: const Icon(Icons.date_range_outlined, size: 17),
                    label: Text(
                      '${dateKey(from).substring(5)} – ${dateKey(to).substring(5)}',
                      style: const TextStyle(fontSize: 11),
                    ),
                  ),
                ],
              ),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final p in ['Today', '7 days', 'Month', 'Custom'])
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: ChoiceChip(
                          label: Text(p),
                          selected: period == p,
                          onSelected: (_) =>
                              p == 'Custom' ? _range() : _period(p),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              for (final t in tabs)
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: ChoiceChip(
                    label: Text(t),
                    selected: tab == t,
                    onSelected: (_) => setState(() => tab = t),
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: widget.onRefresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
              children: [_content(reports)],
            ),
          ),
        ),
      ],
    );
  }
}
