import 'package:flutter/material.dart';
import '../theme/bhojpatra_theme.dart';
import '../models/restaurant_reports.dart';
import '../utils/utils.dart';

void showOrderDetails(
  BuildContext context,
  Map<String, dynamic> snapshot,
  Map<String, dynamic> order,
) {
  final items = listOf(
    snapshot['orderItems'],
  ).where((i) => i['orderId'] == order['id']).toList();
  final payments = listOf(
    snapshot['payments'],
  ).where((p) => p['orderId'] == order['id']).toList();
  final kots = listOf(
    snapshot['kots'],
  ).where((k) => k['orderId'] == order['id']).toList();
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (context) => SizedBox(
      height: MediaQuery.sizeOf(context).height * .8,
      child: Column(
        children: [
          ListTile(
            title: Text(
              text(order['orderNo']),
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            subtitle: Text(
              '${text(order['tableName'], fallback: 'Counter')} • ${text(order['status']).replaceAll('_', ' ')}',
            ),
            trailing: IconButton(
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.close),
            ),
          ),
          const Divider(),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(14),
              children: [
                if (text(order['customerName']).isNotEmpty)
                  Text(
                    '${order['customerName']} • ${text(order['customerPhone'])}',
                  ),
                for (final i in items)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      '${i['quantity']} × ${text(i['nameSnapshot'])}',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    subtitle: Text(
                      [
                        text(i['note']),
                        ...((i['modifiers'] as List?) ?? []).map(
                          (v) => v.toString(),
                        ),
                        text(i['status']),
                      ].where((s) => s.isNotEmpty).join(' • '),
                    ),
                    trailing: Text(
                      money(intValue(i['totalPaise'])),
                      style: TextStyle(
                        color: i['status'] == 'cancelled'
                            ? Colors.red
                            : Brand.navy,
                      ),
                    ),
                  ),
                const Divider(),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Bill total'),
                  trailing: Text(
                    money(billTotal(order)),
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Discount / tax'),
                  trailing: Text(
                    '${money(intValue(order['discountPaise']))} / ${money(intValue(order['taxPaise']))}',
                  ),
                ),
                if (payments.isNotEmpty)
                  const Text(
                    'Payments',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                for (final p in payments)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      '${text(p['method']).toUpperCase()} • ${text(p['status'])}',
                    ),
                    trailing: Text(money(intValue(p['amountPaise']))),
                  ),
                const SizedBox(height: 10),
                const Text(
                  'Kitchen tickets',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                for (final k in kots)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text('${text(k['kotNo'])} • ${text(k['status'])}'),
                    subtitle: Text(
                      '${text(k['captainName'])} • ${text(k['createdAt'])}',
                    ),
                  ),
                if (text(order['cancellationReason']).isNotEmpty)
                  Text('Cancellation: ${order['cancellationReason']}'),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class OrderActivity extends StatefulWidget {
  const OrderActivity({
    super.key,
    required this.snapshot,
    this.kitchen = false,
  });
  final Map<String, dynamic> snapshot;
  final bool kitchen;
  @override
  State<OrderActivity> createState() => _OrderActivityState();
}

class _OrderActivityState extends State<OrderActivity> {
  String search = '', filter = 'Live';
  @override
  Widget build(BuildContext context) {
    final rows =
        listOf(widget.snapshot[widget.kitchen ? 'kots' : 'orders']).where((o) {
          final status = text(o['status']);
          final live = !{
            'served',
            'paid',
            'cancelled',
            'void',
          }.contains(status);
          return (filter == 'All' ||
                  (filter == 'Live'
                      ? live
                      : widget.kitchen
                      ? status == 'ready'
                      : !live)) &&
              '${o['orderNo']} ${o['kotNo']} ${o['tableName']} ${o['captainName']}'
                  .toLowerCase()
                  .contains(search.toLowerCase());
        }).toList()..sort(
          (a, b) => text(b['createdAt']).compareTo(text(a['createdAt'])),
        );
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            onChanged: (v) => setState(() => search = v),
            decoration: const InputDecoration(
              hintText: 'Search table, order or staff',
              prefixIcon: Icon(Icons.search, size: 20),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
          child: Row(
            children: [
              for (final f in [
                'Live',
                widget.kitchen ? 'Ready' : 'Closed',
                'All',
              ])
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: ChoiceChip(
                    label: Text(f),
                    selected: filter == f,
                    onSelected: (_) => setState(() => filter = f),
                  ),
                ),
              const Spacer(),
              Text(
                '${rows.length}',
                style: const TextStyle(color: Brand.muted),
              ),
            ],
          ),
        ),
        Expanded(
          child: rows.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        widget.kitchen
                            ? Icons.soup_kitchen_outlined
                            : Icons.receipt_long_outlined,
                        size: 42,
                        color: Brand.border,
                      ),
                      const SizedBox(height: 10),
                      const Text(
                        'Nothing here yet',
                        style: TextStyle(color: Brand.muted),
                      ),
                    ],
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                  itemCount: rows.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, i) {
                    final o = rows[i];
                    return Card(
                      child: ListTile(
                        dense: true,
                        onTap: () {
                          final order = widget.kitchen
                              ? listOf(
                                  widget.snapshot['orders'],
                                ).firstWhereOrNull(
                                  (x) => x['id'] == o['orderId'],
                                )
                              : o;
                          if (order != null) {
                            showOrderDetails(context, widget.snapshot, order);
                          }
                        },
                        leading: Container(
                          width: 40,
                          height: 40,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: const Color(0xfffff1e8),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.receipt_long_outlined,
                            color: Brand.orange,
                            size: 21,
                          ),
                        ),
                        title: Text(
                          '${text(o[widget.kitchen ? 'kotNo' : 'orderNo'])} · ${text(o['tableName'], fallback: 'Counter')}',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        subtitle: Text(
                          '${text(o['status']).replaceAll('_', ' ')} • ${text(o['captainName'], fallback: 'Counter')}',
                        ),
                        trailing: widget.kitchen
                            ? Text(
                                '${listOf(o['items']).fold<int>(0, (s, x) => s + intValue(x['quantity']))} items',
                                style: const TextStyle(fontSize: 12),
                              )
                            : Text(
                                money(billTotal(o)),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12,
                                ),
                              ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}
