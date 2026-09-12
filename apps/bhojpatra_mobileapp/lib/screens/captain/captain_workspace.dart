import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../../models/session.dart';
import '../../utils/utils.dart';
import '../../utils/printer.dart';
import '../../widgets/common_widgets.dart';

class CaptainWorkspace extends StatefulWidget {
  const CaptainWorkspace({
    super.key,
    required this.snapshot,
    required this.session,
    required this.onSave,
  });

  final Map<String, dynamic> snapshot;
  final SavedSession session;
  final Future<void> Function(Map<String, dynamic>) onSave;

  @override
  State<CaptainWorkspace> createState() => _CaptainWorkspaceState();
}

class _CaptainWorkspaceState extends State<CaptainWorkspace> {
  String? _tableId;
  final Map<String, int> _cart = {};
  bool _isPrinting = false;

  void _onTableSelected(String tableId) {
    setState(() {
      _tableId = tableId;
      _cart.clear(); // Clear cart when switching tables
    });
  }

  void _backToTables() {
    setState(() {
      _tableId = null;
      _cart.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final tables = listOf(widget.snapshot['tables']);
    final menu = listOf(
      widget.snapshot['menuItems'],
    ).where((item) => item['isAvailable'] != false).toList();
    final selectedTable = tables
        .where((table) => text(table['id']) == _tableId)
        .firstOrNull;
    final printSettings =
        snapshotValue(widget.snapshot, 'printSettings', 'printerIp') != null
        ? widget.snapshot['printSettings'] as Map<String, dynamic>
        : <String, dynamic>{};

    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 720;

        if (wide) {
          // Wide layout: Table grid on left, Cart/Menu on right
          return Row(
            children: [
              Expanded(
                flex: 3,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    const SectionTitle('Select Table'),
                    TableGrid(
                      tables: tables,
                      selectedId: _tableId,
                      onTap: (table) => _onTableSelected(text(table['id'])),
                    ),
                  ],
                ),
              ),
              const VerticalDivider(width: 1),
              Expanded(
                flex: 4,
                child: selectedTable == null
                    ? const Center(
                        child: Text('Select a table to begin ordering'),
                      )
                    : _MenuAndCartView(
                        table: selectedTable,
                        menu: menu,
                        cart: _cart,
                        isPrinting: _isPrinting,
                        onQtyChange: _updateCartQty,
                        onSave: _handleSaveOrder,
                        onSendKot: (items) =>
                            _handleSendKot(selectedTable, items, printSettings),
                        onPrintProforma: (items, total) => _handlePrintProforma(
                          selectedTable,
                          items,
                          total,
                          printSettings,
                        ),
                      ),
              ),
            ],
          );
        } else {
          // Compact mobile layout: Show tables OR Menu/Cart
          if (selectedTable == null) {
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const SectionTitle('Select Table'),
                TableGrid(
                  tables: tables,
                  selectedId: null,
                  onTap: (table) => _onTableSelected(text(table['id'])),
                ),
              ],
            );
          } else {
            return Column(
              children: [
                Container(
                  color: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 8,
                  ),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back),
                        onPressed: _backToTables,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Table: ${text(selectedTable['name'])}',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: _MenuAndCartView(
                    table: selectedTable,
                    menu: menu,
                    cart: _cart,
                    isPrinting: _isPrinting,
                    onQtyChange: _updateCartQty,
                    onSave: _handleSaveOrder,
                    onSendKot: (items) =>
                        _handleSendKot(selectedTable, items, printSettings),
                    onPrintProforma: (items, total) => _handlePrintProforma(
                      selectedTable,
                      items,
                      total,
                      printSettings,
                    ),
                  ),
                ),
              ],
            );
          }
        }
      },
    );
  }

  void _updateCartQty(String id, int delta) {
    setState(() {
      final next = (_cart[id] ?? 0) + delta;
      if (next <= 0) {
        _cart.remove(id);
      } else {
        _cart[id] = next;
      }
    });
  }

  Future<void> _handleSaveOrder() async {
    // Save logic without KOT print
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Order saved to table (No KOT)')),
    );
    // In a real scenario, we'd add these items to the existing order for this table.
    // For this example, we'll just clear the cart to simulate successful save.
    setState(() => _cart.clear());
  }

  Future<void> _handleSendKot(
    Map<String, dynamic> table,
    List<({Map<String, dynamic>? item, int qty})> cartItems,
    Map<String, dynamic> printSettings,
  ) async {
    if (cartItems.isEmpty) return;
    setState(() => _isPrinting = true);
    try {
      final next = deepCopy(widget.snapshot);
      final orders = listOf(next['orders']);
      final orderItems = listOf(next['orderItems']);
      final kots = listOf(next['kots']);
      final tables = listOf(next['tables']);
      final now = DateTime.now().toIso8601String();

      // Find active order or create new
      String? activeOrderId = text(table['activeOrderId']);
      Map<String, dynamic>? currentOrder = orders.firstWhereOrNull(
        (o) => text(o['id']) == activeOrderId,
      );

      String orderId;
      String orderNo;
      int currentSubtotal = 0;

      if (currentOrder == null) {
        orderId = 'ord_${const Uuid().v4()}';
        orderNo = 'ORD-${(orders.length + 1).toString().padLeft(4, '0')}';
        activeOrderId = orderId;
      } else {
        orderId = text(currentOrder['id']);
        orderNo = text(currentOrder['orderNo']);
        currentSubtotal = intValue(currentOrder['subtotalPaise']);
      }

      final kotId = 'kot_${const Uuid().v4()}';
      final addedSubtotal = cartItems.fold<int>(
        0,
        (sum, entry) => sum + intValue(entry.item!['pricePaise']) * entry.qty,
      );
      final kotNo = 'KOT-${(kots.length + 1).toString().padLeft(4, '0')}';

      if (currentOrder == null) {
        orders.add({
          'id': orderId,
          'orderUuid': orderId,
          'version': 1,
          'isClosed': false,
          'outletId': widget.session.outletId,
          'orderNo': orderNo,
          'businessDate': now.substring(0, 10),
          'type': 'dine_in',
          'status': 'kot_sent',
          'tableId': text(table['id']),
          'tableName': text(table['name']),
          'captainUserId': widget.session.userId,
          'captainName': widget.session.userName,
          'subtotalPaise': addedSubtotal,
          'totalPaise': addedSubtotal,
          'paidPaise': 0,
          'paymentStatus': 'unpaid',
          'createdAt': now,
          'updatedAt': now,
        });
      } else {
        currentOrder['subtotalPaise'] = currentSubtotal + addedSubtotal;
        currentOrder['totalPaise'] = intValue(currentOrder['subtotalPaise']);
        currentOrder['status'] = 'kot_sent';
      }

      final kotItems = <Map<String, dynamic>>[];
      for (final entry in cartItems) {
        final item = entry.item!;
        final itemId = 'oit_${const Uuid().v4()}';
        orderItems.add({
          'id': itemId,
          'orderId': orderId,
          'menuItemId': text(item['id']),
          'nameSnapshot': text(item['name']),
          'itemType': text(item['itemType'], fallback: 'other'),
          'quantity': entry.qty,
          'unitPricePaise': intValue(item['pricePaise']),
          'taxPercent': intValue(item['taxPercent']),
          'totalPaise': intValue(item['pricePaise']) * entry.qty,
          'stationId': item['stationId'],
          'status': 'kot_sent',
          'createdAt': now,
        });
        kotItems.add({
          'id': 'ki_${const Uuid().v4()}',
          'kotId': kotId,
          'orderItemId': itemId,
          'name': text(item['name']),
          'quantity': entry.qty,
          'status': 'new',
        });
      }
      kots.add({
        'id': kotId,
        'orderId': orderId,
        'orderNo': orderNo,
        'kotNo': kotNo,
        'tableName': text(table['name']),
        'orderType': 'dine_in',
        'status': 'new',
        'captainName': widget.session.userName,
        'createdByUserId': widget.session.userId,
        'createdAt': now,
        'items': kotItems,
      });

      for (final current in tables) {
        if (text(current['id']) == text(table['id'])) {
          current['status'] = 'kot_sent';
          current['activeOrderId'] = orderId;
        }
      }

      next['orders'] = orders;
      next['orderItems'] = orderItems;
      next['kots'] = kots;
      next['tables'] = tables;

      // Save state to cloud/LAN
      await widget.onSave(next);

      // Print directly via LAN if configured
      if (text(printSettings['printerIp']).isNotEmpty) {
        try {
          await LanPrinter.printKot(
            printSettings: printSettings,
            kotNo: kotNo,
            tableName: text(table['name']),
            captainName: widget.session.userName,
            items: kotItems,
          );
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Printed $kotNo on LAN printer')),
            );
          }
        } catch (e) {
          if (mounted) {
            ScaffoldMessenger.of(
              context,
            ).showSnackBar(SnackBar(content: Text('LAN Print failed: $e')));
          }
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Printer not configured, KOT saved to cloud.'),
            ),
          );
        }
      }

      if (mounted) setState(() => _cart.clear());
    } finally {
      if (mounted) setState(() => _isPrinting = false);
    }
  }

  Future<void> _handlePrintProforma(
    Map<String, dynamic> table,
    List<({Map<String, dynamic>? item, int qty})> cartItems,
    int cartTotal,
    Map<String, dynamic> printSettings,
  ) async {
    setState(() => _isPrinting = true);
    try {
      final next = deepCopy(widget.snapshot);
      final orders = listOf(next['orders']);
      final orderItems = listOf(next['orderItems']);
      final tables = listOf(next['tables']);

      String? activeOrderId = text(table['activeOrderId']);
      Map<String, dynamic>? currentOrder = orders.firstWhereOrNull(
        (o) => text(o['id']) == activeOrderId,
      );

      if (currentOrder == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No active order for this table!')),
        );
        return;
      }

      // Update table and order status
      for (final current in tables) {
        if (text(current['id']) == text(table['id'])) {
          current['status'] = 'bill_requested';
        }
      }
      currentOrder['status'] = 'bill_requested';

      next['orders'] = orders;
      next['tables'] = tables;

      await widget.onSave(next);

      if (text(printSettings['printerIp']).isNotEmpty) {
        try {
          final items = orderItems
              .where((i) => text(i['orderId']) == activeOrderId)
              .toList();
          await LanPrinter.printProforma(
            printSettings: printSettings,
            restaurantName: text(
              widget.snapshot['outlet']?['name'],
              fallback: 'Bhojpatra',
            ),
            orderNo: text(currentOrder['orderNo']),
            tableName: text(table['name']),
            captainName: widget.session.userName,
            items: items,
            subtotalPaise: intValue(currentOrder['subtotalPaise']),
          );
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Proforma printed on LAN printer')),
            );
          }
        } catch (e) {
          if (mounted) {
            ScaffoldMessenger.of(
              context,
            ).showSnackBar(SnackBar(content: Text('LAN Print failed: $e')));
          }
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Printer not configured. Bill requested in cloud.'),
            ),
          );
        }
      }
    } finally {
      if (mounted) setState(() => _isPrinting = false);
    }
  }
}

