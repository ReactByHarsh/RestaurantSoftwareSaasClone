import 'package:flutter/material.dart';
import '../utils/utils.dart';

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: Colors.black54,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class MetricCard extends StatelessWidget {
  const MetricCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 165,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: const Color(0xfff36b21)),
              const SizedBox(height: 10),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                ),
              ),
              Text(
                label,
                style: const TextStyle(
                  color: Colors.black54,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class OrderTile extends StatelessWidget {
  const OrderTile({super.key, required this.order});

  final Map<String, dynamic> order;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        title: Text(
          '${text(order['orderNo'])}  ${text(order['tableName'])}',
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
        subtitle: Text(
          '${text(order['status'])} • ${text(order['captainName'], fallback: 'No captain')}',
        ),
        trailing: Text(
          money(intValue(order['totalPaise'])),
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
    );
  }
}

class TableGrid extends StatelessWidget {
  const TableGrid({
    super.key,
    required this.tables,
    this.selectedId,
    this.onTap,
    this.compact = false,
  });

  final List<Map<String, dynamic>> tables;
  final String? selectedId;
  final ValueChanged<Map<String, dynamic>>? onTap;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    if (tables.isEmpty) return const EmptyState(text: 'No tables found');
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: tables.length,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: MediaQuery.sizeOf(context).width > 720 ? 5 : 3,
        childAspectRatio: compact ? 1.45 : 1.2,
        crossAxisSpacing: 8,
        mainAxisSpacing: 8,
      ),
      itemBuilder: (context, index) {
        final table = tables[index];
        final status = text(table['status'], fallback: 'available');
        final color = switch (status) {
          'available' => Colors.green,
          'bill_requested' || 'payment_pending' => Colors.blue,
          'ready' => Colors.orange,
          _ => Colors.redAccent,
        };
        return InkWell(
          onTap: onTap == null ? null : () => onTap!(table),
          borderRadius: BorderRadius.circular(18),
          child: Ink(
            decoration: BoxDecoration(
              color: selectedId == text(table['id'])
                  ? const Color(0xfffff1d6)
                  : Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: color.withValues(alpha: .35),
                width: 1.4,
              ),
            ),
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  text(table['name']),
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                const Spacer(),
                Text(
                  status.replaceAll('_', ' '),
                  style: TextStyle(
                    color: color,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
