import 'mobile_database.dart';

/// The cache is optional for live LAN reads. Its failure must not hide Desk data.
abstract interface class SnapshotCache {
  Future<Map<String, dynamic>?> load();
  Future<void> save(Map<String, dynamic> snapshot);
}

class DatabaseSnapshotCache implements SnapshotCache {
  DatabaseSnapshotCache(this.database);
  final MobileDatabase database;
  @override
  Future<Map<String, dynamic>?> load() => database.loadSnapshot();
  @override
  Future<void> save(Map<String, dynamic> snapshot) =>
      database.saveSnapshot(snapshot);
}
