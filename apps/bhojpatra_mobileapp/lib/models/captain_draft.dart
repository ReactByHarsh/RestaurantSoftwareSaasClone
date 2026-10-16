import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import '../utils/utils.dart';

class CaptainDraft {
  CaptainDraft({required this.tableId, this.expectedOrderId});
  final String tableId;
  String? expectedOrderId;
  final List<Map<String, dynamic>> items = [];
  String customerName = '';
  String customerPhone = '';
  String? requestId;
  String action = 'send_kot';
  bool get pending => requestId != null;
  int get count =>
      items.fold(0, (sum, item) => sum + intValue(item['quantity']));
  Map<String, dynamic> toJson() => {
    'tableId': tableId,
    'expectedOrderId': expectedOrderId,
    'items': items,
    'customerName': customerName,
    'customerPhone': customerPhone,
    'requestId': requestId,
    'action': action,
  };
  factory CaptainDraft.fromJson(Map<String, dynamic> json) {
    final draft = CaptainDraft(
      tableId: text(json['tableId']),
      expectedOrderId: json['expectedOrderId'] as String?,
    );
    draft.items.addAll(listOf(json['items']));
    draft.customerName = text(json['customerName']);
    draft.customerPhone = text(json['customerPhone']);
    draft.requestId = json['requestId'] as String?;
    draft.action = text(json['action'], fallback: 'send_kot');
    return draft;
  }
  void add(
    Map<String, dynamic> menu, {
    int quantity = 1,
    String note = '',
    List<String> modifierIds = const [],
  }) {
    if (pending) return;
    final ids = [...modifierIds]..sort();
    final matching = items.firstWhereOrNull(
      (line) =>
          line['menuItemId'] == menu['id'] &&
          text(line['note']) == note.trim() &&
          jsonEncode(line['modifierIds']) == jsonEncode(ids),
    );
    if (matching != null) {
      matching['quantity'] = (intValue(matching['quantity']) + quantity).clamp(
        1,
        999,
      );
      return;
    }
    items.add({
      'lineId': const Uuid().v4(),
      'menuItemId': menu['id'],
      'name': menu['name'],
      'quantity': quantity,
      'note': note.trim(),
      'modifierIds': ids,
    });
  }

  Map<String, dynamic> command() {
    requestId ??= const Uuid().v4();
    return {
      ...toJson(),
      'items': items
          .map(
            (line) => {
              'menuItemId': line['menuItemId'],
              'quantity': line['quantity'],
              'note': line['note'],
              'modifierIds': line['modifierIds'],
            },
          )
          .toList(),
    };
  }
}

/// Outlet/user-scoped drafts survive table switching, app restart and LAN loss.
class CaptainDraftStore {
  CaptainDraftStore(String outletId, String userId)
    : key = 'captain_drafts_v1:$outletId:$userId';
  final String key;
  Future<void> _writes = Future.value();
  Future<Map<String, CaptainDraft>> load() async {
    final raw = (await SharedPreferences.getInstance()).getString(key);
    if (raw == null) return {};
    return {
      for (final entry in (jsonDecode(raw) as Map).entries)
        entry.key.toString(): CaptainDraft.fromJson(
          Map<String, dynamic>.from(entry.value as Map),
        ),
    };
  }

  Future<void> save(Map<String, CaptainDraft> drafts) {
    final raw = jsonEncode({
      for (final entry in drafts.entries) entry.key: entry.value.toJson(),
    });
    final write = _writes.then((_) async {
      if (!await (await SharedPreferences.getInstance()).setString(key, raw)) {
        throw Exception(
          'Draft could not be saved on this phone. Do not close the app.',
        );
      }
    });
    _writes = write.catchError((Object _) {});
    return write;
  }
}

int menuSectionPrice(Map<String, dynamic> menu, Map<String, dynamic>? floor) {
  final field = switch (text(floor?['menuPriceOption'])) {
    'mrp' => 'mrpPaise',
    'special' => 'specialPricePaise',
    'online' => 'onlinePricePaise',
    'delivery' => 'deliveryPricePaise',
    'takeaway' => 'takeawayPricePaise',
    _ => 'pricePaise',
  };
  final base = intValue(menu[field] ?? menu['pricePaise']);
  final adjustment = (floor?['priceAdjustmentValue'] as num?)?.toDouble() ?? 0;
  return (base +
          (adjustment > 0
              ? text(floor?['priceAdjustmentType']) == 'amount'
                    ? adjustment
                    : base * adjustment / 100
              : 0))
      .round()
      .clamp(0, 1 << 53);
}