class _MenuAndCartView extends StatelessWidget {
  const _MenuAndCartView({
    required this.table,
    required this.menu,
    required this.cart,
    required this.isPrinting,
    required this.onQtyChange,
    required this.onSave,
    required this.onSendKot,
    required this.onPrintProforma,
  });

  final Map<String, dynamic> table;
  final List<Map<String, dynamic>> menu;
  final Map<String, int> cart;
  final bool isPrinting;
  final void Function(String id, int delta) onQtyChange;
  final VoidCallback onSave;
  final void Function(List<({Map<String, dynamic>? item, int qty})> items)
  onSendKot;
  final void Function(
    List<({Map<String, dynamic>? item, int qty})> items,
    int total,
  )
  onPrintProforma;

  @override
  Widget build(BuildContext context) {
    final cartItems = cart.entries
        .map(
          (entry) => (
            item: menu.firstWhereOrNull(
              (item) => text(item['id']) == entry.key,
            ),
            qty: entry.value,
          ),
        )
        .where((entry) => entry.item != null)
        .toList();
    final total = cartItems.fold<int>(
      0,
      (sum, entry) => sum + intValue(entry.item!['pricePaise']) * entry.qty,
    );
    final hasActiveOrder = text(table['activeOrderId']).isNotEmpty;

    return Column(
      children: [
        // Menu List
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: menu.length,
            separatorBuilder: (context, index) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final item = menu[index];
              final id = text(item['id']);
              final qty = cart[id] ?? 0;
              return Card(
                elevation: 1,
                margin: EdgeInsets.zero,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              text(item['name']),
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 15,
                              ),
                            ),
                            Text(
                              money(intValue(item['pricePaise'])),
                              style: TextStyle(color: Colors.grey.shade700),
                            ),
                          ],
                        ),
                      ),
                      if (qty == 0)
                        OutlinedButton(
                          onPressed: () => onQtyChange(id, 1),
                          style: OutlinedButton.styleFrom(
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                          ),
                          child: const Text('ADD'),
                        )
                      else
                        Row(
                          children: [
                            IconButton(
                              onPressed: () => onQtyChange(id, -1),
                              icon: const Icon(
                                Icons.remove_circle,
                                color: Colors.red,
                              ),
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              '$qty',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                            ),
                            const SizedBox(width: 8),
                            IconButton(
                              onPressed: () => onQtyChange(id, 1),
                              icon: const Icon(
                                Icons.add_circle,
                                color: Colors.green,
                              ),
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(),
                            ),
                          ],
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),

        // Cart / Action Bottom Bar
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: .05),
                blurRadius: 10,
                offset: const Offset(0, -4),
              ),
            ],
          ),
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (cartItems.isNotEmpty) ...[
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Cart Total:',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      Text(
                        money(total),
                        style: const TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 18,
                          color: Color(0xfff36b21),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],
                Row(
                  children: [
                    if (cartItems.isNotEmpty) ...[
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: isPrinting ? null : onSave,
                          icon: const Icon(Icons.save),
                          label: const Text('Save'),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        flex: 2,
                        child: FilledButton.icon(
                          onPressed: isPrinting
                              ? null
                              : () => onSendKot(cartItems),
                          icon: isPrinting
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    color: Colors.white,
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.print),
                          label: Text(isPrinting ? 'Wait...' : 'Send KOT'),
                          style: FilledButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                          ),
                        ),
                      ),
                    ] else if (hasActiveOrder) ...[
                      Expanded(
                        child: FilledButton.tonalIcon(
                          onPressed: isPrinting
                              ? null
                              : () => onPrintProforma(cartItems, total),
                          icon: const Icon(Icons.receipt_long),
                          label: const Text('Print Proforma Bill'),
                          style: FilledButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                          ),
                        ),
                      ),
                    ] else ...[
                      const Expanded(
                        child: Text(
                          'Add items to create an order.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.black54),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
