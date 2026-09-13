import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../storage/mobile_database.dart';
import '../utils/utils.dart';
import 'cloud_api.dart';

class MobileOrderSyncResult {
  const MobileOrderSyncResult({
    required this.snapshot,
    required this.uploaded,
    required this.conflicts,
  });

  final Map<String, dynamic> snapshot;
  final int uploaded;
  final int conflicts;
}

class MobileOrderSync {
  MobileOrderSync(this.api, {MobileDatabase? database})
    : db = database ?? mobileDatabase;

  final CloudApi api;
  final MobileDatabase db;
  Future<MobileOrderSyncResult>? _active;

  dynamic _canonical(dynamic value) {
    if (value is List) return value.map(_canonical).toList();
    if (value is Map) {
      final keys = value.keys.map((key) => key.toString()).toList()..sort();
      return <String, dynamic>{
        for (final key in keys)
          if (value[key] != null) key: _canonical(value[key]),
      };
    }
    return value;
  }

  String _hash(dynamic value) =>
      sha256.convert(utf8.encode(jsonEncode(_canonical(value)))).toString();

  bool _isClosed(Map<String, dynamic> order) {
    final status = text(order['status']);
    return order['isClosed'] == true ||
        text(order['closedAt']).isNotEmpty ||
        {'paid', 'cancelled', 'void'}.contains(status);
  }

  Map<String, dynamic> _aggregate(
    Map<String, dynamic> snapshot,
    Map<String, dynamic> order,
  ) {
    final orderId = text(order['id']);
    final tableId = text(order['tableId']);
    final tables = listOf(snapshot['tables']);
    final table = tables.cast<Map<String, dynamic>?>().firstWhere(
      (candidate) => candidate != null && text(candidate['id']) == tableId,
      orElse: () => null,
    );
    return {
      'order': {
        ...order,
        'orderUuid': text(order['orderUuid'], fallback: orderId),
        'isClosed': _isClosed(order),
      },
      'orderItems': listOf(
        snapshot['orderItems'],
      ).where((item) => text(item['orderId']) == orderId).toList(),
      'kots': listOf(
        snapshot['kots'],
      ).where((kot) => text(kot['orderId']) == orderId).toList(),
      'payments': listOf(
        snapshot['payments'],
      ).where((payment) => text(payment['orderId']) == orderId).toList(),
      'table': ?table,
    };
  }

  Future<void> _capture(Map<String, dynamic> snapshot) async {
    for (final order in listOf(snapshot['orders'])) {
      final orderId = text(order['id']);
      if (orderId.isEmpty) continue;
      final key = 'order_aggregate:$orderId';
      final existing = await (db.select(
        db.syncRecords,
      )..where((row) => row.key.equals(key))).getSingleOrNull();
      final source = _aggregate(snapshot, order);
      final sourceOrder = Map<String, dynamic>.from(source['order'] as Map)
        ..remove('version');
      final sourceHash = _hash({...source, 'order': sourceOrder});
      if (existing?.sourceHash == sourceHash) continue;

      final declaredVersion = intValue(order['version']).clamp(1, 1 << 30);
      final version = existing == null
          ? declaredVersion
          : (existing.version + 1).clamp(1, 1 << 30);
      final baseVersion = existing?.syncedVersion ?? (declaredVersion - 1);
      final updatedAt =
          DateTime.tryParse(text(order['updatedAt']))?.toUtc() ??
          DateTime.now().toUtc();
      final payload = {
        ...source,
        'order': {
          ...Map<String, dynamic>.from(source['order'] as Map),
          'version': version,
          'isClosed': _isClosed(order),
        },
      };
      final payloadHash = _hash(payload);
      final batchId = 'batch_${const Uuid().v4()}';
      await db.transaction(() async {
        await db
            .into(db.syncRecords)
            .insertOnConflictUpdate(
              SyncRecordsCompanion.insert(
                key: key,
                entityType: 'order_aggregate',
                entityId: orderId,
                orderUuid: Value(text(order['orderUuid'], fallback: orderId)),
                version: version,
                baseVersion: baseVersion,
                syncedVersion: Value(existing?.syncedVersion ?? baseVersion),
                sourceHash: sourceHash,
                payloadHash: payloadHash,
                updatedAt: updatedAt,
                syncedAt: Value(existing?.syncedAt),
              ),
            );
        await db
            .into(db.syncOutbox)
            .insertOnConflictUpdate(
              SyncOutboxCompanion.insert(
                key: key,
                entityType: 'order_aggregate',
                entityId: orderId,
                orderUuid: text(order['orderUuid'], fallback: orderId),
                baseVersion: baseVersion,
                version: version,
                operation: 'upsert',
                updatedAt: updatedAt,
                isClosed: _isClosed(order),
                payloadHash: payloadHash,
                payloadJson: jsonEncode(payload),
                batchId: batchId,
              ),
            );
      });
    }
    await db.saveSnapshot(snapshot);
  }

