import 'package:bhojpatra_mobile/storage/mobile_database.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('persists restaurant snapshot and stable sync state in Drift', () async {
    final database = MobileDatabase.forTesting(NativeDatabase.memory());
    addTearDown(database.close);

    await database.saveSnapshot({
      'outlet': {'id': 'out_test'},
      'orders': [
        {'id': 'ord_550e8400-e29b-41d4-a716-446655440000', 'version': 1},
      ],
    });
    await database.setStateValue(
      'deviceId',
      'flutter_550e8400-e29b-41d4-a716-446655440001',
    );

    final restored = await database.loadSnapshot();
    expect(restored?['orders'], hasLength(1));
    expect(await database.stateValue('deviceId'), contains('550e8400'));
  });
}
