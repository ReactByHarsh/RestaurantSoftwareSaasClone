import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'mobile_database.g.dart';

class LocalSnapshots extends Table {
  TextColumn get key => text()();
  TextColumn get payloadJson => text()();
  DateTimeColumn get updatedAt => dateTime()();
  @override
  Set<Column<Object>> get primaryKey => {key};
}

class SyncRecords extends Table {
  TextColumn get key => text()();
  TextColumn get entityType => text()();
  TextColumn get entityId => text()();
  TextColumn get orderUuid => text().nullable()();
  IntColumn get version => integer()();
  IntColumn get baseVersion => integer()();
  IntColumn get syncedVersion => integer().withDefault(const Constant(0))();
  TextColumn get sourceHash => text()();
  TextColumn get payloadHash => text()();
  DateTimeColumn get updatedAt => dateTime()();
  DateTimeColumn get syncedAt => dateTime().nullable()();
  TextColumn get conflictState => text().nullable()();
  @override
  Set<Column<Object>> get primaryKey => {key};
}

class SyncOutbox extends Table {
  TextColumn get key => text()();
  TextColumn get entityType => text()();
  TextColumn get entityId => text()();
  TextColumn get orderUuid => text()();
  IntColumn get baseVersion => integer()();
  IntColumn get version => integer()();
  TextColumn get operation => text()();
  DateTimeColumn get updatedAt => dateTime()();
  BoolColumn get isClosed => boolean()();
  TextColumn get payloadHash => text()();
  TextColumn get payloadJson => text()();
  TextColumn get batchId => text()();
  IntColumn get retryCount => integer().withDefault(const Constant(0))();
  DateTimeColumn get nextRetryAt => dateTime().nullable()();
  @override
  Set<Column<Object>> get primaryKey => {key};
}

class SyncState extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();
  @override
  Set<Column<Object>> get primaryKey => {key};
}

class SyncConflicts extends Table {
  TextColumn get key => text()();
  TextColumn get entityId => text()();
  TextColumn get orderUuid => text()();
  TextColumn get code => text()();
  TextColumn get detailsJson => text()();
  DateTimeColumn get createdAt => dateTime()();
  @override
  Set<Column<Object>> get primaryKey => {key};
}

@DriftDatabase(
  tables: [LocalSnapshots, SyncRecords, SyncOutbox, SyncState, SyncConflicts],
)
class MobileDatabase extends _$MobileDatabase {
  MobileDatabase() : super(driftDatabase(name: 'bhojpatra_mobile'));
  MobileDatabase.forTesting(super.e);

  @override
  int get schemaVersion => 1;

  Future<Map<String, dynamic>?> loadSnapshot() async {
    final row =
        await (select(localSnapshots)
              ..where((candidate) => candidate.key.equals('restaurant')))
            .getSingleOrNull();
    if (row == null) return null;
    final decoded = jsonDecode(row.payloadJson);
    return decoded is Map ? Map<String, dynamic>.from(decoded) : null;
  }

  Future<void> saveSnapshot(Map<String, dynamic> snapshot) =>
      into(localSnapshots).insertOnConflictUpdate(
        LocalSnapshotsCompanion.insert(
          key: 'restaurant',
          payloadJson: jsonEncode(snapshot),
          updatedAt: DateTime.now().toUtc(),
        ),
      );

  Future<String?> stateValue(String key) async => (await (select(
    syncState,
  )..where((row) => row.key.equals(key))).getSingleOrNull())?.value;

  Future<void> setStateValue(String key, String value) => into(
    syncState,
  ).insertOnConflictUpdate(SyncStateCompanion.insert(key: key, value: value));
}

final mobileDatabase = MobileDatabase();
