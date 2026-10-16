import 'dart:io';
import 'package:bhojpatra_mobile/screens/login_screen.dart';
import 'package:bhojpatra_mobile/theme/bhojpatra_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  setUpAll(() async {
    for (final entry in {
      'Roboto': 'Roboto-Regular.ttf',
      'MaterialIcons': 'MaterialIcons-Regular.otf',
    }.entries) {
      final data = await File('test/fixtures/${entry.value}').readAsBytes();
      await (FontLoader(
        entry.key,
      )..addFont(Future.value(ByteData.sublistView(data)))).load();
    }
  });
  for (final width in [320, 390]) {
    testWidgets(
      'branded login and owner switch fit $width including keyboard',
      (tester) async {
        tester.view.physicalSize = Size(width.toDouble(), 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.view.resetViewInsets);
        await tester.pumpWidget(
          MaterialApp(
            theme: Brand.theme,
            home: RepaintBoundary(
              key: const Key('login'),
              child: LoginScreen(
                discoverOnStart: false,
                onLoggedIn: (_) async {},
              ),
            ),
          ),
        );
        await tester.runAsync(
          () => precacheImage(
            const AssetImage('assets/logo.png'),
            tester.element(find.byType(LoginScreen)),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await expectLater(
          find.byKey(const Key('login')),
          matchesGoldenFile('goldens/login-$width.png'),
        );
        await tester.tap(find.text('Owner remote'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        tester.view.viewInsets = const FakeViewPadding(bottom: 280);
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('Sign in'));
        await tester.tap(find.text('Sign in'));
        await tester.pumpAndSettle();
        expect(
          find.text('Enter your staff or owner login and password / PIN.'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      },
    );
  }
}
