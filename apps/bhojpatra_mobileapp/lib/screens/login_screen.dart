import 'package:flutter/material.dart';
import '../models/session.dart';
import '../api/cloud_api.dart';
import '../api/lan_discovery.dart';
import '../utils/utils.dart';
import '../theme/bhojpatra_theme.dart';
import '../widgets/app_toast.dart';
import 'package:shared_preferences/shared_preferences.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.onLoggedIn,
    this.captainOnly = false,
    this.discoverOnStart = true,
  });
  final Future<void> Function(SavedSession) onLoggedIn;
  final bool captainOnly;
  final bool discoverOnStart;
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _server = TextEditingController(text: defaultLanServerUrl);
  final _login = TextEditingController();
  final _password = TextEditingController();
  String _mode = 'lan';
  bool _busy = false, _discovering = false, _obscure = true, _manual = false;
  List<LanDesktopCandidate> _discovered = const [];

  @override
  void initState() {
    super.initState();
    if (widget.discoverOnStart) _startDiscovery();
  }

  Future<void> _startDiscovery() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    if (_mode == 'lan') {
      _server.text =
          prefs.getString('captain_last_server') ?? defaultLanServerUrl;
    }
    await _discover(silent: true);
  }

  @override
  void dispose() {
    _server.dispose();
    _login.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _discover({bool silent = false}) async {
    setState(() => _discovering = true);
    try {
      final found = await LanDiscovery.discover(preferredUrl: _server.text);
      if (!mounted) return;
      setState(() {
        _discovered = found;
        // A discovery started in Restaurant mode may finish after the owner
        // switches to Remote. Never replace the cloud endpoint with a LAN URL.
        if (found.length == 1 && _mode == 'lan') {
          _server.text = found.first.url;
        }
      });
      if (!silent) {
        appToast(
          context,
          found.isEmpty
              ? 'No counter found. Check Wi-Fi or enter the desktop IP.'
              : '${found.length} counter(s) found',
          error: found.isEmpty,
        );
      }
    } catch (e) {
      if (mounted && !silent) appToast(context, friendlyError(e), error: true);
    } finally {
      if (mounted) setState(() => _discovering = false);
    }
  }

  Future<void> _submit() async {
    if (_login.text.trim().isEmpty || _password.text.isEmpty) {
      appToast(
        context,
        'Enter your staff or owner login and password / PIN.',
        error: true,
      );
      return;
    }
    setState(() => _busy = true);
    try {
      final session = _mode == 'lan'
          ? await CloudApi.loginAutoLan(
              _server.text,
              _login.text,
              _password.text,
              allowCloudFallback: false,
            )
          : await CloudApi.login(
              _server.text,
              _login.text,
              _password.text,
              mode: _mode,
            );
      if (widget.captainOnly &&
          !{'captain', 'admin', 'owner', 'manager'}.contains(session.role)) {
        throw Exception(
          'Use an active captain or owner account created on Desk.',
        );
      }
      if (_mode != 'lan' &&
          !{'owner', 'admin', 'manager'}.contains(session.role)) {
        throw Exception(
          'Remote reports are for owners. Staff ordering uses the local Wi-Fi connection.',
        );
      }
      if (_mode == 'lan') {
        await (await SharedPreferences.getInstance()).setString(
          'captain_last_server',
          session.serverUrl,
        );
      }
      if (mounted) await widget.onLoggedIn(session);
    } catch (e) {
      if (mounted) appToast(context, friendlyError(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const BrandLogo(size: 78),
                const SizedBox(height: 12),
                const Text(
                  'BhojPatra',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w900,
                    color: Brand.navy,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Your restaurant. In your pocket.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Brand.muted),
                ),
                const SizedBox(height: 24),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'Welcome back',
                          style: TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'Staff and owners sign in with their own account.',
                          style: TextStyle(fontSize: 12, color: Brand.muted),
                        ),
                        const SizedBox(height: 18),
                        SegmentedButton<String>(
                          showSelectedIcon: false,
                          style: SegmentedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                            minimumSize: const Size(0, 36),
                            textStyle: const TextStyle(
                              fontFamily: 'Roboto',
                              fontSize: 12,
                            ),
                          ),
                          segments: const [
                            ButtonSegment(
                              value: 'lan',
                              icon: Icon(Icons.wifi, size: 17),
                              label: Text('Restaurant'),
                            ),
                            ButtonSegment(
                              value: 'cloud_live',
                              icon: Icon(Icons.cloud_outlined, size: 17),
                              label: Text('Owner remote'),
                            ),
                          ],
                          selected: {_mode},
                          onSelectionChanged: _busy
                              ? null
                              : (v) => setState(() {
                                  _mode = v.first;
                                  _server.text = _mode == 'lan'
                                      ? (_discovered.firstOrNull?.url ??
                                            defaultLanServerUrl)
                                      : defaultServerUrl;
                                }),
                        ),
                        const SizedBox(height: 14),
                        if (_mode == 'lan') ...[
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Brand.background,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  _discovered.isEmpty
                                      ? Icons.wifi_find
                                      : Icons.wifi,
                                  size: 22,
                                  color: _discovered.isEmpty
                                      ? Brand.muted
                                      : Brand.green,
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        _discovering
                                            ? 'Finding your counter…'
                                            : _discovered.isEmpty
                                            ? 'Same Wi-Fi as your counter'
                                            : 'Counter available',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 12,
                                        ),
                                      ),
                                      const Text(
                                        'Desk must be open',
                                        style: TextStyle(
                                          fontSize: 11,
                                          color: Brand.muted,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'Find desktop',
                                  onPressed: _discovering || _busy
                                      ? null
                                      : () => _discover(),
                                  icon: _discovering
                                      ? const SizedBox(
                                          width: 16,
                                          height: 16,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        )
                                      : const Icon(Icons.refresh, size: 21),
                                ),
                              ],
                            ),
                          ),
                          if (_discovered.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Wrap(
                                spacing: 6,
                                children: [
                                  for (final c in _discovered)
                                    ChoiceChip(
                                      label: Text(
                                        c.outletName ?? c.name ?? c.url,
                                      ),
                                      selected: _server.text == c.url,
                                      onSelected: _busy
                                          ? null
                                          : (_) => setState(
                                              () => _server.text = c.url,
                                            ),
                                    ),
                                ],
                              ),
                            ),
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(
                              onPressed: () =>
                                  setState(() => _manual = !_manual),
                              child: Text(
                                _manual
                                    ? 'Hide connection details'
                                    : 'Enter desktop IP',
                              ),
                            ),
                          ),
                        ],
                        if (_manual || _mode != 'lan')
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: TextField(
                              controller: _server,
                              decoration: InputDecoration(
                                labelText: _mode == 'lan'
                                    ? 'Desktop IP or URL'
                                    : 'Cloud URL',
                                prefixIcon: const Icon(
                                  Icons.dns_outlined,
                                  size: 19,
                                ),
                              ),
                            ),
                          ),
                        TextField(
                          controller: _login,
                          enabled: !_busy,
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          autofillHints: const [AutofillHints.username],
                          decoration: const InputDecoration(
                            labelText: 'Email or phone',
                            prefixIcon: Icon(Icons.person_outline, size: 20),
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _password,
                          enabled: !_busy,
                          obscureText: _obscure,
                          autofillHints: const [AutofillHints.password],
                          onSubmitted: (_) {
                            if (!_busy) _submit();
                          },
                          decoration: InputDecoration(
                            labelText: 'Password / PIN',
                            prefixIcon: const Icon(
                              Icons.lock_outline,
                              size: 20,
                            ),
                            suffixIcon: IconButton(
                              tooltip: _obscure
                                  ? 'Show password'
                                  : 'Hide password',
                              onPressed: () =>
                                  setState(() => _obscure = !_obscure),
                              icon: Icon(
                                _obscure
                                    ? Icons.visibility_off_outlined
                                    : Icons.visibility_outlined,
                                size: 19,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 18),
                        FilledButton.icon(
                          onPressed: _busy || _discovering ? null : _submit,
                          icon: _busy
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(Icons.arrow_forward, size: 19),
                          label: Text(_busy ? 'Signing in…' : 'Sign in'),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  _mode == 'lan'
                      ? 'Secure staff access • No internet needed on local Wi-Fi'
                      : 'Owner reports use the last data synced by Desk.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 11, color: Brand.muted),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
