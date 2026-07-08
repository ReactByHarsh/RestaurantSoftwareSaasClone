import 'package:flutter/material.dart';
import '../../utils/utils.dart';
import '../../widgets/common_widgets.dart';

class OverviewTab extends StatelessWidget {
  const OverviewTab({
    super.key,
    required this.snapshot,
    required this.onRefresh,
  });

  final Map<String, dynamic> snapshot;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final orders = listOf(snapshot['orders']);
    final payments = listOf(snapshot['payments']);
    final tables = listOf(snapshot['tables']);
    final kots = listOf(snapshot['kots']);

    final today = DateTime.now().toIso8601String().substring(0, 10);
    final todayOrders = orders
        .where((order) => text(order['businessDate']).startsWith(today))
        .toList();
    final paid = payments.fold<int>(
      0,
      (sum, payment) => sum + intValue(payment['amountPaise']),
    );
    final openTables = tables
        .where((table) => text(table['status']) != 'available')
        .length;

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SectionTitle('Today\'s Performance'),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              MetricCard(
                label: 'Sales',
                value: money(paid),
                icon: Icons.currency_rupee,
              ),
              MetricCard(
                label: 'Orders',
                value: '${todayOrders.length}',
                icon: Icons.receipt_long,
              ),
              MetricCard(
                label: 'Busy tables',
                value: '$openTables/${tables.length}',
                icon: Icons.table_bar,
              ),
              MetricCard(
                label: 'Live KOTs',
                value:
                    '${kots.where((kot) => text(kot['status']) != 'served').length}',
                icon: Icons.restaurant,
              ),
            ],
          ),
          const SizedBox(height: 24),
          const SectionTitle('Recent Orders'),
          if (orders.isEmpty)
            const EmptyState(
              text: 'No orders synced yet. Open desktop cloud sync once.',
            )
          else
            ...orders.reversed.take(12).map((order) => OrderTile(order: order)),
        ],
      ),
    );
  }
}
