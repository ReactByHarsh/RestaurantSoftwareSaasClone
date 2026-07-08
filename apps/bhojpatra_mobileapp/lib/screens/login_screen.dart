import 'package:flutter/material.dart';
import '../models/session.dart';
import '../api/cloud_api.dart';
import '../api/lan_discovery.dart';
import '../utils/utils.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.onLoggedIn});

  final ValueChanged<SavedSession> onLoggedIn;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _server = TextEditingController(text: defaultLanServerUrl);
  final _login = TextEditingController();
  final _password = TextEditingController();
  String _mode = 'lan';
  var _busy = false;
  var _discovering = false;
  String? _error;
  List<LanDesktopCandidate> _discovered = const [];

  @override
  void dispose() {
    _server.dispose();
    _login.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _discover() async {
    setState(() {
      _discovering = true;
      _error = null;
    });
    try {
      final found = await LanDiscovery.discover(preferredUrl: _server.text);
      if (!mounted) return;
      setState(() {
        _discovered = found;
        if (found.isNotEmpty) {
          _server.text = found.first.url;
        }
        _error = found.isEmpty
            ? 'No BhojPatra Desk found yet. Keep desktop open and both devices on the same Wi-Fi/hotspot.'
            : null;
      });
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _discovering = false);
    }
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final session = _mode == 'lan'
          ? await CloudApi.loginAutoLan(
              _server.text,
              _login.text,
              _password.text,
            )
          : await CloudApi.login(
              _server.text,
              _login.text,
              _password.text,
              mode: _mode,
            );
      widget.onLoggedIn(session);
    } catch (error) {
      setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Branding Section
                  Icon(
                    Icons.restaurant,
                    size: 80,
                    color: theme.colorScheme.primary,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Bhojpatra',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.headlineLarge?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: theme.colorScheme.primary,
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Restaurant Management System',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: Colors.black54,
                    ),
                  ),
                  const SizedBox(height: 32),

                  // Login Form Card
                  Card(
                    elevation: 4,
                    shadowColor: Colors.black12,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'Welcome Back',
                            style: theme.textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 24),
                          SegmentedButton<String>(
                            segments: const [
                              ButtonSegment(
                                value: 'lan',
                                icon: Icon(Icons.wifi),
                                label: Text('LAN Restaurant'),
                              ),
                              ButtonSegment(
                                value: 'cloud_owner',
                                icon: Icon(Icons.cloud_queue),
                                label: Text('Cloud Owner'),
                              ),
                            ],
                            selected: {_mode},
                            onSelectionChanged: (selection) {
                              final next = selection.first;
                              setState(() => _mode = next);
                              if (next == 'cloud_owner' &&
                                  (_server.text.trim().isEmpty ||
                                      _server.text == defaultLanServerUrl ||
                                      _server.text.contains('192.168.'))) {
                                _server.text = defaultServerUrl;
                              } else if (next == 'lan' &&
                                  (_server.text.trim().isEmpty ||
                                      _server.text == defaultServerUrl)) {
                                _server.text = defaultLanServerUrl;
                              }
                            },
                          ),
                          const SizedBox(height: 16),
                          _Field(
                            controller: _server,
                            label: _mode == 'lan'
                                ? 'Desktop LAN URL or Auto detect'
                                : 'Cloud server URL',
                            icon: _mode == 'lan'
                                ? Icons.wifi
                                : Icons.cloud_queue,
                          ),
                          if (_mode == 'lan') ...[
                            OutlinedButton.icon(
                              onPressed: _busy || _discovering
                                  ? null
                                  : _discover,
                              icon: _discovering
                                  ? const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Icon(Icons.radar),
                              label: Text(
                                _discovering
                                    ? 'Finding BhojPatra Desk...'
                                    : 'Auto find desktop on Wi-Fi',
                              ),
                            ),
                            if (_discovered.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(
                                  top: 10,
                                  bottom: 12,
                                ),
                                child: Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: _discovered
                                      .map(
                                        (item) => ChoiceChip(
                                          selected:
                                              _server.text.trim() == item.url,
                                          label: Text(
                                            item.outletName?.isNotEmpty == true
                                                ? '${item.outletName} (${item.url})'
                                                : item.url,
                                          ),
                                          onSelected: (_) => setState(
                                            () => _server.text = item.url,
                                          ),
                                        ),
                                      )
                                      .toList(),
                                ),
                              )
                            else
                              const SizedBox(height: 12),
                          ],
                          _Field(
                            controller: _login,
                            label: 'Login ID / phone',
                            icon: Icons.person_outline,
                          ),
                          _Field(
                            controller: _password,
                            label: 'Password / PIN',
                            icon: Icons.lock_outline,
                            obscure: true,
                          ),
                          if (_error != null)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 16),
                              child: Text(
                                _error!,
                                style: const TextStyle(
                                  color: Colors.red,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          FilledButton.icon(
                            style: FilledButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            onPressed: _busy ? null : _submit,
                            icon: _busy
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Icon(Icons.login),
                            label: Text(
                              _busy
                                  ? 'Finding and authenticating...'
                                  : (_mode == 'lan'
                                        ? 'Login to Desktop LAN'
                                        : 'Open Cloud Snapshot'),
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  Text(
                    _mode == 'lan'
                        ? 'Keep BhojPatra Desk open on the same Wi-Fi/hotspot. The app will find it automatically; use the URL field only if Windows Firewall blocks discovery.'
                        : 'Cloud Owner shows the last daily desktop snapshot and does not edit restaurant orders.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: Colors.black54,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.controller,
    required this.label,
    required this.icon,
    this.obscure = false,
  });

  final TextEditingController controller;
  final String label;
  final IconData icon;
  final bool obscure;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: TextField(
        controller: controller,
        obscureText: obscure,
        decoration: InputDecoration(
          prefixIcon: Icon(icon, color: Theme.of(context).colorScheme.primary),
          labelText: label,
          filled: true,
          fillColor: Colors.grey.shade50,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide(
              color: Theme.of(context).colorScheme.primary,
              width: 2,
            ),
          ),
        ),
      ),
    );
  }
}
