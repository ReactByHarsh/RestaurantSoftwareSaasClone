import '../utils/utils.dart';

String dateKey(DateTime value) =>
    '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
String recordDate(Map<String, dynamic> record, [String field = 'createdAt']) {
  final raw = text(record[field]);
  // Business/expense dates are already restaurant-local date-only values.
  if (raw.length == 10) return raw;
  final parsed = DateTime.tryParse(raw);
  return parsed == null ? '' : dateKey(parsed.toLocal());
}

int billTotal(Map<String, dynamic> order) =>
    (intValue(order['totalPaise']) -
            intValue(order['tipPaise']).clamp(0, 1 << 53))
        .clamp(0, 1 << 53);

class ReportValue {
  const ReportValue(this.label, this.value, {this.count = 0, this.id});
  final String label;
  final num value;
  final num count;
  final String? id;
}

/// Read-only, shared date/accounting rules for every owner report.
class RestaurantReports {
  RestaurantReports(this.snapshot, this.from, this.to) {
    final allOrders = listOf(snapshot['orders']);
    orders = allOrders
        .where(
          (o) => inRange(
            recordDate(o, 'businessDate').isNotEmpty
                ? recordDate(o, 'businessDate')
                : recordDate(o),
          ),
        )
        .toList();
    paidOrders = orders
        .where(
          (o) =>
              !{'cancelled', 'void'}.contains(o['status']) &&
              (o['status'] == 'paid' || o['paymentStatus'] == 'paid'),
        )
        .toList();
    final paidIds = paidOrders.map((o) => o['id']).toSet();
    items = listOf(snapshot['orderItems'])
        .where(
          (i) => paidIds.contains(i['orderId']) && i['status'] != 'cancelled',
        )
        .toList();
    payments = listOf(snapshot['payments'])
        .where(
          (p) =>
              p['status'] == 'success' &&
              !{
                'credit',
                'account',
                'pay_later',
                'complimentary',
              }.contains(p['method']) &&
              inRange(recordDate(p)),
        )
        .toList();
    expenses = listOf(
      snapshot['expenses'],
    ).where((e) => inRange(recordDate(e, 'expenseDate'))).toList();
    purchases = listOf(
      snapshot['purchaseEntries'],
    ).where((p) => inRange(recordDate(p))).toList();
    cancelledBills = allOrders
        .where(
          (o) =>
              o['status'] == 'cancelled' &&
              inRange(
                recordDate(
                  o,
                  o['cancelledAt'] == null ? 'updatedAt' : 'cancelledAt',
                ),
              ),
        )
        .toList();
    cancelledKots = listOf(snapshot['kots'])
        .where(
          (k) =>
              k['status'] == 'cancelled' &&
              inRange(
                recordDate(
                  k,
                  k['cancelledAt'] == null ? 'createdAt' : 'cancelledAt',
                ),
              ),
        )
        .toList();
  }
  final Map<String, dynamic> snapshot;
  final DateTime from, to;
  late final List<Map<String, dynamic>> orders,
      paidOrders,
      items,
      payments,
      expenses,
      purchases,
      cancelledBills,
      cancelledKots;
  bool inRange(String date) =>
      date.isNotEmpty &&
      date.compareTo(dateKey(from)) >= 0 &&
      date.compareTo(dateKey(to)) <= 0;
  int get sales => paidOrders.fold(0, (s, o) => s + billTotal(o));
  int get expenseTotal =>
      expenses.fold(0, (s, e) => s + intValue(e['amountPaise']));
  int get purchaseTotal =>
      purchases.fold(0, (s, e) => s + intValue(e['totalPaise']));
  int get collected =>
      payments.fold(0, (s, e) => s + intValue(e['amountPaise']));
  int get discounts =>
      paidOrders.fold(0, (s, e) => s + intValue(e['discountPaise']));
  int get taxes => paidOrders.fold(0, (s, e) => s + intValue(e['taxPaise']));
  List<Map<String, dynamic>> get inventory =>
      listOf(snapshot['inventoryItems']);
  int get stockValue => inventory.fold(
    0,
    (s, i) =>
        s +
        ((i['currentStock'] as num? ?? 0) * (i['costPerUnit'] as num? ?? 0))
            .round(),
  );
  int get lowStock => inventory
      .where(
        (i) =>
            (i['currentStock'] as num? ?? 0) <=
            (i['minimumStock'] as num? ?? 0),
      )
      .length;

  List<ReportValue> group(
    List<Map<String, dynamic>> rows,
    String labelField,
    String amountField, {
    bool date = false,
  }) {
    final amounts = <String, num>{}, counts = <String, num>{};
    for (final row in rows) {
      final key = date
          ? recordDate(row, labelField)
          : text(row[labelField], fallback: 'Other');
      amounts[key] = (amounts[key] ?? 0) + (row[amountField] as num? ?? 0);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    final result = amounts.entries
        .map((e) => ReportValue(e.key, e.value, count: counts[e.key] ?? 0))
        .toList();
    result.sort(
      date
          ? (a, b) => a.label.compareTo(b.label)
          : (a, b) => b.value.compareTo(a.value),
    );
    return result;
  }

  List<ReportValue> get salesTrend {
    final totals = <String, int>{};
    for (final o in paidOrders) {
      final d = recordDate(o, 'businessDate').isNotEmpty
          ? recordDate(o, 'businessDate')
          : recordDate(o);
      totals[d] = (totals[d] ?? 0) + billTotal(o);
    }
    return totals.entries.map((e) => ReportValue(e.key, e.value)).toList()
      ..sort((a, b) => a.label.compareTo(b.label));
  }

  List<ReportValue> get products {
    final grouped = <String, ReportValue>{};
    for (final i in items) {
      final id = text(i['menuItemId'], fallback: text(i['nameSnapshot']));
      final old = grouped[id];
      grouped[id] = ReportValue(
        text(i['nameSnapshot']),
        (old?.value ?? 0) + intValue(i['totalPaise']),
        count: (old?.count ?? 0) + intValue(i['quantity']),
        id: id,
      );
    }
    return grouped.values.toList()..sort((a, b) => b.value.compareTo(a.value));
  }

  List<ReportValue> get paymentModes =>
      group(payments, 'method', 'amountPaise');
  List<ReportValue> get expenseTypes => group(expenses, 'type', 'amountPaise');
  List<ReportValue> get expenseTrend =>
      group(expenses, 'expenseDate', 'amountPaise', date: true);
  List<ReportValue> get purchaseTrend =>
      group(purchases, 'createdAt', 'totalPaise', date: true);
}
