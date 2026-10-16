import 'package:flutter/material.dart';

abstract final class Brand {
  static const orange = Color(0xfff45b00);
  static const navy = Color(0xff0f172a);
  static const background = Color(0xfff5f7fb);
  static const border = Color(0xffe2e8f0);
  static const muted = Color(0xff64748b);
  static const green = Color(0xff059669);

  static ThemeData get theme => ThemeData(
    useMaterial3: true,
    fontFamily: 'Roboto',
    colorScheme: const ColorScheme.light(
      primary: orange,
      onPrimary: Colors.white,
      secondary: navy,
      onSecondary: Colors.white,
      surface: Colors.white,
      onSurface: navy,
      error: Color(0xffe11d48),
      outline: border,
      primaryContainer: Color(0xffffedd5),
      onPrimaryContainer: orange,
      secondaryContainer: Color(0xffe2e8f0),
      onSecondaryContainer: navy,
    ),
    scaffoldBackgroundColor: background,
    visualDensity: VisualDensity.compact,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: navy,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      toolbarHeight: 58,
    ),
    textTheme: const TextTheme(
      bodyMedium: TextStyle(fontSize: 13, color: navy),
      bodySmall: TextStyle(fontSize: 11, color: muted),
      titleMedium: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w700,
        color: navy,
      ),
      titleLarge: TextStyle(
        fontSize: 20,
        fontWeight: FontWeight.w800,
        color: navy,
      ),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
      hintStyle: const TextStyle(color: Color(0xff94a3b8), fontSize: 13),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: orange),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: orange,
        foregroundColor: Colors.white,
        minimumSize: const Size(44, 44),
        textStyle: const TextStyle(
          fontFamily: 'Roboto',
          fontSize: 13,
          fontWeight: FontWeight.w700,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: navy,
        side: const BorderSide(color: border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: Colors.white,
      selectedColor: const Color(0xffffedd5),
      side: const BorderSide(color: border),
      padding: const EdgeInsets.symmetric(horizontal: 6),
      labelStyle: const TextStyle(
        fontFamily: 'Roboto',
        color: navy,
        fontSize: 12,
        fontWeight: FontWeight.w600,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 64,
      elevation: 0,
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      indicatorColor: const Color(0xffffedd5),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontFamily: 'Roboto',
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: states.contains(WidgetState.selected) ? orange : muted,
        ),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: navy,
      elevation: 3,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    dividerTheme: const DividerThemeData(color: border, thickness: 1, space: 1),
  );
}

class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.size = 36});
  final double size;
  @override
  Widget build(BuildContext context) => Image.asset(
    'assets/logo.png',
    width: size,
    height: size,
    fit: BoxFit.contain,
  );
}