  Future<String> _deviceId() async {
    final existing = await db.stateValue('deviceId');
    if (existing != null && existing.isNotEmpty) return existing;
    final next = 'flutter_${const Uuid().v4()}';
    await db.setStateValue('deviceId', next);
    return next;
  }

  String get _cursorKey => 'cursor:${api.session.outletId}';

  Future<int> _cursor() async =>
      int.tryParse(await db.stateValue(_cursorKey) ?? '') ?? 0;

  Future<MobileOrderSyncResult> sync(Map<String, dynamic> snapshot) {
    return _active ??= _run(snapshot).whenComplete(() => _active = null);
  }

  Future<MobileOrderSyncResult> _run(Map<String, dynamic> snapshot) async {
    await _capture(snapshot);
    final deviceId = await _deviceId();
    var cursor = await _cursor();
    var uploaded = 0;
    var conflictCount = 0;
    final pending = await (db.select(
      db.syncOutbox,
    )..orderBy([(row) => OrderingTerm.asc(row.updatedAt)])).get();
    for (final row in pending) {
      if (row.nextRetryAt?.isAfter(DateTime.now().toUtc()) == true) continue;
      try {
        final result = await api.pushOrderDeltas({
          'protocolVersion': 2,
          'deviceId': deviceId,
          'batchId': row.batchId,
          'baseCursor': cursor,
          'changes': [
            {
              'entityType': row.entityType,
              'entityId': row.entityId,
              'orderUuid': row.orderUuid,
              'baseVersion': row.baseVersion,
              'version': row.version,
              'operation': row.operation,
              'updatedAt': row.updatedAt.toUtc().toIso8601String(),
              'isClosed': row.isClosed,
              'payloadHash': row.payloadHash,
              'payload': jsonDecode(row.payloadJson),
            },
          ],
        });
        cursor = intValue(result['cursor']).clamp(cursor, 1 << 62);
        await db.setStateValue(_cursorKey, '$cursor');
        final acknowledgements = [
          ...listOf(result['accepted']),
          ...listOf(result['duplicates']),
        ];
        for (final acknowledgement in acknowledgements) {
          if (text(acknowledgement['entityId']) == row.entityId &&
              intValue(acknowledgement['version']) == row.version &&
              text(acknowledgement['payloadHash']) == row.payloadHash) {
            await db.transaction(() async {
              final current =
                  await (db.select(db.syncRecords)
                        ..where((record) => record.key.equals(row.key)))
                      .getSingleOrNull();
              if (current?.version == row.version &&
                  current?.payloadHash == row.payloadHash) {
                await (db.update(
                  db.syncRecords,
                )..where((record) => record.key.equals(row.key))).write(
                  SyncRecordsCompanion(
                    syncedVersion: Value(row.version),
                    baseVersion: Value(row.version),
                    syncedAt: Value(
                      DateTime.tryParse(
                            text(acknowledgement['syncedAt']),
                          )?.toUtc() ??
                          DateTime.now().toUtc(),
                    ),
                    conflictState: const Value(null),
                  ),
                );
              }
              await (db.delete(db.syncOutbox)..where(
                    (pending) =>
                        pending.key.equals(row.key) &
                        pending.version.equals(row.version) &
                        pending.payloadHash.equals(row.payloadHash),
                  ))
                  .go();
            });
            uploaded++;
          }
        }
        for (final conflict in listOf(result['conflicts'])) {
          if (text(conflict['entityId']) != row.entityId) continue;
          final code = text(conflict['code'], fallback: 'VERSION_CONFLICT');
          await db.transaction(() async {
            await db
                .into(db.syncConflicts)
                .insertOnConflictUpdate(
                  SyncConflictsCompanion.insert(
                    key: '${row.key}:${row.version}',
                    entityId: row.entityId,
                    orderUuid: row.orderUuid,
                    code: code,
                    detailsJson: jsonEncode(conflict),
                    createdAt: DateTime.now().toUtc(),
                  ),
                );
            await (db.update(db.syncRecords)
                  ..where((record) => record.key.equals(row.key)))
                .write(SyncRecordsCompanion(conflictState: Value(code)));
            await (db.delete(
              db.syncOutbox,
            )..where((pending) => pending.key.equals(row.key))).go();
          });
          conflictCount++;
        }
      } catch (_) {
        final retry = row.retryCount + 1;
        const minutes = [1, 5, 15, 60];
        final delay = minutes[(retry - 1).clamp(0, minutes.length - 1)];
        await (db.update(
          db.syncOutbox,
        )..where((pending) => pending.key.equals(row.key))).write(
          SyncOutboxCompanion(
            retryCount: Value(retry),
            nextRetryAt: Value(
              DateTime.now().toUtc().add(Duration(minutes: delay)),
            ),
          ),
        );
        rethrow;
      }
    }
    final merged = await _pull(snapshot, cursor);
    await db.saveSnapshot(merged);
    return MobileOrderSyncResult(
      snapshot: merged,
      uploaded: uploaded,
      conflicts: conflictCount,
    );
  }

