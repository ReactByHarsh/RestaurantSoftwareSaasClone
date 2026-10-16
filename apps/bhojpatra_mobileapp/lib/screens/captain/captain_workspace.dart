import 'package:flutter/material.dart';
import '../../api/cloud_api.dart';
import '../../models/captain_draft.dart';
import '../../models/session.dart';
import '../../utils/utils.dart';
import '../../theme/bhojpatra_theme.dart';
import '../../widgets/app_toast.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CaptainWorkspace extends StatefulWidget {
  const CaptainWorkspace({
    super.key,
    required this.snapshot,
    required this.session,
    required this.onCommand,
  });
  final Map<String, dynamic> snapshot;
  final SavedSession session;
  final Future<Map<String, dynamic>> Function(Map<String, dynamic>) onCommand;
  @override
  State<CaptainWorkspace> createState() => _CaptainWorkspaceState();
}

class _CaptainWorkspaceState extends State<CaptainWorkspace> {
  late final CaptainDraftStore _store;
  Map<String, CaptainDraft> _drafts = {};
  String? _tableId, _floorId, _categoryId;
  String _search = '';
  bool _ready = false, _sending = false;
  final _searchController = TextEditingController();
  String _tableSearch = '', _tableStatus = 'All';
  bool _favoritesOnly = false;
  Set<String> _favorites = {};
  CaptainDraft? get _draft => _drafts[_tableId];
  List<Map<String, dynamic>> get _tables => listOf(widget.snapshot['tables']);
  List<Map<String, dynamic>> get _menu => listOf(widget.snapshot['menuItems'])
      .where(
        (m) =>
            m['isAvailable'] != false &&
            m['activeOnApp'] != false &&
            m['productType'] != 'purchase_only',
      )
      .toList();
  Map<String, dynamic>? get _table =>
      _tables.firstWhereOrNull((t) => t['id'] == _tableId);
  Map<String, dynamic>? get _floor => listOf(
    widget.snapshot['floors'],
  ).firstWhereOrNull((f) => f['id'] == _table?['floorId']);

  @override
  void initState() {
    super.initState();
    _store = CaptainDraftStore(widget.session.outletId, widget.session.userId);
    _load();
  }

