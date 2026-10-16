import 'package:flutter/material.dart';
import '../../models/restaurant_reports.dart';
import '../../theme/bhojpatra_theme.dart';
import '../../utils/utils.dart';
import '../../widgets/report_widgets.dart';
import '../order_activity.dart';

class OverviewTab extends StatelessWidget {
  const OverviewTab({
    super.key,
    required this.snapshot,
    required this.onRefresh,
    this.now,
  });
  final Map<String, dynamic> snapshot;
  final Future<void> Function() onRefresh;
  final DateTime? now;
  @override
  Widget build(BuildContext context) {
    final today = DateUtils.dateOnly(now ?? DateTime.now());
    final r = RestaurantReports(snapshot, today, today);
    final week = RestaurantReports(
      snapshot,
      today.subtract(const Duration(days: 6)),
      today,
    );
    final tables = listOf(snapshot['tables']);
    final busy = tables
        .where((t) => text(t['activeOrderId']).isNotEmpty)
        .length;
    final live = listOf(
      snapshot['kots'],
    ).where((k) => !{'cancelled', 'served'}.contains(k['status'])).length;
    final recent = listOf(snapshot['orders'])
      ..sort((a, b) => text(b['createdAt']).compareTo(text(a['createdAt'])));
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(12),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Brand.navy,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'TODAY AT A GLANCE',
                  style: TextStyle(
                    color: Color(0xff94a3b8),
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  money(r.sales),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 32,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  '${r.paidOrders.length} settled bills  ·  ${money(r.collected)} collected',
                  style: const TextStyle(
                    color: Color(0xffcbd5e1),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          MetricGrid(
            values: [
              (
                'Busy tables',
                '$busy / ${tables.length}',
                Icons.table_restaurant_outlined,
                Brand.orange,
              ),
              (
                'Kitchen tickets',
                '$live',
                Icons.soup_kitchen_outlined,
                Brand.green,
              ),
              (
                'Today’s expenses',
                money(r.expenseTotal),
                Icons.money_off,
                const Color(0xffe11d48),
              ),
              (
                'Stock alerts',
                '${r.lowStock}',
                Icons.inventory_2_outlined,
                const Color(0xff7c3aed),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ReportPanel(
            title: 'Sales · last 7 days',
            subtitle: 'Tap a bar for the exact bill sales value.',
            child: InteractiveBars(values: week.salesTrend),
          ),
          const SizedBox(height: 12),
          ReportPanel(
            title: 'Today’s payments',
            child: PaymentDonut(values: r.paymentModes),
          ),
          const SizedBox(height: 12),
          ReportPanel(
            title: 'Recent bills',
            child: Column(
              children: [
                if (recent.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(12),
                    child: Text(
                      'No orders yet',
                      style: TextStyle(color: Brand.muted),
                    ),
                  ),
                for (final o in recent.take(8))
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: Text(
                      '${text(o['orderNo'])} · ${text(o['tableName'], fallback: 'Counter')}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    subtitle: Text(text(o['status']).replaceAll('_', ' ')),
                    trailing: Text(
                      money(billTotal(o)),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    onTap: () => showOrderDetails(context, snapshot, o),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