  Future<Map<String, dynamic>> _pull(
    Map<String, dynamic> initial,
    int initialCursor,
  ) async {
    var snapshot = deepCopy(initial);
    var cursor = initialCursor;
    var hasMore = true;
    while (hasMore) {
      final page = await api.pullOrderDeltas(cursor);
      for (final change in listOf(page['changes'])) {
        final key = '${text(change['entityType'])}:${text(change['entityId'])}';
        final pending = await (db.select(
          db.syncOutbox,
        )..where((row) => row.key.equals(key))).getSingleOrNull();
        if (pending != null &&
            (pending.version != intValue(change['version']) ||
                pending.payloadHash != text(change['payloadHash']))) {
          final conflictKey = '$key:remote:${intValue(change['version'])}';
          await db
              .into(db.syncConflicts)
              .insertOnConflictUpdate(
                SyncConflictsCompanion.insert(
                  key: conflictKey,
                  entityId: text(change['entityId']),
                  orderUuid: text(change['orderUuid']),
                  code: 'REMOTE_UPDATE_WITH_PENDING_LOCAL_CHANGE',
                  detailsJson: jsonEncode(change),
                  createdAt: DateTime.now().toUtc(),
                ),
              );
          continue;
        }
        snapshot = _merge(snapshot, change);
      }
      cursor = intValue(page['cursor']).clamp(cursor, 1 << 62);
      await db.setStateValue(_cursorKey, '$cursor');
      hasMore = page['hasMore'] == true;
    }
    return snapshot;
  }

  Map<String, dynamic> _merge(
    Map<String, dynamic> source,
    Map<String, dynamic> change,
  ) {
    final next = deepCopy(source);
    final payload = Map<String, dynamic>.from(change['payload'] as Map);
    final orderUuid = text(change['orderUuid']);
    final isClosed = change['isClosed'] == true;
    final order = Map<String, dynamic>.from(payload['order'] as Map)
      ..['id'] = orderUuid
      ..['orderUuid'] = orderUuid
      ..['version'] = intValue(change['version'])
      ..['isClosed'] = isClosed;
    next['orders'] = [
      order,
      ...listOf(
        next['orders'],
      ).where((candidate) => text(candidate['id']) != orderUuid),
    ];
    for (final collection in ['orderItems', 'kots', 'payments']) {
      next[collection] = [
        ...listOf(payload[collection]),
        ...listOf(
          next[collection],
        ).where((candidate) => text(candidate['orderId']) != orderUuid),
      ];
    }
    if (payload['table'] is Map) {
      final table = Map<String, dynamic>.from(payload['table'] as Map);
      next['tables'] = [
        table,
        ...listOf(
          next['tables'],
        ).where((candidate) => text(candidate['id']) != text(table['id'])),
      ];
    }
    if (isClosed) {
      final tableId = text(order['tableId']);
      next['tables'] = listOf(next['tables']).map((table) {
        if (text(table['id']) != tableId &&
            text(table['activeOrderId']) != orderUuid) {
          return table;
        }
        return {...table, 'status': 'available', 'activeOrderId': null};
      }).toList();
      final carts = next['savedCarts'] is Map
          ? Map<String, dynamic>.from(next['savedCarts'] as Map)
          : <String, dynamic>{};
      carts.remove(tableId);
      carts.remove(orderUuid);
      next['savedCarts'] = carts;
    }
    return next;
  }
}
