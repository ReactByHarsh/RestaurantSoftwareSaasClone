// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mobile_database.dart';

// ignore_for_file: type=lint
class $LocalSnapshotsTable extends LocalSnapshots
    with TableInfo<$LocalSnapshotsTable, LocalSnapshot> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $LocalSnapshotsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _payloadJsonMeta = const VerificationMeta(
    'payloadJson',
  );
  @override
  late final GeneratedColumn<String> payloadJson = GeneratedColumn<String>(
    'payload_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [key, payloadJson, updatedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'local_snapshots';
  @override
  VerificationContext validateIntegrity(
    Insertable<LocalSnapshot> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
        _keyMeta,
        key.isAcceptableOrUnknown(data['key']!, _keyMeta),
      );
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('payload_json')) {
      context.handle(
        _payloadJsonMeta,
        payloadJson.isAcceptableOrUnknown(
          data['payload_json']!,
          _payloadJsonMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_payloadJsonMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  LocalSnapshot map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalSnapshot(
      key: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}key'],
      )!,
      payloadJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payload_json'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $LocalSnapshotsTable createAlias(String alias) {
    return $LocalSnapshotsTable(attachedDatabase, alias);
  }
}

class LocalSnapshot extends DataClass implements Insertable<LocalSnapshot> {
  final String key;
  final String payloadJson;
  final DateTime updatedAt;
  const LocalSnapshot({
    required this.key,
    required this.payloadJson,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['payload_json'] = Variable<String>(payloadJson);
    map['updated_at'] = Variable<DateTime>(updatedAt);
    return map;
  }

  LocalSnapshotsCompanion toCompanion(bool nullToAbsent) {
    return LocalSnapshotsCompanion(
      key: Value(key),
      payloadJson: Value(payloadJson),
      updatedAt: Value(updatedAt),
    );
  }

  factory LocalSnapshot.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalSnapshot(
      key: serializer.fromJson<String>(json['key']),
      payloadJson: serializer.fromJson<String>(json['payloadJson']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'payloadJson': serializer.toJson<String>(payloadJson),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
    };
  }

  LocalSnapshot copyWith({
    String? key,
    String? payloadJson,
    DateTime? updatedAt,
  }) => LocalSnapshot(
    key: key ?? this.key,
    payloadJson: payloadJson ?? this.payloadJson,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  LocalSnapshot copyWithCompanion(LocalSnapshotsCompanion data) {
    return LocalSnapshot(
      key: data.key.present ? data.key.value : this.key,
      payloadJson: data.payloadJson.present
          ? data.payloadJson.value
          : this.payloadJson,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalSnapshot(')
          ..write('key: $key, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(key, payloadJson, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalSnapshot &&
          other.key == this.key &&
          other.payloadJson == this.payloadJson &&
          other.updatedAt == this.updatedAt);
}

class LocalSnapshotsCompanion extends UpdateCompanion<LocalSnapshot> {
  final Value<String> key;
  final Value<String> payloadJson;
  final Value<DateTime> updatedAt;
  final Value<int> rowid;
  const LocalSnapshotsCompanion({
    this.key = const Value.absent(),
    this.payloadJson = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  LocalSnapshotsCompanion.insert({
    required String key,
    required String payloadJson,
    required DateTime updatedAt,
    this.rowid = const Value.absent(),
  }) : key = Value(key),
       payloadJson = Value(payloadJson),
       updatedAt = Value(updatedAt);
  static Insertable<LocalSnapshot> custom({
    Expression<String>? key,
    Expression<String>? payloadJson,
    Expression<DateTime>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (payloadJson != null) 'payload_json': payloadJson,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  LocalSnapshotsCompanion copyWith({
    Value<String>? key,
    Value<String>? payloadJson,
    Value<DateTime>? updatedAt,
    Value<int>? rowid,
  }) {
    return LocalSnapshotsCompanion(
      key: key ?? this.key,
      payloadJson: payloadJson ?? this.payloadJson,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (payloadJson.present) {
      map['payload_json'] = Variable<String>(payloadJson.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('LocalSnapshotsCompanion(')
          ..write('key: $key, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SyncRecordsTable extends SyncRecords
    with TableInfo<$SyncRecordsTable, SyncRecord> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SyncRecordsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _entityTypeMeta = const VerificationMeta(
    'entityType',
  );
  @override
  late final GeneratedColumn<String> entityType = GeneratedColumn<String>(
    'entity_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _entityIdMeta = const VerificationMeta(
    'entityId',
  );
  @override
  late final GeneratedColumn<String> entityId = GeneratedColumn<String>(
    'entity_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _orderUuidMeta = const VerificationMeta(
    'orderUuid',
  );
  @override
  late final GeneratedColumn<String> orderUuid = GeneratedColumn<String>(
    'order_uuid',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _versionMeta = const VerificationMeta(
    'version',
  );
  @override
  late final GeneratedColumn<int> version = GeneratedColumn<int>(
    'version',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _baseVersionMeta = const VerificationMeta(
    'baseVersion',
  );
  @override
  late final GeneratedColumn<int> baseVersion = GeneratedColumn<int>(
    'base_version',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _syncedVersionMeta = const VerificationMeta(
    'syncedVersion',
  );
  @override
  late final GeneratedColumn<int> syncedVersion = GeneratedColumn<int>(
    'synced_version',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _sourceHashMeta = const VerificationMeta(
    'sourceHash',
  );
  @override
  late final GeneratedColumn<String> sourceHash = GeneratedColumn<String>(
    'source_hash',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _payloadHashMeta = const VerificationMeta(
    'payloadHash',
  );
  @override
  late final GeneratedColumn<String> payloadHash = GeneratedColumn<String>(
    'payload_hash',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _syncedAtMeta = const VerificationMeta(
    'syncedAt',
  );
  @override
  late final GeneratedColumn<DateTime> syncedAt = GeneratedColumn<DateTime>(
    'synced_at',
    aliasedName,
    true,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _conflictStateMeta = const VerificationMeta(
    'conflictState',
  );
  @override
  late final GeneratedColumn<String> conflictState = GeneratedColumn<String>(
    'conflict_state',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    key,
    entityType,
    entityId,
    orderUuid,
    version,
    baseVersion,
    syncedVersion,
    sourceHash,
    payloadHash,
    updatedAt,
    syncedAt,
    conflictState,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sync_records';
  @override
  VerificationContext validateIntegrity(
    Insertable<SyncRecord> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
        _keyMeta,
        key.isAcceptableOrUnknown(data['key']!, _keyMeta),
      );
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('entity_type')) {
      context.handle(
        _entityTypeMeta,
        entityType.isAcceptableOrUnknown(data['entity_type']!, _entityTypeMeta),
      );
    } else if (isInserting) {
      context.missing(_entityTypeMeta);
    }
    if (data.containsKey('entity_id')) {
      context.handle(
        _entityIdMeta,
        entityId.isAcceptableOrUnknown(data['entity_id']!, _entityIdMeta),
      );
    } else if (isInserting) {
      context.missing(_entityIdMeta);
    }
    if (data.containsKey('order_uuid')) {
      context.handle(
        _orderUuidMeta,
        orderUuid.isAcceptableOrUnknown(data['order_uuid']!, _orderUuidMeta),
      );
    }
    if (data.containsKey('version')) {
      context.handle(
        _versionMeta,
        version.isAcceptableOrUnknown(data['version']!, _versionMeta),
      );
    } else if (isInserting) {
      context.missing(_versionMeta);
    }
    if (data.containsKey('base_version')) {
      context.handle(
        _baseVersionMeta,
        baseVersion.isAcceptableOrUnknown(
          data['base_version']!,
          _baseVersionMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_baseVersionMeta);
    }
    if (data.containsKey('synced_version')) {
      context.handle(
        _syncedVersionMeta,
        syncedVersion.isAcceptableOrUnknown(
          data['synced_version']!,
          _syncedVersionMeta,
        ),
      );
    }
    if (data.containsKey('source_hash')) {
      context.handle(
        _sourceHashMeta,
        sourceHash.isAcceptableOrUnknown(data['source_hash']!, _sourceHashMeta),
      );
    } else if (isInserting) {
      context.missing(_sourceHashMeta);
    }
    if (data.containsKey('payload_hash')) {
      context.handle(
        _payloadHashMeta,
        payloadHash.isAcceptableOrUnknown(
          data['payload_hash']!,
          _payloadHashMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_payloadHashMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    if (data.containsKey('synced_at')) {
      context.handle(
        _syncedAtMeta,
        syncedAt.isAcceptableOrUnknown(data['synced_at']!, _syncedAtMeta),
      );
    }
    if (data.containsKey('conflict_state')) {
      context.handle(
        _conflictStateMeta,
        conflictState.isAcceptableOrUnknown(
          data['conflict_state']!,
          _conflictStateMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  SyncRecord map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SyncRecord(
      key: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}key'],
      )!,
      entityType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}entity_type'],
      )!,
      entityId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}entity_id'],
      )!,
      orderUuid: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}order_uuid'],
      ),
      version: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}version'],
      )!,
      baseVersion: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}base_version'],
      )!,
      syncedVersion: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}synced_version'],
      )!,
      sourceHash: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}source_hash'],
      )!,
      payloadHash: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payload_hash'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}updated_at'],
      )!,
      syncedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}synced_at'],
      ),
      conflictState: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}conflict_state'],
      ),
    );
  }

  @override
  $SyncRecordsTable createAlias(String alias) {
    return $SyncRecordsTable(attachedDatabase, alias);
  }
}

class SyncRecord extends DataClass implements Insertable<SyncRecord> {
  final String key;
  final String entityType;
  final String entityId;
  final String? orderUuid;
  final int version;
  final int baseVersion;
  final int syncedVersion;
  final String sourceHash;
  final String payloadHash;
  final DateTime updatedAt;
  final DateTime? syncedAt;
  final String? conflictState;
  const SyncRecord({
    required this.key,
    required this.entityType,
    required this.entityId,
    this.orderUuid,
    required this.version,
    required this.baseVersion,
    required this.syncedVersion,
    required this.sourceHash,
    required this.payloadHash,
    required this.updatedAt,
    this.syncedAt,
    this.conflictState,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['entity_type'] = Variable<String>(entityType);
    map['entity_id'] = Variable<String>(entityId);
    if (!nullToAbsent || orderUuid != null) {
      map['order_uuid'] = Variable<String>(orderUuid);
    }
    map['version'] = Variable<int>(version);
    map['base_version'] = Variable<int>(baseVersion);
    map['synced_version'] = Variable<int>(syncedVersion);
    map['source_hash'] = Variable<String>(sourceHash);
    map['payload_hash'] = Variable<String>(payloadHash);
    map['updated_at'] = Variable<DateTime>(updatedAt);
    if (!nullToAbsent || syncedAt != null) {
      map['synced_at'] = Variable<DateTime>(syncedAt);
    }
    if (!nullToAbsent || conflictState != null) {
      map['conflict_state'] = Variable<String>(conflictState);
    }
    return map;
  }

  SyncRecordsCompanion toCompanion(bool nullToAbsent) {
    return SyncRecordsCompanion(
      key: Value(key),
      entityType: Value(entityType),
      entityId: Value(entityId),
      orderUuid: orderUuid == null && nullToAbsent
          ? const Value.absent()
          : Value(orderUuid),
      version: Value(version),
      baseVersion: Value(baseVersion),
      syncedVersion: Value(syncedVersion),
      sourceHash: Value(sourceHash),
      payloadHash: Value(payloadHash),
      updatedAt: Value(updatedAt),
      syncedAt: syncedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(syncedAt),
      conflictState: conflictState == null && nullToAbsent
          ? const Value.absent()
          : Value(conflictState),
    );
  }

  factory SyncRecord.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SyncRecord(
      key: serializer.fromJson<String>(json['key']),
      entityType: serializer.fromJson<String>(json['entityType']),
      entityId: serializer.fromJson<String>(json['entityId']),
      orderUuid: serializer.fromJson<String?>(json['orderUuid']),
      version: serializer.fromJson<int>(json['version']),
      baseVersion: serializer.fromJson<int>(json['baseVersion']),
      syncedVersion: serializer.fromJson<int>(json['syncedVersion']),
      sourceHash: serializer.fromJson<String>(json['sourceHash']),
      payloadHash: serializer.fromJson<String>(json['payloadHash']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
      syncedAt: serializer.fromJson<DateTime?>(json['syncedAt']),
      conflictState: serializer.fromJson<String?>(json['conflictState']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'entityType': serializer.toJson<String>(entityType),
      'entityId': serializer.toJson<String>(entityId),
      'orderUuid': serializer.toJson<String?>(orderUuid),
      'version': serializer.toJson<int>(version),
      'baseVersion': serializer.toJson<int>(baseVersion),
      'syncedVersion': serializer.toJson<int>(syncedVersion),
      'sourceHash': serializer.toJson<String>(sourceHash),
      'payloadHash': serializer.toJson<String>(payloadHash),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
      'syncedAt': serializer.toJson<DateTime?>(syncedAt),
      'conflictState': serializer.toJson<String?>(conflictState),
    };
  }

  SyncRecord copyWith({
    String? key,
    String? entityType,
    String? entityId,
    Value<String?> orderUuid = const Value.absent(),
    int? version,
    int? baseVersion,
    int? syncedVersion,
    String? sourceHash,
    String? payloadHash,
    DateTime? updatedAt,
    Value<DateTime?> syncedAt = const Value.absent(),
    Value<String?> conflictState = const Value.absent(),
  }) => SyncRecord(
    key: key ?? this.key,
    entityType: entityType ?? this.entityType,
    entityId: entityId ?? this.entityId,
    orderUuid: orderUuid.present ? orderUuid.value : this.orderUuid,
    version: version ?? this.version,
    baseVersion: baseVersion ?? this.baseVersion,
    syncedVersion: syncedVersion ?? this.syncedVersion,
    sourceHash: sourceHash ?? this.sourceHash,
    payloadHash: payloadHash ?? this.payloadHash,
    updatedAt: updatedAt ?? this.updatedAt,
    syncedAt: syncedAt.present ? syncedAt.value : this.syncedAt,
    conflictState: conflictState.present
        ? conflictState.value
        : this.conflictState,
  );
  SyncRecord copyWithCompanion(SyncRecordsCompanion data) {
    return SyncRecord(
      key: data.key.present ? data.key.value : this.key,
      entityType: data.entityType.present
          ? data.entityType.value
          : this.entityType,
      entityId: data.entityId.present ? data.entityId.value : this.entityId,
      orderUuid: data.orderUuid.present ? data.orderUuid.value : this.orderUuid,
      version: data.version.present ? data.version.value : this.version,
      baseVersion: data.baseVersion.present
          ? data.baseVersion.value
          : this.baseVersion,
      syncedVersion: data.syncedVersion.present
          ? data.syncedVersion.value
          : this.syncedVersion,
      sourceHash: data.sourceHash.present
          ? data.sourceHash.value
          : this.sourceHash,
      payloadHash: data.payloadHash.present
          ? data.payloadHash.value
          : this.payloadHash,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      syncedAt: data.syncedAt.present ? data.syncedAt.value : this.syncedAt,
      conflictState: data.conflictState.present
          ? data.conflictState.value
          : this.conflictState,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SyncRecord(')
          ..write('key: $key, ')
          ..write('entityType: $entityType, ')
          ..write('entityId: $entityId, ')
          ..write('orderUuid: $orderUuid, ')
          ..write('version: $version, ')
          ..write('baseVersion: $baseVersion, ')
          ..write('syncedVersion: $syncedVersion, ')
          ..write('sourceHash: $sourceHash, ')
          ..write('payloadHash: $payloadHash, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('syncedAt: $syncedAt, ')
          ..write('conflictState: $conflictState')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    key,
    entityType,
    entityId,
    orderUuid,
    version,
    baseVersion,
    syncedVersion,
    sourceHash,
    payloadHash,
    updatedAt,
    syncedAt,
    conflictState,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SyncRecord &&
          other.key == this.key &&
          other.entityType == this.entityType &&
          other.entityId == this.entityId &&
          other.orderUuid == this.orderUuid &&
          other.version == this.version &&
          other.baseVersion == this.baseVersion &&
          other.syncedVersion == this.syncedVersion &&
          other.sourceHash == this.sourceHash &&
          other.payloadHash == this.payloadHash &&
          other.updatedAt == this.updatedAt &&
          other.syncedAt == this.syncedAt &&
          other.conflictState == this.conflictState);
}

class SyncRecordsCompanion extends UpdateCompanion<SyncRecord> {
  final Value<String> key;
  final Value<String> entityType;
  final Value<String> entityId;
  final Value<String?> orderUuid;
  final Value<int> version;
  final Value<int> baseVersion;
  final Value<int> syncedVersion;
  final Value<String> sourceHash;
  final Value<String> payloadHash;
  final Value<DateTime> updatedAt;
  final Value<DateTime?> syncedAt;
  final Value<String?> conflictState;
  final Value<int> rowid;
  const SyncRecordsCompanion({
    this.key = const Value.absent(),
    this.entityType = const Value.absent(),
    this.entityId = const Value.absent(),
    this.orderUuid = const Value.absent(),
    this.version = const Value.absent(),
    this.baseVersion = const Value.absent(),
    this.syncedVersion = const Value.absent(),
    this.sourceHash = const Value.absent(),
    this.payloadHash = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.syncedAt = const Value.absent(),
    this.conflictState = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SyncRecordsCompanion.insert({
    required String key,
    required String entityType,
    required String entityId,
    this.orderUuid = const Value.absent(),
    required int version,
    required int baseVersion,
    this.syncedVersion = const Value.absent(),
    required String sourceHash,
    required String payloadHash,
    required DateTime updatedAt,
    this.syncedAt = const Value.absent(),
    this.conflictState = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : key = Value(key),
       entityType = Value(entityType),
       entityId = Value(entityId),
       version = Value(version),
       baseVersion = Value(baseVersion),
       sourceHash = Value(sourceHash),
       payloadHash = Value(payloadHash),
       updatedAt = Value(updatedAt);
  static Insertable<SyncRecord> custom({
    Expression<String>? key,
    Expression<String>? entityType,
    Expression<String>? entityId,
    Expression<String>? orderUuid,
    Expression<int>? version,
    Expression<int>? baseVersion,
    Expression<int>? syncedVersion,
    Expression<String>? sourceHash,
    Expression<String>? payloadHash,
    Expression<DateTime>? updatedAt,
    Expression<DateTime>? syncedAt,
    Expression<String>? conflictState,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (entityType != null) 'entity_type': entityType,
      if (entityId != null) 'entity_id': entityId,
      if (orderUuid != null) 'order_uuid': orderUuid,
      if (version != null) 'version': version,
      if (baseVersion != null) 'base_version': baseVersion,
      if (syncedVersion != null) 'synced_version': syncedVersion,
      if (sourceHash != null) 'source_hash': sourceHash,
      if (payloadHash != null) 'payload_hash': payloadHash,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (syncedAt != null) 'synced_at': syncedAt,
      if (conflictState != null) 'conflict_state': conflictState,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SyncRecordsCompanion copyWith({
    Value<String>? key,
    Value<String>? entityType,
    Value<String>? entityId,
    Value<String?>? orderUuid,
    Value<int>? version,
    Value<int>? baseVersion,
    Value<int>? syncedVersion,
    Value<String>? sourceHash,
    Value<String>? payloadHash,
    Value<DateTime>? updatedAt,
    Value<DateTime?>? syncedAt,
    Value<String?>? conflictState,
    Value<int>? rowid,
  }) {
    return SyncRecordsCompanion(
      key: key ?? this.key,
      entityType: entityType ?? this.entityType,
      entityId: entityId ?? this.entityId,
      orderUuid: orderUuid ?? this.orderUuid,
      version: version ?? this.version,
      baseVersion: baseVersion ?? this.baseVersion,
      syncedVersion: syncedVersion ?? this.syncedVersion,
      sourceHash: sourceHash ?? this.sourceHash,
      payloadHash: payloadHash ?? this.payloadHash,
      updatedAt: updatedAt ?? this.updatedAt,
      syncedAt: syncedAt ?? this.syncedAt,
      conflictState: conflictState ?? this.conflictState,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (entityType.present) {
      map['entity_type'] = Variable<String>(entityType.value);
    }
    if (entityId.present) {
      map['entity_id'] = Variable<String>(entityId.value);
    }
    if (orderUuid.present) {
      map['order_uuid'] = Variable<String>(orderUuid.value);
    }
    if (version.present) {
      map['version'] = Variable<int>(version.value);
    }
    if (baseVersion.present) {
      map['base_version'] = Variable<int>(baseVersion.value);
    }
    if (syncedVersion.present) {
      map['synced_version'] = Variable<int>(syncedVersion.value);
    }
    if (sourceHash.present) {
      map['source_hash'] = Variable<String>(sourceHash.value);
    }
    if (payloadHash.present) {
      map['payload_hash'] = Variable<String>(payloadHash.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (syncedAt.present) {
      map['synced_at'] = Variable<DateTime>(syncedAt.value);
    }
    if (conflictState.present) {
      map['conflict_state'] = Variable<String>(conflictState.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SyncRecordsCompanion(')
          ..write('key: $key, ')
          ..write('entityType: $entityType, ')
          ..write('entityId: $entityId, ')
          ..write('orderUuid: $orderUuid, ')
          ..write('version: $version, ')
          ..write('baseVersion: $baseVersion, ')
          ..write('syncedVersion: $syncedVersion, ')
          ..write('sourceHash: $sourceHash, ')
          ..write('payloadHash: $payloadHash, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('syncedAt: $syncedAt, ')
          ..write('conflictState: $conflictState, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SyncOutboxTable extends SyncOutbox
    with TableInfo<$SyncOutboxTable, SyncOutboxData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SyncOutboxTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _entityTypeMeta = const VerificationMeta(
    'entityType',
  );
  @override
  late final GeneratedColumn<String> entityType = GeneratedColumn<String>(
    'entity_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _entityIdMeta = const VerificationMeta(
    'entityId',
  );
  @override
  late final GeneratedColumn<String> entityId = GeneratedColumn<String>(
    'entity_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _orderUuidMeta = const VerificationMeta(
    'orderUuid',
  );
  @override
  late final GeneratedColumn<String> orderUuid = GeneratedColumn<String>(
    'order_uuid',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _baseVersionMeta = const VerificationMeta(
    'baseVersion',
  );
  @override
  late final GeneratedColumn<int> baseVersion = GeneratedColumn<int>(
    'base_version',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _versionMeta = const VerificationMeta(
    'version',
  );
  @override
  late final GeneratedColumn<int> version = GeneratedColumn<int>(
    'version',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _operationMeta = const VerificationMeta(
    'operation',
  );
  @override
  late final GeneratedColumn<String> operation = GeneratedColumn<String>(
    'operation',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _isClosedMeta = const VerificationMeta(
    'isClosed',
  );
  @override
  late final GeneratedColumn<bool> isClosed = GeneratedColumn<bool>(
    'is_closed',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("is_closed" IN (0, 1))',
    ),
  );
  static const VerificationMeta _payloadHashMeta = const VerificationMeta(
    'payloadHash',
  );
  @override
  late final GeneratedColumn<String> payloadHash = GeneratedColumn<String>(
    'payload_hash',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _payloadJsonMeta = const VerificationMeta(
    'payloadJson',
  );
  @override
  late final GeneratedColumn<String> payloadJson = GeneratedColumn<String>(
    'payload_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _batchIdMeta = const VerificationMeta(
    'batchId',
  );
  @override
  late final GeneratedColumn<String> batchId = GeneratedColumn<String>(
    'batch_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _retryCountMeta = const VerificationMeta(
    'retryCount',
  );
  @override
  late final GeneratedColumn<int> retryCount = GeneratedColumn<int>(
    'retry_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _nextRetryAtMeta = const VerificationMeta(
    'nextRetryAt',
  );
  @override
  late final GeneratedColumn<DateTime> nextRetryAt = GeneratedColumn<DateTime>(
    'next_retry_at',
    aliasedName,
    true,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    key,
    entityType,
    entityId,
    orderUuid,
    baseVersion,
    version,
    operation,
    updatedAt,
    isClosed,
    payloadHash,
    payloadJson,
    batchId,
    retryCount,
    nextRetryAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sync_outbox';
  @override
  VerificationContext validateIntegrity(
    Insertable<SyncOutboxData> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
        _keyMeta,
        key.isAcceptableOrUnknown(data['key']!, _keyMeta),
      );
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('entity_type')) {
      context.handle(
        _entityTypeMeta,
        entityType.isAcceptableOrUnknown(data['entity_type']!, _entityTypeMeta),
      );
    } else if (isInserting) {
      context.missing(_entityTypeMeta);
    }
    if (data.containsKey('entity_id')) {
      context.handle(
        _entityIdMeta,
        entityId.isAcceptableOrUnknown(data['entity_id']!, _entityIdMeta),
      );
    } else if (isInserting) {
      context.missing(_entityIdMeta);
    }
    if (data.containsKey('order_uuid')) {
      context.handle(
        _orderUuidMeta,
        orderUuid.isAcceptableOrUnknown(data['order_uuid']!, _orderUuidMeta),
      );
    } else if (isInserting) {
      context.missing(_orderUuidMeta);
    }
    if (data.containsKey('base_version')) {
      context.handle(
        _baseVersionMeta,
        baseVersion.isAcceptableOrUnknown(
          data['base_version']!,
          _baseVersionMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_baseVersionMeta);
    }
    if (data.containsKey('version')) {
      context.handle(
        _versionMeta,
        version.isAcceptableOrUnknown(data['version']!, _versionMeta),
      );
    } else if (isInserting) {
      context.missing(_versionMeta);
    }
    if (data.containsKey('operation')) {
      context.handle(
        _operationMeta,
        operation.isAcceptableOrUnknown(data['operation']!, _operationMeta),
      );
    } else if (isInserting) {
      context.missing(_operationMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    if (data.containsKey('is_closed')) {
      context.handle(
        _isClosedMeta,
        isClosed.isAcceptableOrUnknown(data['is_closed']!, _isClosedMeta),
      );
    } else if (isInserting) {
      context.missing(_isClosedMeta);
    }
    if (data.containsKey('payload_hash')) {
      context.handle(
        _payloadHashMeta,
        payloadHash.isAcceptableOrUnknown(
          data['payload_hash']!,
          _payloadHashMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_payloadHashMeta);
    }
    if (data.containsKey('payload_json')) {
      context.handle(
        _payloadJsonMeta,
        payloadJson.isAcceptableOrUnknown(
          data['payload_json']!,
          _payloadJsonMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_payloadJsonMeta);
    }
    if (data.containsKey('batch_id')) {
      context.handle(
        _batchIdMeta,
        batchId.isAcceptableOrUnknown(data['batch_id']!, _batchIdMeta),
      );
    } else if (isInserting) {
      context.missing(_batchIdMeta);
    }
    if (data.containsKey('retry_count')) {
      context.handle(
        _retryCountMeta,
        retryCount.isAcceptableOrUnknown(data['retry_count']!, _retryCountMeta),
      );
    }
    if (data.containsKey('next_retry_at')) {
      context.handle(
        _nextRetryAtMeta,
        nextRetryAt.isAcceptableOrUnknown(
          data['next_retry_at']!,
          _nextRetryAtMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  SyncOutboxData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SyncOutboxData(
      key: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}key'],
      )!,
      entityType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}entity_type'],
      )!,
      entityId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}entity_id'],
      )!,
      orderUuid: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}order_uuid'],
      )!,
      baseVersion: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}base_version'],
      )!,
      version: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}version'],
      )!,
      operation: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}operation'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}updated_at'],
      )!,
      isClosed: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_closed'],
      )!,
      payloadHash: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payload_hash'],
      )!,
      payloadJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payload_json'],
      )!,
      batchId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}batch_id'],
      )!,
      retryCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}retry_count'],
      )!,
      nextRetryAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}next_retry_at'],
      ),
    );
  }

  @override
  $SyncOutboxTable createAlias(String alias) {
    return $SyncOutboxTable(attachedDatabase, alias);
  }
}

class SyncOutboxData extends DataClass implements Insertable<SyncOutboxData> {
  final String key;
  final String entityType;
  final String entityId;
  final String orderUuid;
  final int baseVersion;
  final int version;
  final String operation;
  final DateTime updatedAt;
  final bool isClosed;
  final String payloadHash;
  final String payloadJson;
  final String batchId;
  final int retryCount;
  final DateTime? nextRetryAt;
  const SyncOutboxData({
    required this.key,
    required this.entityType,
    required this.entityId,
    required this.orderUuid,
    required this.baseVersion,
    required this.version,
    required this.operation,
    required this.updatedAt,
    required this.isClosed,
    required this.payloadHash,
    required this.payloadJson,
    required this.batchId,
    required this.retryCount,
    this.nextRetryAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['entity_type'] = Variable<String>(entityType);
    map['entity_id'] = Variable<String>(entityId);
    map['order_uuid'] = Variable<String>(orderUuid);
    map['base_version'] = Variable<int>(baseVersion);
    map['version'] = Variable<int>(version);
    map['operation'] = Variable<String>(operation);
    map['updated_at'] = Variable<DateTime>(updatedAt);
    map['is_closed'] = Variable<bool>(isClosed);
    map['payload_hash'] = Variable<String>(payloadHash);
    map['payload_json'] = Variable<String>(payloadJson);
    map['batch_id'] = Variable<String>(batchId);
    map['retry_count'] = Variable<int>(retryCount);
    if (!nullToAbsent || nextRetryAt != null) {
      map['next_retry_at'] = Variable<DateTime>(nextRetryAt);
    }
    return map;
  }

  SyncOutboxCompanion toCompanion(bool nullToAbsent) {
    return SyncOutboxCompanion(
      key: Value(key),
      entityType: Value(entityType),
      entityId: Value(entityId),
      orderUuid: Value(orderUuid),
      baseVersion: Value(baseVersion),
      version: Value(version),
      operation: Value(operation),
      updatedAt: Value(updatedAt),
      isClosed: Value(isClosed),
      payloadHash: Value(payloadHash),
      payloadJson: Value(payloadJson),
      batchId: Value(batchId),
      retryCount: Value(retryCount),
      nextRetryAt: nextRetryAt == null && nullToAbsent
          ? const Value.absent()
          : Value(nextRetryAt),
    );
  }

  factory SyncOutboxData.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SyncOutboxData(
      key: serializer.fromJson<String>(json['key']),
      entityType: serializer.fromJson<String>(json['entityType']),
      entityId: serializer.fromJson<String>(json['entityId']),
      orderUuid: serializer.fromJson<String>(json['orderUuid']),
      baseVersion: serializer.fromJson<int>(json['baseVersion']),
      version: serializer.fromJson<int>(json['version']),
      operation: serializer.fromJson<String>(json['operation']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
      isClosed: serializer.fromJson<bool>(json['isClosed']),
      payloadHash: serializer.fromJson<String>(json['payloadHash']),
      payloadJson: serializer.fromJson<String>(json['payloadJson']),
      batchId: serializer.fromJson<String>(json['batchId']),
      retryCount: serializer.fromJson<int>(json['retryCount']),
      nextRetryAt: serializer.fromJson<DateTime?>(json['nextRetryAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'entityType': serializer.toJson<String>(entityType),
      'entityId': serializer.toJson<String>(entityId),
      'orderUuid': serializer.toJson<String>(orderUuid),
      'baseVersion': serializer.toJson<int>(baseVersion),
      'version': serializer.toJson<int>(version),
      'operation': serializer.toJson<String>(operation),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
      'isClosed': serializer.toJson<bool>(isClosed),
      'payloadHash': serializer.toJson<String>(payloadHash),
      'payloadJson': serializer.toJson<String>(payloadJson),
      'batchId': serializer.toJson<String>(batchId),
      'retryCount': serializer.toJson<int>(retryCount),
      'nextRetryAt': serializer.toJson<DateTime?>(nextRetryAt),
    };
  }

  SyncOutboxData copyWith({
    String? key,
    String? entityType,
    String? entityId,
    String? orderUuid,
    int? baseVersion,
    int? version,
    String? operation,
    DateTime? updatedAt,
    bool? isClosed,
    String? payloadHash,
    String? payloadJson,
    String? batchId,
    int? retryCount,
    Value<DateTime?> nextRetryAt = const Value.absent(),
  }) => SyncOutboxData(
    key: key ?? this.key,
    entityType: entityType ?? this.entityType,
    entityId: entityId ?? this.entityId,
    orderUuid: orderUuid ?? this.orderUuid,
    baseVersion: baseVersion ?? this.baseVersion,
    version: version ?? this.version,
    operation: operation ?? this.operation,
    updatedAt: updatedAt ?? this.updatedAt,
    isClosed: isClosed ?? this.isClosed,
    payloadHash: payloadHash ?? this.payloadHash,
    payloadJson: payloadJson ?? this.payloadJson,
    batchId: batchId ?? this.batchId,
    retryCount: retryCount ?? this.retryCount,
    nextRetryAt: nextRetryAt.present ? nextRetryAt.value : this.nextRetryAt,
  );
  SyncOutboxData copyWithCompanion(SyncOutboxCompanion data) {
    return SyncOutboxData(
      key: data.key.present ? data.key.value : this.key,
      entityType: data.entityType.present
          ? data.entityType.value
          : this.entityType,
      entityId: data.entityId.present ? data.entityId.value : this.entityId,
      orderUuid: data.orderUuid.present ? data.orderUuid.value : this.orderUuid,
      baseVersion: data.baseVersion.present
          ? data.baseVersion.value
          : this.baseVersion,
      version: data.version.present ? data.version.value : this.version,
      operation: data.operation.present ? data.operation.value : this.operation,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      isClosed: data.isClosed.present ? data.isClosed.value : this.isClosed,
      payloadHash: data.payloadHash.present
          ? data.payloadHash.value
          : this.payloadHash,
      payloadJson: data.payloadJson.present
          ? data.payloadJson.value
          : this.payloadJson,
      batchId: data.batchId.present ? data.batchId.value : this.batchId,
      retryCount: data.retryCount.present
          ? data.retryCount.value
          : this.retryCount,
      nextRetryAt: data.nextRetryAt.present
          ? data.nextRetryAt.value
          : this.nextRetryAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SyncOutboxData(')
          ..write('key: $key, ')
          ..write('entityType: $entityType, ')
          ..write('entityId: $entityId, ')
          ..write('orderUuid: $orderUuid, ')
          ..write('baseVersion: $baseVersion, ')
          ..write('version: $version, ')
          ..write('operation: $operation, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('isClosed: $isClosed, ')
          ..write('payloadHash: $payloadHash, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('batchId: $batchId, ')
          ..write('retryCount: $retryCount, ')
          ..write('nextRetryAt: $nextRetryAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    key,
    entityType,
    entityId,
    orderUuid,
    baseVersion,
    version,
    operation,
    updatedAt,
    isClosed,
    payloadHash,
    payloadJson,
    batchId,
    retryCount,
    nextRetryAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SyncOutboxData &&
          other.key == this.key &&
          other.entityType == this.entityType &&
          other.entityId == this.entityId &&
          other.orderUuid == this.orderUuid &&
          other.baseVersion == this.baseVersion &&
          other.version == this.version &&
          other.operation == this.operation &&
          other.updatedAt == this.updatedAt &&
          other.isClosed == this.isClosed &&
          other.payloadHash == this.payloadHash &&
          other.payloadJson == this.payloadJson &&
          other.batchId == this.batchId &&
          other.retryCount == this.retryCount &&
          other.nextRetryAt == this.nextRetryAt);
}

class SyncOutboxCompanion extends UpdateCompanion<SyncOutboxData> {
  final Value<String> key;
  final Value<String> entityType;
  final Value<String> entityId;
  final Value<String> orderUuid;
  final Value<int> baseVersion;
  final Value<int> version;
  final Value<String> operation;
  final Value<DateTime> updatedAt;
  final Value<bool> isClosed;
  final Value<String> payloadHash;
  final Value<String> payloadJson;
  final Value<String> batchId;
  final Value<int> retryCount;
  final Value<DateTime?> nextRetryAt;
  final Value<int> rowid;
  const SyncOutboxCompanion({
    this.key = const Value.absent(),
    this.entityType = const Value.absent(),
    this.entityId = const Value.absent(),
    this.orderUuid = const Value.absent(),
    this.baseVersion = const Value.absent(),
    this.version = const Value.absent(),
    this.operation = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.isClosed = const Value.absent(),
    this.payloadHash = const Value.absent(),
    this.payloadJson = const Value.absent(),
    this.batchId = const Value.absent(),
    this.retryCount = const Value.absent(),
    this.nextRetryAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SyncOutboxCompanion.insert({
    required String key,
    required String entityType,
    required String entityId,
    required String orderUuid,
    required int baseVersion,
    required int version,
    required String operation,
    required DateTime updatedAt,
    required bool isClosed,
    required String payloadHash,
    required String payloadJson,
    required String batchId,
    this.retryCount = const Value.absent(),
    this.nextRetryAt = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : key = Value(key),
       entityType = Value(entityType),
       entityId = Value(entityId),
       orderUuid = Value(orderUuid),
       baseVersion = Value(baseVersion),
       version = Value(version),
       operation = Value(operation),
       updatedAt = Value(updatedAt),
       isClosed = Value(isClosed),
       payloadHash = Value(payloadHash),
       payloadJson = Value(payloadJson),
       batchId = Value(batchId);
  static Insertable<SyncOutboxData> custom({
    Expression<String>? key,
    Expression<String>? entityType,
    Expression<String>? entityId,
    Expression<String>? orderUuid,
    Expression<int>? baseVersion,
    Expression<int>? version,
    Expression<String>? operation,
    Expression<DateTime>? updatedAt,
    Expression<bool>? isClosed,
    Expression<String>? payloadHash,
    Expression<String>? payloadJson,
    Expression<String>? batchId,
    Expression<int>? retryCount,
    Expression<DateTime>? nextRetryAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (entityType != null) 'entity_type': entityType,
      if (entityId != null) 'entity_id': entityId,
      if (orderUuid != null) 'order_uuid': orderUuid,
      if (baseVersion != null) 'base_version': baseVersion,
      if (version != null) 'version': version,
      if (operation != null) 'operation': operation,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (isClosed != null) 'is_closed': isClosed,
      if (payloadHash != null) 'payload_hash': payloadHash,
      if (payloadJson != null) 'payload_json': payloadJson,
      if (batchId != null) 'batch_id': batchId,
      if (retryCount != null) 'retry_count': retryCount,
      if (nextRetryAt != null) 'next_retry_at': nextRetryAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SyncOutboxCompanion copyWith({
    Value<String>? key,
    Value<String>? entityType,
    Value<String>? entityId,
    Value<String>? orderUuid,
    Value<int>? baseVersion,
    Value<int>? version,
    Value<String>? operation,
    Value<DateTime>? updatedAt,
    Value<bool>? isClosed,
    Value<String>? payloadHash,
    Value<String>? payloadJson,
    Value<String>? batchId,
    Value<int>? retryCount,
    Value<DateTime?>? nextRetryAt,
    Value<int>? rowid,
  }) {
    return SyncOutboxCompanion(
      key: key ?? this.key,
      entityType: entityType ?? this.entityType,
      entityId: entityId ?? this.entityId,
      orderUuid: orderUuid ?? this.orderUuid,
      baseVersion: baseVersion ?? this.baseVersion,
      version: version ?? this.version,
      operation: operation ?? this.operation,
      updatedAt: updatedAt ?? this.updatedAt,
      isClosed: isClosed ?? this.isClosed,
      payloadHash: payloadHash ?? this.payloadHash,
      payloadJson: payloadJson ?? this.payloadJson,
      batchId: batchId ?? this.batchId,
      retryCount: retryCount ?? this.retryCount,
      nextRetryAt: nextRetryAt ?? this.nextRetryAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (entityType.present) {
      map['entity_type'] = Variable<String>(entityType.value);
    }
    if (entityId.present) {
      map['entity_id'] = Variable<String>(entityId.value);
    }
    if (orderUuid.present) {
      map['order_uuid'] = Variable<String>(orderUuid.value);
    }
    if (baseVersion.present) {
      map['base_version'] = Variable<int>(baseVersion.value);
    }
    if (version.present) {
      map['version'] = Variable<int>(version.value);
    }
    if (operation.present) {
      map['operation'] = Variable<String>(operation.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (isClosed.present) {
      map['is_closed'] = Variable<bool>(isClosed.value);
    }
    if (payloadHash.present) {
      map['payload_hash'] = Variable<String>(payloadHash.value);
    }
    if (payloadJson.present) {
      map['payload_json'] = Variable<String>(payloadJson.value);
    }
    if (batchId.present) {
      map['batch_id'] = Variable<String>(batchId.value);
    }
    if (retryCount.present) {
      map['retry_count'] = Variable<int>(retryCount.value);
    }
    if (nextRetryAt.present) {
      map['next_retry_at'] = Variable<DateTime>(nextRetryAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SyncOutboxCompanion(')
          ..write('key: $key, ')
          ..write('entityType: $entityType, ')
          ..write('entityId: $entityId, ')
          ..write('orderUuid: $orderUuid, ')
          ..write('baseVersion: $baseVersion, ')
          ..write('version: $version, ')
          ..write('operation: $operation, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('isClosed: $isClosed, ')
          ..write('payloadHash: $payloadHash, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('batchId: $batchId, ')
          ..write('retryCount: $retryCount, ')
          ..write('nextRetryAt: $nextRetryAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SyncStateTable extends SyncState
    with TableInfo<$SyncStateTable, SyncStateData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SyncStateTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _valueMeta = const VerificationMeta('value');
  @override
  late final GeneratedColumn<String> value = GeneratedColumn<String>(
    'value',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [key, value];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sync_state';
  @override
  VerificationContext validateIntegrity(
    Insertable<SyncStateData> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
        _keyMeta,
        key.isAcceptableOrUnknown(data['key']!, _keyMeta),
      );
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('value')) {
      context.handle(
        _valueMeta,
        value.isAcceptableOrUnknown(data['value']!, _valueMeta),
      );
    } else if (isInserting) {
      context.missing(_valueMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  SyncStateData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SyncStateData(
      key: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}key'],
      )!,
      value: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}value'],
      )!,
    );
  }

  @override
  $SyncStateTable createAlias(String alias) {
    return $SyncStateTable(attachedDatabase, alias);
  }
}

class SyncStateData extends DataClass implements Insertable<SyncStateData> {
  final String key;
  final String value;
  const SyncStateData({required this.key, required this.value});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['value'] = Variable<String>(value);
    return map;
  }

  SyncStateCompanion toCompanion(bool nullToAbsent) {
    return SyncStateCompanion(key: Value(key), value: Value(value));
  }

  factory SyncStateData.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SyncStateData(
      key: serializer.fromJson<String>(json['key']),
      value: serializer.fromJson<String>(json['value']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'value': serializer.toJson<String>(value),
    };
  }

  SyncStateData copyWith({String? key, String? value}) =>
      SyncStateData(key: key ?? this.key, value: value ?? this.value);
  SyncStateData copyWithCompanion(SyncStateCompanion data) {
    return SyncStateData(
      key: data.key.present ? data.key.value : this.key,
      value: data.value.present ? data.value.value : this.value,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SyncStateData(')
          ..write('key: $key, ')
          ..write('value: $value')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(key, value);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SyncStateData &&
          other.key == this.key &&
          other.value == this.value);
}

class SyncStateCompanion extends UpdateCompanion<SyncStateData> {
  final Value<String> key;
  final Value<String> value;
  final Value<int> rowid;
  const SyncStateCompanion({
    this.key = const Value.absent(),
    this.value = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SyncStateCompanion.insert({
    required String key,
    required String value,
    this.rowid = const Value.absent(),
  }) : key = Value(key),
       value = Value(value);
  static Insertable<SyncStateData> custom({
    Expression<String>? key,
    Expression<String>? value,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (value != null) 'value': value,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SyncStateCompanion copyWith({
    Value<String>? key,
    Value<String>? value,
    Value<int>? rowid,
  }) {
    return SyncStateCompanion(
      key: key ?? this.key,
      value: value ?? this.value,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (value.present) {
      map['value'] = Variable<String>(value.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SyncStateCompanion(')
          ..write('key: $key, ')
          ..write('value: $value, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SyncConflictsTable extends SyncConflicts
    with TableInfo<$SyncConflictsTable, SyncConflict> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SyncConflictsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _entityIdMeta = const VerificationMeta(
    'entityId',
  );
  @override
  late final GeneratedColumn<String> entityId = GeneratedColumn<String>(
    'entity_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _orderUuidMeta = const VerificationMeta(
    'orderUuid',
  );
  @override
  late final GeneratedColumn<String> orderUuid = GeneratedColumn<String>(
    'order_uuid',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _codeMeta = const VerificationMeta('code');
  @override
  late final GeneratedColumn<String> code = GeneratedColumn<String>(
    'code',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _detailsJsonMeta = const VerificationMeta(
    'detailsJson',
  );
  @override
  late final GeneratedColumn<String> detailsJson = GeneratedColumn<String>(
    'details_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    key,
    entityId,
    orderUuid,
    code,
    detailsJson,
    createdAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sync_conflicts';
  @override
  VerificationContext validateIntegrity(
    Insertable<SyncConflict> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
        _keyMeta,
        key.isAcceptableOrUnknown(data['key']!, _keyMeta),
      );
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('entity_id')) {
      context.handle(
        _entityIdMeta,
        entityId.isAcceptableOrUnknown(data['entity_id']!, _entityIdMeta),
      );
    } else if (isInserting) {
      context.missing(_entityIdMeta);
    }
    if (data.containsKey('order_uuid')) {
      context.handle(
        _orderUuidMeta,
        orderUuid.isAcceptableOrUnknown(data['order_uuid']!, _orderUuidMeta),
      );
    } else if (isInserting) {
      context.missing(_orderUuidMeta);
    }
    if (data.containsKey('code')) {
      context.handle(
        _codeMeta,
        code.isAcceptableOrUnknown(data['code']!, _codeMeta),
      );
    } else if (isInserting) {
      context.missing(_codeMeta);
    }
    if (data.containsKey('details_json')) {
      context.handle(
        _detailsJsonMeta,
        detailsJson.isAcceptableOrUnknown(
          data['details_json']!,
          _detailsJsonMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_detailsJsonMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  SyncConflict map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SyncConflict(
      key: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}key'],
      )!,
      entityId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}entity_id'],
      )!,
      orderUuid: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}order_uuid'],
      )!,
      code: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}code'],
      )!,
      detailsJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}details_json'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
    );
  }

  @override
  $SyncConflictsTable createAlias(String alias) {
    return $SyncConflictsTable(attachedDatabase, alias);
  }
}

class SyncConflict extends DataClass implements Insertable<SyncConflict> {
  final String key;
  final String entityId;
  final String orderUuid;
  final String code;
  final String detailsJson;
  final DateTime createdAt;
  const SyncConflict({
    required this.key,
    required this.entityId,
    required this.orderUuid,
    required this.code,
    required this.detailsJson,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['entity_id'] = Variable<String>(entityId);
    map['order_uuid'] = Variable<String>(orderUuid);
    map['code'] = Variable<String>(code);
    map['details_json'] = Variable<String>(detailsJson);
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  SyncConflictsCompanion toCompanion(bool nullToAbsent) {
    return SyncConflictsCompanion(
      key: Value(key),
      entityId: Value(entityId),
      orderUuid: Value(orderUuid),
      code: Value(code),
      detailsJson: Value(detailsJson),
      createdAt: Value(createdAt),
    );
  }

  factory SyncConflict.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SyncConflict(
      key: serializer.fromJson<String>(json['key']),
      entityId: serializer.fromJson<String>(json['entityId']),
      orderUuid: serializer.fromJson<String>(json['orderUuid']),
      code: serializer.fromJson<String>(json['code']),
      detailsJson: serializer.fromJson<String>(json['detailsJson']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'entityId': serializer.toJson<String>(entityId),
      'orderUuid': serializer.toJson<String>(orderUuid),
      'code': serializer.toJson<String>(code),
      'detailsJson': serializer.toJson<String>(detailsJson),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  SyncConflict copyWith({
    String? key,
    String? entityId,
    String? orderUuid,
    String? code,
    String? detailsJson,
    DateTime? createdAt,
  }) => SyncConflict(
    key: key ?? this.key,
    entityId: entityId ?? this.entityId,
    orderUuid: orderUuid ?? this.orderUuid,
    code: code ?? this.code,
    detailsJson: detailsJson ?? this.detailsJson,
    createdAt: createdAt ?? this.createdAt,
  );
  SyncConflict copyWithCompanion(SyncConflictsCompanion data) {
    return SyncConflict(
      key: data.key.present ? data.key.value : this.key,
      entityId: data.entityId.present ? data.entityId.value : this.entityId,
      orderUuid: data.orderUuid.present ? data.orderUuid.value : this.orderUuid,
      code: data.code.present ? data.code.value : this.code,
      detailsJson: data.detailsJson.present
          ? data.detailsJson.value
          : this.detailsJson,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SyncConflict(')
          ..write('key: $key, ')
          ..write('entityId: $entityId, ')
          ..write('orderUuid: $orderUuid, ')
          ..write('code: $code, ')
          ..write('detailsJson: $detailsJson, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(key, entityId, orderUuid, code, detailsJson, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SyncConflict &&
          other.key == this.key &&
          other.entityId == this.entityId &&
          other.orderUuid == this.orderUuid &&
          other.code == this.code &&
          other.detailsJson == this.detailsJson &&
          other.createdAt == this.createdAt);
}

class SyncConflictsCompanion extends UpdateCompanion<SyncConflict> {
  final Value<String> key;
  final Value<String> entityId;
  final Value<String> orderUuid;
  final Value<String> code;
  final Value<String> detailsJson;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const SyncConflictsCompanion({
    this.key = const Value.absent(),
    this.entityId = const Value.absent(),
    this.orderUuid = const Value.absent(),
    this.code = const Value.absent(),
    this.detailsJson = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SyncConflictsCompanion.insert({
    required String key,
    required String entityId,
    required String orderUuid,
    required String code,
    required String detailsJson,
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  }) : key = Value(key),
       entityId = Value(entityId),
       orderUuid = Value(orderUuid),
       code = Value(code),
       detailsJson = Value(detailsJson),
       createdAt = Value(createdAt);
  static Insertable<SyncConflict> custom({
    Expression<String>? key,
    Expression<String>? entityId,
    Expression<String>? orderUuid,
    Expression<String>? code,
    Expression<String>? detailsJson,
    Expression<DateTime>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (entityId != null) 'entity_id': entityId,
      if (orderUuid != null) 'order_uuid': orderUuid,
      if (code != null) 'code': code,
      if (detailsJson != null) 'details_json': detailsJson,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SyncConflictsCompanion copyWith({
    Value<String>? key,
    Value<String>? entityId,
    Value<String>? orderUuid,
    Value<String>? code,
    Value<String>? detailsJson,
    Value<DateTime>? createdAt,
    Value<int>? rowid,
  }) {
    return SyncConflictsCompanion(
      key: key ?? this.key,
      entityId: entityId ?? this.entityId,
      orderUuid: orderUuid ?? this.orderUuid,
      code: code ?? this.code,
      detailsJson: detailsJson ?? this.detailsJson,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (entityId.present) {
      map['entity_id'] = Variable<String>(entityId.value);
    }
    if (orderUuid.present) {
      map['order_uuid'] = Variable<String>(orderUuid.value);
    }
    if (code.present) {
      map['code'] = Variable<String>(code.value);
    }
    if (detailsJson.present) {
      map['details_json'] = Variable<String>(detailsJson.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SyncConflictsCompanion(')
          ..write('key: $key, ')
          ..write('entityId: $entityId, ')
          ..write('orderUuid: $orderUuid, ')
          ..write('code: $code, ')
          ..write('detailsJson: $detailsJson, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$MobileDatabase extends GeneratedDatabase {
  _$MobileDatabase(QueryExecutor e) : super(e);
  $MobileDatabaseManager get managers => $MobileDatabaseManager(this);
  late final $LocalSnapshotsTable localSnapshots = $LocalSnapshotsTable(this);
  late final $SyncRecordsTable syncRecords = $SyncRecordsTable(this);
  late final $SyncOutboxTable syncOutbox = $SyncOutboxTable(this);
  late final $SyncStateTable syncState = $SyncStateTable(this);
  late final $SyncConflictsTable syncConflicts = $SyncConflictsTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    localSnapshots,
    syncRecords,
    syncOutbox,
    syncState,
    syncConflicts,
  ];
}

typedef $$LocalSnapshotsTableCreateCompanionBuilder =
    LocalSnapshotsCompanion Function({
      required String key,
      required String payloadJson,
      required DateTime updatedAt,
      Value<int> rowid,
    });
typedef $$LocalSnapshotsTableUpdateCompanionBuilder =
    LocalSnapshotsCompanion Function({
      Value<String> key,
      Value<String> payloadJson,
      Value<DateTime> updatedAt,
      Value<int> rowid,
    });

class $$LocalSnapshotsTableFilterComposer
    extends Composer<_$MobileDatabase, $LocalSnapshotsTable> {
  $$LocalSnapshotsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$LocalSnapshotsTableOrderingComposer
    extends Composer<_$MobileDatabase, $LocalSnapshotsTable> {
  $$LocalSnapshotsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$LocalSnapshotsTableAnnotationComposer
    extends Composer<_$MobileDatabase, $LocalSnapshotsTable> {
  $$LocalSnapshotsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$LocalSnapshotsTableTableManager
    extends
        RootTableManager<
          _$MobileDatabase,
          $LocalSnapshotsTable,
          LocalSnapshot,
          $$LocalSnapshotsTableFilterComposer,
          $$LocalSnapshotsTableOrderingComposer,
          $$LocalSnapshotsTableAnnotationComposer,
          $$LocalSnapshotsTableCreateCompanionBuilder,
          $$LocalSnapshotsTableUpdateCompanionBuilder,
          (
            LocalSnapshot,
            BaseReferences<
              _$MobileDatabase,
              $LocalSnapshotsTable,
              LocalSnapshot
            >,
          ),
          LocalSnapshot,
          PrefetchHooks Function()
        > {
  $$LocalSnapshotsTableTableManager(
    _$MobileDatabase db,
    $LocalSnapshotsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$LocalSnapshotsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$LocalSnapshotsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$LocalSnapshotsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> key = const Value.absent(),
                Value<String> payloadJson = const Value.absent(),
                Value<DateTime> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => LocalSnapshotsCompanion(
                key: key,
                payloadJson: payloadJson,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String key,
                required String payloadJson,
                required DateTime updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => LocalSnapshotsCompanion.insert(
                key: key,
                payloadJson: payloadJson,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$LocalSnapshotsTableProcessedTableManager =
    ProcessedTableManager<
      _$MobileDatabase,
      $LocalSnapshotsTable,
      LocalSnapshot,
      $$LocalSnapshotsTableFilterComposer,
      $$LocalSnapshotsTableOrderingComposer,
      $$LocalSnapshotsTableAnnotationComposer,
      $$LocalSnapshotsTableCreateCompanionBuilder,
      $$LocalSnapshotsTableUpdateCompanionBuilder,
      (
        LocalSnapshot,
        BaseReferences<_$MobileDatabase, $LocalSnapshotsTable, LocalSnapshot>,
      ),
      LocalSnapshot,
      PrefetchHooks Function()
    >;
typedef $$SyncRecordsTableCreateCompanionBuilder =
    SyncRecordsCompanion Function({
      required String key,
      required String entityType,
      required String entityId,
      Value<String?> orderUuid,
      required int version,
      required int baseVersion,
      Value<int> syncedVersion,
      required String sourceHash,
      required String payloadHash,
      required DateTime updatedAt,
      Value<DateTime?> syncedAt,
      Value<String?> conflictState,
      Value<int> rowid,
    });
typedef $$SyncRecordsTableUpdateCompanionBuilder =
    SyncRecordsCompanion Function({
      Value<String> key,
      Value<String> entityType,
      Value<String> entityId,
      Value<String?> orderUuid,
      Value<int> version,
      Value<int> baseVersion,
      Value<int> syncedVersion,
      Value<String> sourceHash,
      Value<String> payloadHash,
      Value<DateTime> updatedAt,
      Value<DateTime?> syncedAt,
      Value<String?> conflictState,
      Value<int> rowid,
    });

class $$SyncRecordsTableFilterComposer
    extends Composer<_$MobileDatabase, $SyncRecordsTable> {
  $$SyncRecordsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get entityType => $composableBuilder(
    column: $table.entityType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get entityId => $composableBuilder(
    column: $table.entityId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get orderUuid => $composableBuilder(
    column: $table.orderUuid,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get version => $composableBuilder(
    column: $table.version,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get baseVersion => $composableBuilder(
    column: $table.baseVersion,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get syncedVersion => $composableBuilder(
    column: $table.syncedVersion,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sourceHash => $composableBuilder(
    column: $table.sourceHash,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payloadHash => $composableBuilder(
    column: $table.payloadHash,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get syncedAt => $composableBuilder(
    column: $table.syncedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get conflictState => $composableBuilder(
    column: $table.conflictState,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SyncRecordsTableOrderingComposer
    extends Composer<_$MobileDatabase, $SyncRecordsTable> {
  $$SyncRecordsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get entityType => $composableBuilder(
    column: $table.entityType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get entityId => $composableBuilder(
    column: $table.entityId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get orderUuid => $composableBuilder(
    column: $table.orderUuid,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get version => $composableBuilder(
    column: $table.version,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get baseVersion => $composableBuilder(
    column: $table.baseVersion,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get syncedVersion => $composableBuilder(
    column: $table.syncedVersion,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sourceHash => $composableBuilder(
    column: $table.sourceHash,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payloadHash => $composableBuilder(
    column: $table.payloadHash,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get syncedAt => $composableBuilder(
    column: $table.syncedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get conflictState => $composableBuilder(
    column: $table.conflictState,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SyncRecordsTableAnnotationComposer
    extends Composer<_$MobileDatabase, $SyncRecordsTable> {
  $$SyncRecordsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get entityType => $composableBuilder(
    column: $table.entityType,
    builder: (column) => column,
  );

  GeneratedColumn<String> get entityId =>
      $composableBuilder(column: $table.entityId, builder: (column) => column);

  GeneratedColumn<String> get orderUuid =>
      $composableBuilder(column: $table.orderUuid, builder: (column) => column);

  GeneratedColumn<int> get version =>
      $composableBuilder(column: $table.version, builder: (column) => column);

  GeneratedColumn<int> get baseVersion => $composableBuilder(
    column: $table.baseVersion,
    builder: (column) => column,
  );

  GeneratedColumn<int> get syncedVersion => $composableBuilder(
    column: $table.syncedVersion,
    builder: (column) => column,
  );

  GeneratedColumn<String> get sourceHash => $composableBuilder(
    column: $table.sourceHash,
    builder: (column) => column,
  );

  GeneratedColumn<String> get payloadHash => $composableBuilder(
    column: $table.payloadHash,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get syncedAt =>
      $composableBuilder(column: $table.syncedAt, builder: (column) => column);

  GeneratedColumn<String> get conflictState => $composableBuilder(
    column: $table.conflictState,
    builder: (column) => column,
  );
}

class $$SyncRecordsTableTableManager
    extends
        RootTableManager<
          _$MobileDatabase,
          $SyncRecordsTable,
          SyncRecord,
          $$SyncRecordsTableFilterComposer,
          $$SyncRecordsTableOrderingComposer,
          $$SyncRecordsTableAnnotationComposer,
          $$SyncRecordsTableCreateCompanionBuilder,
          $$SyncRecordsTableUpdateCompanionBuilder,
          (
            SyncRecord,
            BaseReferences<_$MobileDatabase, $SyncRecordsTable, SyncRecord>,
          ),
          SyncRecord,
          PrefetchHooks Function()
        > {
  $$SyncRecordsTableTableManager(_$MobileDatabase db, $SyncRecordsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SyncRecordsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SyncRecordsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SyncRecordsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> key = const Value.absent(),
                Value<String> entityType = const Value.absent(),
                Value<String> entityId = const Value.absent(),
                Value<String?> orderUuid = const Value.absent(),
                Value<int> version = const Value.absent(),
                Value<int> baseVersion = const Value.absent(),
                Value<int> syncedVersion = const Value.absent(),
                Value<String> sourceHash = const Value.absent(),
                Value<String> payloadHash = const Value.absent(),
                Value<DateTime> updatedAt = const Value.absent(),
                Value<DateTime?> syncedAt = const Value.absent(),
                Value<String?> conflictState = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SyncRecordsCompanion(
                key: key,
                entityType: entityType,
                entityId: entityId,
                orderUuid: orderUuid,
                version: version,
                baseVersion: baseVersion,
                syncedVersion: syncedVersion,
                sourceHash: sourceHash,
                payloadHash: payloadHash,
                updatedAt: updatedAt,
                syncedAt: syncedAt,
                conflictState: conflictState,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String key,
                required String entityType,
                required String entityId,
                Value<String?> orderUuid = const Value.absent(),
                required int version,
                required int baseVersion,
                Value<int> syncedVersion = const Value.absent(),
                required String sourceHash,
                required String payloadHash,
                required DateTime updatedAt,
                Value<DateTime?> syncedAt = const Value.absent(),
                Value<String?> conflictState = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SyncRecordsCompanion.insert(
                key: key,
                entityType: entityType,
                entityId: entityId,
                orderUuid: orderUuid,
                version: version,
                baseVersion: baseVersion,
                syncedVersion: syncedVersion,
                sourceHash: sourceHash,
                payloadHash: payloadHash,
                updatedAt: updatedAt,
                syncedAt: syncedAt,
                conflictState: conflictState,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SyncRecordsTableProcessedTableManager =
    ProcessedTableManager<
      _$MobileDatabase,
      $SyncRecordsTable,
      SyncRecord,
      $$SyncRecordsTableFilterComposer,
      $$SyncRecordsTableOrderingComposer,
      $$SyncRecordsTableAnnotationComposer,
      $$SyncRecordsTableCreateCompanionBuilder,
      $$SyncRecordsTableUpdateCompanionBuilder,
      (
        SyncRecord,
        BaseReferences<_$MobileDatabase, $SyncRecordsTable, SyncRecord>,
      ),
      SyncRecord,
      PrefetchHooks Function()
    >;
typedef $$SyncOutboxTableCreateCompanionBuilder =
    SyncOutboxCompanion Function({
      required String key,
      required String entityType,
      required String entityId,
      required String orderUuid,
      required int baseVersion,
      required int version,
      required String operation,
      required DateTime updatedAt,
      required bool isClosed,
      required String payloadHash,
      required String payloadJson,
      required String batchId,
      Value<int> retryCount,
      Value<DateTime?> nextRetryAt,
      Value<int> rowid,
    });
typedef $$SyncOutboxTableUpdateCompanionBuilder =
    SyncOutboxCompanion Function({
      Value<String> key,
      Value<String> entityType,
      Value<String> entityId,
      Value<String> orderUuid,
      Value<int> baseVersion,
      Value<int> version,
      Value<String> operation,
      Value<DateTime> updatedAt,
      Value<bool> isClosed,
      Value<String> payloadHash,
      Value<String> payloadJson,
      Value<String> batchId,
      Value<int> retryCount,
      Value<DateTime?> nextRetryAt,
      Value<int> rowid,
    });

class $$SyncOutboxTableFilterComposer
    extends Composer<_$MobileDatabase, $SyncOutboxTable> {
  $$SyncOutboxTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get entityType => $composableBuilder(
    column: $table.entityType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get entityId => $composableBuilder(
    column: $table.entityId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get orderUuid => $composableBuilder(
    column: $table.orderUuid,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get baseVersion => $composableBuilder(
    column: $table.baseVersion,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get version => $composableBuilder(
    column: $table.version,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get operation => $composableBuilder(
    column: $table.operation,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isClosed => $composableBuilder(
    column: $table.isClosed,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payloadHash => $composableBuilder(
    column: $table.payloadHash,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get batchId => $composableBuilder(
    column: $table.batchId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get retryCount => $composableBuilder(
    column: $table.retryCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get nextRetryAt => $composableBuilder(
    column: $table.nextRetryAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SyncOutboxTableOrderingComposer
    extends Composer<_$MobileDatabase, $SyncOutboxTable> {
  $$SyncOutboxTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get entityType => $composableBuilder(
    column: $table.entityType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get entityId => $composableBuilder(
    column: $table.entityId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get orderUuid => $composableBuilder(
    column: $table.orderUuid,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get baseVersion => $composableBuilder(
    column: $table.baseVersion,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get version => $composableBuilder(
    column: $table.version,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get operation => $composableBuilder(
    column: $table.operation,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isClosed => $composableBuilder(
    column: $table.isClosed,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payloadHash => $composableBuilder(
    column: $table.payloadHash,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get batchId => $composableBuilder(
    column: $table.batchId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get retryCount => $composableBuilder(
    column: $table.retryCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get nextRetryAt => $composableBuilder(
    column: $table.nextRetryAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SyncOutboxTableAnnotationComposer
    extends Composer<_$MobileDatabase, $SyncOutboxTable> {
  $$SyncOutboxTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get entityType => $composableBuilder(
    column: $table.entityType,
    builder: (column) => column,
  );

  GeneratedColumn<String> get entityId =>
      $composableBuilder(column: $table.entityId, builder: (column) => column);

  GeneratedColumn<String> get orderUuid =>
      $composableBuilder(column: $table.orderUuid, builder: (column) => column);

  GeneratedColumn<int> get baseVersion => $composableBuilder(
    column: $table.baseVersion,
    builder: (column) => column,
  );

  GeneratedColumn<int> get version =>
      $composableBuilder(column: $table.version, builder: (column) => column);

  GeneratedColumn<String> get operation =>
      $composableBuilder(column: $table.operation, builder: (column) => column);

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumn<bool> get isClosed =>
      $composableBuilder(column: $table.isClosed, builder: (column) => column);

  GeneratedColumn<String> get payloadHash => $composableBuilder(
    column: $table.payloadHash,
    builder: (column) => column,
  );

  GeneratedColumn<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => column,
  );

  GeneratedColumn<String> get batchId =>
      $composableBuilder(column: $table.batchId, builder: (column) => column);

  GeneratedColumn<int> get retryCount => $composableBuilder(
    column: $table.retryCount,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get nextRetryAt => $composableBuilder(
    column: $table.nextRetryAt,
    builder: (column) => column,
  );
}

class $$SyncOutboxTableTableManager
    extends
        RootTableManager<
          _$MobileDatabase,
          $SyncOutboxTable,
          SyncOutboxData,
          $$SyncOutboxTableFilterComposer,
          $$SyncOutboxTableOrderingComposer,
          $$SyncOutboxTableAnnotationComposer,
          $$SyncOutboxTableCreateCompanionBuilder,
          $$SyncOutboxTableUpdateCompanionBuilder,
          (
            SyncOutboxData,
            BaseReferences<_$MobileDatabase, $SyncOutboxTable, SyncOutboxData>,
          ),
          SyncOutboxData,
          PrefetchHooks Function()
        > {
  $$SyncOutboxTableTableManager(_$MobileDatabase db, $SyncOutboxTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SyncOutboxTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SyncOutboxTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SyncOutboxTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> key = const Value.absent(),
                Value<String> entityType = const Value.absent(),
                Value<String> entityId = const Value.absent(),
                Value<String> orderUuid = const Value.absent(),
                Value<int> baseVersion = const Value.absent(),
                Value<int> version = const Value.absent(),
                Value<String> operation = const Value.absent(),
                Value<DateTime> updatedAt = const Value.absent(),
                Value<bool> isClosed = const Value.absent(),
                Value<String> payloadHash = const Value.absent(),
                Value<String> payloadJson = const Value.absent(),
                Value<String> batchId = const Value.absent(),
                Value<int> retryCount = const Value.absent(),
                Value<DateTime?> nextRetryAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SyncOutboxCompanion(
                key: key,
                entityType: entityType,
                entityId: entityId,
                orderUuid: orderUuid,
                baseVersion: baseVersion,
                version: version,
                operation: operation,
                updatedAt: updatedAt,
                isClosed: isClosed,
                payloadHash: payloadHash,
                payloadJson: payloadJson,
                batchId: batchId,
                retryCount: retryCount,
                nextRetryAt: nextRetryAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String key,
                required String entityType,
                required String entityId,
                required String orderUuid,
                required int baseVersion,
                required int version,
                required String operation,
                required DateTime updatedAt,
                required bool isClosed,
                required String payloadHash,
                required String payloadJson,
                required String batchId,
                Value<int> retryCount = const Value.absent(),
                Value<DateTime?> nextRetryAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SyncOutboxCompanion.insert(
                key: key,
                entityType: entityType,
                entityId: entityId,
                orderUuid: orderUuid,
                baseVersion: baseVersion,
                version: version,
                operation: operation,
                updatedAt: updatedAt,
                isClosed: isClosed,
                payloadHash: payloadHash,
                payloadJson: payloadJson,
                batchId: batchId,
                retryCount: retryCount,
                nextRetryAt: nextRetryAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SyncOutboxTableProcessedTableManager =
    ProcessedTableManager<
      _$MobileDatabase,
      $SyncOutboxTable,
      SyncOutboxData,
      $$SyncOutboxTableFilterComposer,
      $$SyncOutboxTableOrderingComposer,
      $$SyncOutboxTableAnnotationComposer,
      $$SyncOutboxTableCreateCompanionBuilder,
      $$SyncOutboxTableUpdateCompanionBuilder,
      (
        SyncOutboxData,
        BaseReferences<_$MobileDatabase, $SyncOutboxTable, SyncOutboxData>,
      ),
      SyncOutboxData,
      PrefetchHooks Function()
    >;
typedef $$SyncStateTableCreateCompanionBuilder =
    SyncStateCompanion Function({
      required String key,
      required String value,
      Value<int> rowid,
    });
typedef $$SyncStateTableUpdateCompanionBuilder =
    SyncStateCompanion Function({
      Value<String> key,
      Value<String> value,
      Value<int> rowid,
    });

class $$SyncStateTableFilterComposer
    extends Composer<_$MobileDatabase, $SyncStateTable> {
  $$SyncStateTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SyncStateTableOrderingComposer
    extends Composer<_$MobileDatabase, $SyncStateTable> {
  $$SyncStateTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SyncStateTableAnnotationComposer
    extends Composer<_$MobileDatabase, $SyncStateTable> {
  $$SyncStateTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get value =>
      $composableBuilder(column: $table.value, builder: (column) => column);
}

class $$SyncStateTableTableManager
    extends
        RootTableManager<
          _$MobileDatabase,
          $SyncStateTable,
          SyncStateData,
          $$SyncStateTableFilterComposer,
          $$SyncStateTableOrderingComposer,
          $$SyncStateTableAnnotationComposer,
          $$SyncStateTableCreateCompanionBuilder,
          $$SyncStateTableUpdateCompanionBuilder,
          (
            SyncStateData,
            BaseReferences<_$MobileDatabase, $SyncStateTable, SyncStateData>,
          ),
          SyncStateData,
          PrefetchHooks Function()
        > {
  $$SyncStateTableTableManager(_$MobileDatabase db, $SyncStateTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SyncStateTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SyncStateTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SyncStateTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> key = const Value.absent(),
                Value<String> value = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SyncStateCompanion(key: key, value: value, rowid: rowid),
          createCompanionCallback:
              ({
                required String key,
                required String value,
                Value<int> rowid = const Value.absent(),
              }) => SyncStateCompanion.insert(
                key: key,
                value: value,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SyncStateTableProcessedTableManager =
    ProcessedTableManager<
      _$MobileDatabase,
      $SyncStateTable,
      SyncStateData,
      $$SyncStateTableFilterComposer,
      $$SyncStateTableOrderingComposer,
      $$SyncStateTableAnnotationComposer,
      $$SyncStateTableCreateCompanionBuilder,
      $$SyncStateTableUpdateCompanionBuilder,
      (
        SyncStateData,
        BaseReferences<_$MobileDatabase, $SyncStateTable, SyncStateData>,
      ),
      SyncStateData,
      PrefetchHooks Function()
    >;
typedef $$SyncConflictsTableCreateCompanionBuilder =
    SyncConflictsCompanion Function({
      required String key,
      required String entityId,
      required String orderUuid,
      required String code,
      required String detailsJson,
      required DateTime createdAt,
      Value<int> rowid,
    });
typedef $$SyncConflictsTableUpdateCompanionBuilder =
    SyncConflictsCompanion Function({
      Value<String> key,
      Value<String> entityId,
      Value<String> orderUuid,
      Value<String> code,
      Value<String> detailsJson,
      Value<DateTime> createdAt,
      Value<int> rowid,
    });

class $$SyncConflictsTableFilterComposer
    extends Composer<_$MobileDatabase, $SyncConflictsTable> {
  $$SyncConflictsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get entityId => $composableBuilder(
    column: $table.entityId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get orderUuid => $composableBuilder(
    column: $table.orderUuid,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get code => $composableBuilder(
    column: $table.code,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get detailsJson => $composableBuilder(
    column: $table.detailsJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SyncConflictsTableOrderingComposer
    extends Composer<_$MobileDatabase, $SyncConflictsTable> {
  $$SyncConflictsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get entityId => $composableBuilder(
    column: $table.entityId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get orderUuid => $composableBuilder(
    column: $table.orderUuid,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get code => $composableBuilder(
    column: $table.code,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get detailsJson => $composableBuilder(
    column: $table.detailsJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SyncConflictsTableAnnotationComposer
    extends Composer<_$MobileDatabase, $SyncConflictsTable> {
  $$SyncConflictsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get entityId =>
      $composableBuilder(column: $table.entityId, builder: (column) => column);

  GeneratedColumn<String> get orderUuid =>
      $composableBuilder(column: $table.orderUuid, builder: (column) => column);

  GeneratedColumn<String> get code =>
      $composableBuilder(column: $table.code, builder: (column) => column);

  GeneratedColumn<String> get detailsJson => $composableBuilder(
    column: $table.detailsJson,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$SyncConflictsTableTableManager
    extends
        RootTableManager<
          _$MobileDatabase,
          $SyncConflictsTable,
          SyncConflict,
          $$SyncConflictsTableFilterComposer,
          $$SyncConflictsTableOrderingComposer,
          $$SyncConflictsTableAnnotationComposer,
          $$SyncConflictsTableCreateCompanionBuilder,
          $$SyncConflictsTableUpdateCompanionBuilder,
          (
            SyncConflict,
            BaseReferences<_$MobileDatabase, $SyncConflictsTable, SyncConflict>,
          ),
          SyncConflict,
          PrefetchHooks Function()
        > {
  $$SyncConflictsTableTableManager(
    _$MobileDatabase db,
    $SyncConflictsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SyncConflictsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SyncConflictsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SyncConflictsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> key = const Value.absent(),
                Value<String> entityId = const Value.absent(),
                Value<String> orderUuid = const Value.absent(),
                Value<String> code = const Value.absent(),
                Value<String> detailsJson = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SyncConflictsCompanion(
                key: key,
                entityId: entityId,
                orderUuid: orderUuid,
                code: code,
                detailsJson: detailsJson,
                createdAt: createdAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String key,
                required String entityId,
                required String orderUuid,
                required String code,
                required String detailsJson,
                required DateTime createdAt,
                Value<int> rowid = const Value.absent(),
              }) => SyncConflictsCompanion.insert(
                key: key,
                entityId: entityId,
                orderUuid: orderUuid,
                code: code,
                detailsJson: detailsJson,
                createdAt: createdAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SyncConflictsTableProcessedTableManager =
    ProcessedTableManager<
      _$MobileDatabase,
      $SyncConflictsTable,
      SyncConflict,
      $$SyncConflictsTableFilterComposer,
      $$SyncConflictsTableOrderingComposer,
      $$SyncConflictsTableAnnotationComposer,
      $$SyncConflictsTableCreateCompanionBuilder,
      $$SyncConflictsTableUpdateCompanionBuilder,
      (
        SyncConflict,
        BaseReferences<_$MobileDatabase, $SyncConflictsTable, SyncConflict>,
      ),
      SyncConflict,
      PrefetchHooks Function()
    >;

class $MobileDatabaseManager {
  final _$MobileDatabase _db;
  $MobileDatabaseManager(this._db);
  $$LocalSnapshotsTableTableManager get localSnapshots =>
      $$LocalSnapshotsTableTableManager(_db, _db.localSnapshots);
  $$SyncRecordsTableTableManager get syncRecords =>
      $$SyncRecordsTableTableManager(_db, _db.syncRecords);
  $$SyncOutboxTableTableManager get syncOutbox =>
      $$SyncOutboxTableTableManager(_db, _db.syncOutbox);
  $$SyncStateTableTableManager get syncState =>
      $$SyncStateTableTableManager(_db, _db.syncState);
  $$SyncConflictsTableTableManager get syncConflicts =>
      $$SyncConflictsTableTableManager(_db, _db.syncConflicts);
}
