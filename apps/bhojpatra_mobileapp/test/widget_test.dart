import 'package:bhojpatra_mobile/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('shows BhojPatra login screen', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(const BhojPatraMobileApp());
    await tester.pumpAndSettle();

    expect(find.text('Bhojpatra'), findsOneWidget);
    expect(find.text('LAN Restaurant'), findsOneWidget);
    expect(find.text('Cloud Live'), findsOneWidget);
  });
}
