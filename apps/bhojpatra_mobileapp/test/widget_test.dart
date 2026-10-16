import 'package:bhojpatra_mobile/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

void main() {
  testWidgets('shows BhojPatra login screen', (tester) async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    await tester.pumpWidget(const BhojPatraMobileApp(discoverOnStart: false));
    await tester.pumpAndSettle();

    expect(find.text('BhojPatra'), findsOneWidget);
    expect(find.text('Restaurant'), findsOneWidget);
    expect(find.text('Owner remote'), findsOneWidget);
  });
}
