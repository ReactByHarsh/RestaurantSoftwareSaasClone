import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'models/session.dart';
import 'screens/login_screen.dart';
import 'screens/mobile_home.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'theme/bhojpatra_theme.dart';

void main() {
  runApp(const BhojPatraMobileApp());
}

class BhojPatraMobileApp extends StatelessWidget {
  const BhojPatraMobileApp({
    super.key,
    this.captainOnly = false,
    this.discoverOnStart = true,
  });
  final bool captainOnly;
  final bool discoverOnStart;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'BhojPatra',
      debugShowCheckedModeBanner: false,
      theme: Brand.theme,
      home: SessionGate(
        captainOnly: captainOnly,
        discoverOnStart: discoverOnStart,
      ),
    );
  }
}

class SessionGate extends StatefulWidget {
  const SessionGate({
    super.key,
    this.captainOnly = false,
    this.discoverOnStart = true,
  });
  final bool captainOnly;
  final bool discoverOnStart;

  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  SavedSession? _session;
  bool _loading = true;
  final _secure = const FlutterSecureStorage();
  String get _sessionKey => widget.captainOnly
      ? 'bhojpatra_captain_session'
      : 'bhojpatra_mobile_session';

  @override
  void initState() {
    super.initState();
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    final prefs = await SharedPreferences.getInstance();
    String? raw;
    try {
      raw = await _secure.read(key: _sessionKey);
    } catch (_) {}
    raw ??= prefs.getString(_sessionKey);
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
    await _secure.write(key: _sessionKey, value: jsonEncode(session.toJson()));
    await (await SharedPreferences.getInstance()).remove(_sessionKey);
    if (mounted) setState(() => _session = session);
  }

  Future<void> _logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_sessionKey);
    await _secure.delete(key: _sessionKey);
    if (mounted) setState(() => _session = null);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_session == null) {
      return LoginScreen(
        onLoggedIn: _setSession,
        captainOnly: widget.captainOnly,
        discoverOnStart: widget.discoverOnStart,
      );
    }
    return MobileHome(
      session: _session!,
      onLogout: _logout,
      captainOnly: widget.captainOnly,
    );
  }
}
