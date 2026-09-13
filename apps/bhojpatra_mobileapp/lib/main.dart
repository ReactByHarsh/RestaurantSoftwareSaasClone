import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'models/session.dart';
import 'screens/login_screen.dart';
import 'screens/mobile_home.dart';

void main() {
  runApp(const BhojPatraMobileApp());
}

class BhojPatraMobileApp extends StatelessWidget {
  const BhojPatraMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'BhojPatra Mobile',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xfff36b21),
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: const Color(0xfffff8f3),
        useMaterial3: true,
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xfffff8f3),
          foregroundColor: Color(0xff3b1d0b),
          surfaceTintColor: Colors.transparent,
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xfff36b21),
            foregroundColor: Colors.white,
          ),
        ),
        cardTheme: CardThemeData(
          elevation: 0,
          color: const Color(0xfffffdfb),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(22),
          ),
        ),
      ),
      home: const SessionGate(),
    );
  }
}

class SessionGate extends StatefulWidget {
  const SessionGate({super.key});

  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  SavedSession? _session;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('bhojpatra_mobile_session');
    if (!mounted) return;
    if (raw != null) {
      try {
        final payload = jsonDecode(raw) as Map<String, dynamic>;
        _session = SavedSession.fromJson(payload);
      } catch (_) {}
    }
    setState(() => _loading = false);
  }

  Future<void> _setSession(SavedSession session) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'bhojpatra_mobile_session',
      jsonEncode(session.toJson()),
    );
    if (mounted) setState(() => _session = session);
  }

  Future<void> _logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('bhojpatra_mobile_session');
    if (mounted) setState(() => _session = null);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_session == null) {
      return LoginScreen(onLoggedIn: _setSession);
    }
    return MobileHome(session: _session!, onLogout: _logout);
  }
}