  Future<void> _load() async {
    try {
      final drafts = await _store.load();
      final prefs = await SharedPreferences.getInstance();
      final favorites =
          prefs.getStringList(
            'menu_favorites_${widget.session.outletId}_${widget.session.userId}',
          ) ??
          [];
      if (mounted) {
        setState(() {
          _drafts = drafts;
          _favorites = favorites.toSet();
          _ready = true;
        });
      }
    } catch (_) {
      _message(
        'Could not read saved drafts. Restart the app; existing drafts have not been replaced.',
      );
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _message(String message) {
    if (mounted) {
      appToast(
        context,
        message,
        error:
            message.startsWith('Not confirmed') ||
            message.startsWith('Could not'),
      );
    }
  }

  Future<void> _favorite(String id) async {
    setState(() {
      if (!_favorites.add(id)) _favorites.remove(id);
    });
    try {
      await (await SharedPreferences.getInstance()).setStringList(
        'menu_favorites_${widget.session.outletId}_${widget.session.userId}',
        _favorites.toList(),
      );
    } catch (e) {
      if (mounted) appToast(context, friendlyError(e), error: true);
    }
  }

  Future<void> _persist() async {
    try {
      await _store.save(_drafts);
    } catch (e) {
      _message(e.toString());
      rethrow;
    }
  }

  void _select(Map<String, dynamic> table) {
    setState(() {
      _tableId = text(table['id']);
      _search = '';
      _categoryId = null;
      _searchController.clear();
      _drafts.putIfAbsent(
        _tableId!,
        () => CaptainDraft(
          tableId: _tableId!,
          expectedOrderId: table['activeOrderId'] as String?,
        ),
      );
      if (_draft!.items.isEmpty && !_draft!.pending) {
        _draft!.expectedOrderId = table['activeOrderId'] as String?;
      }
    });
  }

  Future<void> _add(Map<String, dynamic> menu, {bool customize = false}) async {
    if (_draft == null || _draft!.pending || _sending) return;
    final groups = listOf(menu['modifierGroups']);
    if (!customize && groups.isEmpty) {
      setState(() => _draft!.add(menu));
      await _persist();
      return;
    }
    final note = TextEditingController();
    final selected = <String>{};
    var quantity = 1;
    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: Text(text(menu['name'])),
          content: SizedBox(
            width: 480,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Expanded(child: Text('Quantity')),
                      IconButton(
                        onPressed: quantity > 1
                            ? () => update(() => quantity--)
                            : null,
                        icon: const Icon(Icons.remove),
                      ),
                      Text('$quantity'),
                      IconButton(
                        onPressed: quantity < 999
                            ? () => update(() => quantity++)
                            : null,
                        icon: const Icon(Icons.add),
                      ),
                    ],
                  ),
                  for (final group in groups) ...[
                    Text(
                      '${text(group['name'])} (choose ${intValue(group['minSelect'])}–${intValue(group['maxSelect']).clamp(1, 999)})',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    for (final modifier in listOf(group['modifiers']))
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(text(modifier['name'])),
                        subtitle: Text(money(intValue(modifier['pricePaise']))),
                        value: selected.contains(text(modifier['id'])),
                        onChanged: (checked) => update(() {
                          if (checked == true) {
                            selected.add(text(modifier['id']));
                          } else {
                            selected.remove(text(modifier['id']));
                          }
                        }),
                      ),
                  ],
                  TextField(
                    controller: note,
                    maxLength: 500,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'Kitchen instructions (optional)',
                      hintText: 'Less spicy, no onion…',
                    ),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                for (final group in groups) {
                  final count = listOf(
                    group['modifiers'],
                  ).where((m) => selected.contains(text(m['id']))).length;
                  if (count < intValue(group['minSelect']) ||
                      count > intValue(group['maxSelect']).clamp(1, 999)) {
                    appToast(
                      this.context,
                      'Check extras for ${text(group['name'])}',
                      error: true,
                    );
                    return;
                  }
                }
                Navigator.pop(dialogContext, true);
              },
              child: const Text('Add to draft'),
            ),
          ],
        ),
      ),
    );
    if (accepted == true && mounted) {
      setState(
        () => _draft!.add(
          menu,
          quantity: quantity,
          note: note.text,
          modifierIds: selected.toList(),
        ),
      );
      await _persist();
    }
    // Keep the controller alive until the dialog exit animation has completed.
    Future<void>.delayed(const Duration(milliseconds: 350), note.dispose);
  }

  Future<void> _qty(Map<String, dynamic> line, int delta) async {
    if (_draft!.pending || _sending) return;
    setState(() {
      final qty = intValue(line['quantity']) + delta;
      if (qty <= 0) {
        _draft!.items.remove(line);
      } else {
        line['quantity'] = qty.clamp(1, 999);
      }
    });
    await _persist();
  }

  int _lineSubtotal(Map<String, dynamic> line) {
    final menu = _menu.firstWhereOrNull((m) => m['id'] == line['menuItemId']);
    if (menu == null) return 0;
    final extras = listOf(menu['modifierGroups'])
        .expand((g) => listOf(g['modifiers']))
        .where((m) => (line['modifierIds'] as List).contains(m['id']))
        .fold(0, (total, m) => total + intValue(m['pricePaise']));
    return (menuSectionPrice(menu, _floor) + extras) *
        intValue(line['quantity']);
  }

  int get _subtotal =>
      _draft?.items.fold<int>(0, (sum, line) => sum + _lineSubtotal(line)) ?? 0;
  Future<void> _send({String action = 'send_kot'}) async {
    final draft = _draft;
    if (draft == null ||
        _sending ||
        (draft.items.isEmpty && action == 'send_kot' && !draft.pending)) {
      return;
    }
    setState(() => _sending = true);
    try {
      if (!draft.pending) draft.action = action;
      final command = draft.command();
      // Save the request ID before network I/O: retrying a lost acknowledgment
      // after a phone restart cannot create a second KOT.
      await _persist();
      final accepted = await widget.onCommand(command);
      final table = listOf(
        accepted['tables'],
      ).firstWhereOrNull((t) => t['id'] == draft.tableId);
      _drafts[draft.tableId] = CaptainDraft(
        tableId: draft.tableId,
        expectedOrderId: table?['activeOrderId'] as String?,
      );
      await _persist();
      _message(
        draft.action == 'request_bill'
            ? 'Bill requested at the counter'
            : 'Order confirmed on BhojPatra Desk',
      );
    } on CaptainCommandRejected catch (e) {
      draft.requestId = null;
      await _persist();
      _message(e.message);
    } catch (e) {
      _message('Not confirmed. Draft is safe; tap Retry. ${friendlyError(e)}');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _review() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => StatefulBuilder(
        builder: (context, refresh) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: SizedBox(
            height:
                (MediaQuery.sizeOf(context).height * .86 -
                        MediaQuery.viewInsetsOf(context).bottom)
                    .clamp(220, MediaQuery.sizeOf(context).height),
            child: _cartPanel(refresh: refresh),
          ),
        ),
      ),
    );
  }

  Widget _cartPanel({StateSetter? refresh}) {
    final draft = _draft!;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Draft • ${text(_table?['name'])}',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              if (refresh != null)
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              IconButton(
                tooltip: 'Discard draft',
                onPressed: draft.pending || _sending || draft.items.isEmpty
                    ? null
                    : () async {
                        final discard = await showDialog<bool>(
                          context: context,
                          builder: (dialog) => AlertDialog(
                            title: const Text('Discard this phone draft?'),
                            content: const Text(
                              'Confirmed orders on the desktop will not be changed.',
                            ),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(dialog, false),
                                child: const Text('Keep draft'),
                              ),
                              FilledButton(
                                onPressed: () => Navigator.pop(dialog, true),
                                child: const Text('Discard'),
                              ),
                            ],
                          ),
                        );
                        if (discard != true || !mounted) return;
                        setState(
                          () => _drafts[draft.tableId] = CaptainDraft(
                            tableId: draft.tableId,
                            expectedOrderId:
                                _table?['activeOrderId'] as String?,
                          ),
                        );
                        await _persist();
                        refresh?.call(() {});
                      },
                icon: const Icon(Icons.delete_outline),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (!draft.pending &&
                  draft.items.isNotEmpty &&
                  text(draft.expectedOrderId) != text(_table?['activeOrderId']))
                OutlinedButton(
                  onPressed: _sending
                      ? null
                      : () async {
                          final useCurrent = await showDialog<bool>(
                            context: context,
                            builder: (dialog) => AlertDialog(
                              title: const Text('Table order changed'),
                              content: const Text(
                                'These unsent items belong to an earlier table session. Add them to the current table session instead?',
                              ),
                              actions: [
                                TextButton(
                                  onPressed: () => Navigator.pop(dialog, false),
                                  child: const Text('Cancel'),
                                ),
                                FilledButton(
                                  onPressed: () => Navigator.pop(dialog, true),
                                  child: const Text('Use current session'),
                                ),
                              ],
                            ),
                          );
                          if (useCurrent == true && mounted) {
                            setState(
                              () => draft.expectedOrderId =
                                  _table?['activeOrderId'] as String?,
                            );
                            await _persist();
                            refresh?.call(() {});
                          }
                        },
                  child: const Text('Review changed table session'),
                ),
              if (draft.pending)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(12),
                    child: Text(
                      'Waiting for desktop confirmation. Editing is locked to prevent a duplicate order. Retry safely.',
                    ),
                  ),
                ),
              if (draft.items.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(20),
                  child: Text('No unsent items. Add products from the menu.'),
                ),
              for (final line in draft.items)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          text(line['name']),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        if (text(line['note']).isNotEmpty)
                          Text(
                            text(line['note']),
                            style: const TextStyle(color: Colors.black54),
                          ),
                        if ((line['modifierIds'] as List).isNotEmpty)
                          Text(
                            'Extras selected: ${(line['modifierIds'] as List).length}',
                          ),
                        Row(
                          children: [
                            Expanded(child: Text(money(_lineSubtotal(line)))),
                            IconButton(
                              onPressed: draft.pending || _sending
                                  ? null
                                  : () async {
                                      await _qty(line, -1);
                                      refresh?.call(() {});
                                    },
                              icon: const Icon(Icons.remove_circle_outline),
                            ),
                            Text('${line['quantity']}'),
                            IconButton(
                              onPressed: draft.pending || _sending
                                  ? null
                                  : () async {
                                      await _qty(line, 1);
                                      refresh?.call(() {});
                                    },
                              icon: const Icon(Icons.add_circle_outline),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              TextFormField(
                key: ValueKey('${draft.tableId}-name'),
                initialValue: draft.customerName,
                enabled: !draft.pending && !_sending,
                decoration: const InputDecoration(
                  labelText: 'Customer name (optional)',
                  border: OutlineInputBorder(),
                ),
                maxLength: 120,
                onChanged: (value) {
                  draft.customerName = value;
                  _persist();
                },
              ),
              const SizedBox(height: 10),
              TextFormField(
                key: ValueKey('${draft.tableId}-phone'),
                initialValue: draft.customerPhone,
                enabled: !draft.pending && !_sending,
                keyboardType: TextInputType.phone,
                maxLength: 120,
                decoration: const InputDecoration(
                  labelText: 'Customer phone (optional)',
                  border: OutlineInputBorder(),
                ),
                onChanged: (value) {
                  draft.customerPhone = value;
                  _persist();
                },
              ),
              const Text(
                'Saved on this phone · Counter calculates taxes and discounts.',
                style: TextStyle(color: Colors.black54, fontSize: 12),
              ),
            ],
          ),
        ),
        _actions(afterSend: refresh),
      ],
    );
  }

  Widget _actions({StateSetter? afterSend}) => Container(
    padding: const EdgeInsets.fromLTRB(12, 5, 12, 10),
    color: Colors.white,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                '${_draft?.count ?? 0} items • ${money(_subtotal)}',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
            if (afterSend == null && MediaQuery.sizeOf(context).width < 720)
              TextButton(onPressed: _review, child: const Text('Review draft')),
          ],
        ),
        const SizedBox(height: 6),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: _sending || (_draft!.items.isEmpty && !_draft!.pending)
                ? null
                : () async {
                    final pending = _send();
                    afterSend?.call(() {});
                    await pending;
                    afterSend?.call(() {});
                  },
            icon: _sending
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Icon(_draft!.pending ? Icons.sync : Icons.send),
            label: Text(
              _sending
                  ? 'Confirming with desktop…'
                  : _draft!.pending
                  ? 'Retry confirmation'
                  : 'Send order / KOT',
            ),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 10),
            ),
          ),
        ),
      ],
    ),
  );
  Future<void> _existingOrder() async {
    final orderId = _table?['activeOrderId'];
    final items = listOf(widget.snapshot['orderItems'])
        .where((i) => i['orderId'] == orderId && i['status'] != 'cancelled')
        .toList();
    final order = listOf(
      widget.snapshot['orders'],
    ).firstWhereOrNull((o) => o['id'] == orderId);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => SizedBox(
        height: MediaQuery.sizeOf(context).height * .7,
        child: Column(
          children: [
            ListTile(
              title: Text('Confirmed • ${text(_table?['name'])}'),
              subtitle: Text(text(order?['orderNo'])),
              trailing: IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close),
              ),
            ),
            Expanded(
              child: ListView(
                children: [
                  for (final item in items)
                    ListTile(
                      title: Text(
                        '${item['quantity']} × ${text(item['nameSnapshot'])}',
                      ),
                      subtitle: Text(
                        '${text(item['note'])} ${text(item['status'])}',
                      ),
                      trailing: Text(money(intValue(item['totalPaise']))),
                    ),
                  if (items.isEmpty)
                    const ListTile(title: Text('No confirmed items yet')),
                ],
              ),
            ),
            ListTile(
              title: const Text('Bill total'),
              trailing: Text(money(intValue(order?['totalPaise']))),
            ),
          ],
        ),
      ),
    );
  }

  Color _statusColor(Map<String, dynamic> t) => switch (text(t['status'])) {
    'ready' => Brand.green,
    'bill_requested' || 'payment_pending' => const Color(0xff7c3aed),
    'dirty' || 'reserved' => Brand.muted,
    _ =>
      text(t['activeOrderId']).isEmpty ? Brand.green : const Color(0xff2563eb),
  };

  Widget _tablePicker() {
    final floors = listOf(
      widget.snapshot['floors'],
    ).where((f) => f['isActive'] != false).toList();
    final tables = _tables
        .where(
          (t) =>
              (_floorId == null || t['floorId'] == _floorId) &&
              ('${text(t['name'])} ${text(floors.firstWhereOrNull((f) => f['id'] == t['floorId'])?['name'])}')
                  .toLowerCase()
                  .contains(_tableSearch.toLowerCase()) &&
              (_tableStatus == 'All' ||
                  (_tableStatus == 'Running'
                      ? text(t['activeOrderId']).isNotEmpty
                      : _tableStatus == 'Drafts'
                      ? (_drafts[text(t['id'])]?.count ?? 0) > 0 ||
                            _drafts[text(t['id'])]?.pending == true
                      : text(t['activeOrderId']).isEmpty &&
                            t['status'] == 'available')),
        )
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
          child: TextField(
            onChanged: (v) => setState(() => _tableSearch = v),
            decoration: InputDecoration(
              hintText: 'Search table or section',
              prefixIcon: const Icon(Icons.search, size: 19),
              suffixIcon: Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  '${_tables.length}',
                  style: const TextStyle(
                    color: Brand.muted,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            children: [
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: ChoiceChip(
                  label: const Text('All sections'),
                  selected: _floorId == null,
                  onSelected: (_) => setState(() => _floorId = null),
                ),
              ),
              for (final f in floors)
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: ChoiceChip(
                    label: Text(text(f['name'])),
                    selected: _floorId == f['id'],
                    onSelected: (_) => setState(() => _floorId = text(f['id'])),
                  ),
                ),
            ],
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 10),
          child: Row(
            children: [
              for (final f in ['All', 'Running', 'Available', 'Drafts'])
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: FilterChip(
                    label: Text(f),
                    selected: _tableStatus == f,
                    onSelected: (_) => setState(() => _tableStatus = f),
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: LayoutBuilder(
            builder: (context, c) => tables.isEmpty
                ? const Center(
                    child: Text(
                      'No matching tables',
                      style: TextStyle(color: Brand.muted),
                    ),
                  )
                : GridView.builder(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: (c.maxWidth / 122).floor().clamp(2, 8),
                      mainAxisExtent: 124,
                      crossAxisSpacing: 8,
                      mainAxisSpacing: 8,
                    ),
                    itemCount: tables.length,
                    itemBuilder: (context, index) {
                      final t = tables[index], id = text(t['id']);
                      final draft = _drafts[id];
                      final order = listOf(
                        widget.snapshot['orders'],
                      ).firstWhereOrNull((o) => o['id'] == t['activeOrderId']);
                      final running = text(t['activeOrderId']).isNotEmpty;
                      final color = _statusColor(t);
                      return Material(
                        color: _tableId == id
                            ? const Color(0xfffff1e8)
                            : Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: BorderSide(color: color.withValues(alpha: .5)),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          onTap: () => _select(t),
                          child: Padding(
                            padding: const EdgeInsets.all(10),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        text(t['name']),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontSize: 20,
                                          fontWeight: FontWeight.w900,
                                          color: Brand.navy,
                                        ),
                                      ),
                                    ),
                                    const Icon(
                                      Icons.people_outline,
                                      size: 12,
                                      color: Brand.muted,
                                    ),
                                    Text(
                                      '${intValue(t['seats'])}',
                                      style: const TextStyle(
                                        fontSize: 10,
                                        color: Brand.muted,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  text(
                                    floors.firstWhereOrNull(
                                      (f) => f['id'] == t['floorId'],
                                    )?['name'],
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 9,
                                    color: Brand.muted,
                                  ),
                                ),
                                const SizedBox(height: 5),
                                Row(
                                  children: [
                                    Icon(Icons.circle, size: 5, color: color),
                                    const SizedBox(width: 4),
                                    Expanded(
                                      child: Text(
                                        text(
                                          t['status'],
                                          fallback: 'available',
                                        ).replaceAll('_', ' ').toUpperCase(),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          color: color,
                                          fontSize: 8,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const Spacer(),
                                Text(
                                  draft?.pending == true
                                      ? 'Pending · retry'
                                      : (draft?.count ?? 0) > 0
                                      ? '${draft!.count} in draft'
                                      : running
                                      ? money(intValue(order?['totalPaise']))
                                      : 'Start order',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                    color: draft?.pending == true
                                        ? Colors.red
                                        : running
                                        ? Brand.navy
                                        : Brand.orange,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ),
      ],
    );
  }

  Widget _menuPanel() {
    final categories = listOf(
      widget.snapshot['menuCategories'],
    ).where((c) => c['isActive'] != false).toList();
    final menu = _menu.where((m) {
      final category = categories.firstWhereOrNull(
        (c) => c['id'] == m['categoryId'],
      );
      return (_categoryId == null ||
              m['categoryId'] == _categoryId ||
              category?['parentId'] == _categoryId) &&
          (!_favoritesOnly || _favorites.contains(m['id'])) &&
          '${text(m['name'])} ${text(m['shortCode'])}'.toLowerCase().contains(
            _search.toLowerCase(),
          );
    }).toList();
    return Column(
      children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(4, 3, 8, 3),
          child: Row(
            children: [
              IconButton(
                tooltip: 'Back to tables',
                onPressed: () => setState(() => _tableId = null),
                icon: const Icon(Icons.arrow_back, size: 20),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      text(_table?['name']),
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 16,
                      ),
                    ),
                    Text(
                      text(_floor?['name']),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 10, color: Brand.muted),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Confirmed items',
                onPressed: _existingOrder,
                icon: const Icon(Icons.receipt_long_outlined, size: 21),
              ),
              if (text(_table?['activeOrderId']).isNotEmpty &&
                  _draft!.items.isEmpty &&
                  !_draft!.pending)
                TextButton(
                  onPressed: _sending
                      ? null
                      : () => _send(action: 'request_bill'),
                  child: const Text('Bill', style: TextStyle(fontSize: 12)),
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
          child: TextField(
            controller: _searchController,
            onChanged: (v) => setState(() => _search = v),
            decoration: const InputDecoration(
              hintText: 'Search menu or product code',
              prefixIcon: Icon(Icons.search, size: 20),
            ),
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
          child: Row(
            children: [
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: FilterChip(
                  label: const Icon(Icons.star_rounded, size: 17),
                  selected: _favoritesOnly,
                  onSelected: (v) => setState(() => _favoritesOnly = v),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: ChoiceChip(
                  label: const Text('All products'),
                  selected: _categoryId == null,
                  onSelected: (_) => setState(() => _categoryId = null),
                ),
              ),
              for (final c in categories)
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: ChoiceChip(
                    label: Text(text(c['name'])),
                    selected: _categoryId == c['id'],
                    onSelected: (_) =>
                        setState(() => _categoryId = text(c['id'])),
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: menu.isEmpty
              ? const Center(
                  child: Text(
                    'No matching products',
                    style: TextStyle(color: Brand.muted),
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                  itemCount: menu.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 6),
                  itemBuilder: (context, index) {
                    final m = menu[index];
                    return Card(
                      child: InkWell(
                        onTap: () => _add(m, customize: true),
                        borderRadius: BorderRadius.circular(12),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(10, 9, 5, 9),
                          child: Row(
                            children: [
                              Container(
                                width: 11,
                                height: 11,
                                decoration: BoxDecoration(
                                  border: Border.all(
                                    color: m['itemType'] == 'veg'
                                        ? Brand.green
                                        : Colors.red,
                                  ),
                                  borderRadius: BorderRadius.circular(2),
                                ),
                                child: Icon(
                                  Icons.circle,
                                  size: 6,
                                  color: m['itemType'] == 'veg'
                                      ? Brand.green
                                      : Colors.red,
                                ),
                              ),
                              const SizedBox(width: 9),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      text(m['name']),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 13,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      money(menuSectionPrice(m, _floor)),
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: Brand.muted,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              IconButton(
                                tooltip: 'Favourite ${text(m['name'])}',
                                onPressed: () => _favorite(text(m['id'])),
                                constraints: const BoxConstraints(
                                  minWidth: 34,
                                  minHeight: 44,
                                ),
                                padding: EdgeInsets.zero,
                                icon: Icon(
                                  _favorites.contains(m['id'])
                                      ? Icons.star_rounded
                                      : Icons.star_outline_rounded,
                                  size: 19,
                                  color: _favorites.contains(m['id'])
                                      ? Brand.orange
                                      : Brand.border,
                                ),
                              ),
                              IconButton(
                                tooltip: 'Add ${text(m['name'])}',
                                onPressed: _draft!.pending || _sending
                                    ? null
                                    : () => _add(m),
                                constraints: const BoxConstraints(
                                  minWidth: 40,
                                  minHeight: 44,
                                ),
                                icon: const Icon(
                                  Icons.add_circle,
                                  color: Brand.orange,
                                  size: 28,
                                ),
                              ),
                            ],
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

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const Center(child: CircularProgressIndicator());
    return PopScope(
      canPop: _tableId == null,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _tableId != null) setState(() => _tableId = null);
      },
      child: LayoutBuilder(
        builder: (context, c) {
          final selected = _table != null;
          if (c.maxWidth >= 1100) {
            return Row(
              children: [
                SizedBox(width: 270, child: _tablePicker()),
                const VerticalDivider(width: 1),
                Expanded(
                  child: selected
                      ? _menuPanel()
                      : const Center(
                          child: Icon(
                            Icons.table_restaurant_outlined,
                            size: 70,
                            color: Brand.border,
                          ),
                        ),
                ),
                if (selected) ...[
                  const VerticalDivider(width: 1),
                  SizedBox(width: 310, child: _cartPanel()),
                ],
              ],
            );
          }
          if (!selected) return _tablePicker();
          if (c.maxWidth >= 720) {
            return Row(
              children: [
                Expanded(child: _menuPanel()),
                const VerticalDivider(width: 1),
                SizedBox(width: 300, child: _cartPanel()),
              ],
            );
          }
          return Column(
            children: [
              Expanded(child: _menuPanel()),
              _actions(),
            ],
          );
        },
      ),
    );
  }
}
