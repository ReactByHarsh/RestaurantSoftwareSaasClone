import 'package:flutter/material.dart';
import '../utils/utils.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({
    super.key,
    required this.snapshot,
    required this.onSave,
  });

  final Map<String, dynamic> snapshot;
  final Future<void> Function(Map<String, dynamic>) onSave;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _ipController;
  late final TextEditingController _portController;
  var _busy = false;

  @override
  void initState() {
    super.initState();
    final settings =
        snapshotValue(widget.snapshot, 'printSettings', 'printerIp') != null
        ? widget.snapshot['printSettings'] as Map
        : {};
    _ipController = TextEditingController(text: text(settings['printerIp']));
    _portController = TextEditingController(
      text: text(settings['printerPort'], fallback: '9100'),
    );
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      final next = deepCopy(widget.snapshot);
      next['printSettings'] = {
        'printerIp': _ipController.text.trim(),
        'printerPort': int.tryParse(_portController.text.trim()) ?? 9100,
      };
      await widget.onSave(next);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Settings saved successfully')),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to save settings: $e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const Text(
              'LAN Printer Configuration',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              'Configure the IP address of your receipt printer on the local network (e.g. 192.168.1.100).',
              style: TextStyle(color: Colors.black54),
            ),
            const SizedBox(height: 24),
            TextField(
              controller: _ipController,
              decoration: const InputDecoration(
                labelText: 'Printer IP Address',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.print),
              ),
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _portController,
              decoration: const InputDecoration(
                labelText: 'Printer Port (Default 9100)',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.numbers),
              ),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 32),
            FilledButton.icon(
              onPressed: _busy ? null : _save,
              icon: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.save),
              label: Text(_busy ? 'Saving...' : 'Save Settings'),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
