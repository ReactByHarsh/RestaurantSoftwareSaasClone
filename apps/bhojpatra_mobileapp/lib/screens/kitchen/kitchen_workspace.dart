import 'package:flutter/material.dart';

import '../../utils/utils.dart';

class KitchenWorkspace extends StatefulWidget {
  const KitchenWorkspace({
    super.key,
    required this.snapshot,
    required this.onSave,
  });

  final Map<String, dynamic> snapshot;
  final Future<void> Function(Map<String, dynamic>) onSave;

  @override
  State<KitchenWorkspace> createState() => _KitchenWorkspaceState();
}

class _KitchenWorkspaceState extends State<KitchenWorkspace> {
  String? _updatingKotId;

  Future<void> _setStatus(Map<String, dynamic> sourceKot, String status) async {
    final kotId = text(sourceKot['id']);
    if (kotId.isEmpty) return;
    setState(() => _updatingKotId = kotId);
    try {
      final next = deepCopy(widget.snapshot);
      final kots = listOf(next['kots']);
      final orderItems = listOf(next['orderItems']);
      final orders = listOf(next['orders']);
      final tables = listOf(next['tables']);
      final now = DateTime.now().toIso8601String();
      final kot = kots.firstWhereOrNull((item) => text(item['id']) == kotId);
      if (kot == null) return;

      kot['status'] = status;
      kot['updatedAt'] = now;
      final kotItems = listOf(kot['items']);
      for (final item in kotItems) {
        item['status'] = status;
        final orderItemId = text(item['orderItemId']);
        final orderItem = orderItems.firstWhereOrNull(
          (candidate) => text(candidate['id']) == orderItemId,
        );
        if (orderItem != null) orderItem['status'] = status;
      }
      kot['items'] = kotItems;

      final orderId = text(kot['orderId']);
      final order = orders.firstWhereOrNull(
        (candidate) => text(candidate['id']) == orderId,
      );
      if (order != null) {
        if (status == 'preparing' || status == 'ready') {
          order['status'] = status;
        }
        order['updatedAt'] = now;
        final tableId = text(order['tableId']);
        final table = tables.firstWhereOrNull(
          (candidate) => text(candidate['id']) == tableId,
        );
        if (table != null && status != 'served') table['status'] = status;
      }

      next['kots'] = kots;
      next['orderItems'] = orderItems;
      next['orders'] = orders;
      next['tables'] = tables;
      await widget.onSave(next);
    } finally {
      if (mounted) setState(() => _updatingKotId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final activeKots = listOf(widget.snapshot['kots'])
        .where((kot) => !{'served', 'cancelled'}.contains(text(kot['status'])))
        .toList()
      ..sort((a, b) => text(a['createdAt']).compareTo(text(b['createdAt'])));

    if (activeKots.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.soup_kitchen_outlined, size: 64, color: Colors.black26),
              SizedBox(height: 14),
              Text('Kitchen queue is clear', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
              SizedBox(height: 6),
              Text('New captain KOTs appear here in realtime.', textAlign: TextAlign.center),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView.separated(
        padding: const EdgeInsets.all(14),
        itemCount: activeKots.length,
        separatorBuilder: (context, index) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final kot = activeKots[index];
          final status = text(kot['status'], fallback: 'new');
          final items = listOf(kot['items']);
          final busy = _updatingKotId == text(kot['id']);
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(text(kot['kotNo'], fallback: 'KOT'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                            Text('${text(kot['tableName'], fallback: 'Takeaway')} • ${text(kot['captainName'], fallback: 'Captain')}'),
                          ],
                        ),
                      ),
                      Chip(label: Text(status.toUpperCase())),
                    ],
                  ),
                  const Divider(height: 24),
                  ...items.map((item) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        CircleAvatar(radius: 15, child: Text('${intValue(item['quantity']) == 0 ? 1 : intValue(item['quantity'])}')),
                        const SizedBox(width: 10),
                        Expanded(child: Text(text(item['name'], fallback: 'Item'), style: const TextStyle(fontWeight: FontWeight.w800))),
                        if (text(item['note']).isNotEmpty) const Icon(Icons.sticky_note_2_outlined, size: 18),
                      ],
                    ),
                  )),
                  const SizedBox(height: 8),
                  if (status == 'new')
                    FilledButton.icon(
                      onPressed: busy ? null : () => _setStatus(kot, 'preparing'),
                      icon: const Icon(Icons.local_fire_department),
                      label: const Text('START PREPARING'),
                    )
                  else if (status == 'preparing')
                    FilledButton.icon(
                      onPressed: busy ? null : () => _setStatus(kot, 'ready'),
                      icon: const Icon(Icons.notifications_active),
                      label: const Text('MARK READY'),
                    )
                  else
                    FilledButton.tonalIcon(
                      onPressed: busy ? null : () => _setStatus(kot, 'served'),
                      icon: const Icon(Icons.room_service),
                      label: const Text('MARK SERVED'),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
