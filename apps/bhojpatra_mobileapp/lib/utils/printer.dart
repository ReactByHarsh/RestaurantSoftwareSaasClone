import 'dart:convert';
import 'dart:io';
import 'utils.dart';

class LanPrinter {
  static const int defaultPort = 9100;

  static Future<void> printKot({
    required Map<String, dynamic> printSettings,
    required String kotNo,
    required String tableName,
    required String captainName,
    required List<Map<String, dynamic>> items,
  }) async {
    final ip = text(printSettings['printerIp']);
    if (ip.isEmpty) {
      throw Exception('Printer IP is not configured in settings.');
    }
    final port = intValue(printSettings['printerPort']);
    final actualPort = port > 0 ? port : defaultPort;

    final bytes = <int>[];
    // Initialize printer
    bytes.addAll([27, 64]);
    // Center align
    bytes.addAll([27, 97, 1]);

    // Title
    bytes.addAll([27, 33, 16]); // Double height
    bytes.addAll(utf8.encode('*** KOT ***\n'));
    bytes.addAll([27, 33, 0]); // Normal text
    bytes.addAll(utf8.encode('--------------------------------\n'));

    // Info (Left align)
    bytes.addAll([27, 97, 0]);
    bytes.addAll(utf8.encode('KOT No: $kotNo\n'));
    bytes.addAll(utf8.encode('Table : $tableName\n'));
    bytes.addAll(utf8.encode('Cap   : $captainName\n'));
    bytes.addAll(
      utf8.encode('Date  : ${DateTime.now().toString().substring(0, 16)}\n'),
    );
    bytes.addAll(utf8.encode('--------------------------------\n'));

    // Items
    bytes.addAll(utf8.encode('Qty  Item\n'));
    bytes.addAll(utf8.encode('--------------------------------\n'));
    bytes.addAll([27, 33, 8]); // Emphasized
    for (final item in items) {
      final qty = text(item['quantity']).padRight(4);
      final name = text(item['name']);
      bytes.addAll(utf8.encode('$qty $name\n'));
    }
    bytes.addAll([27, 33, 0]); // Normal
    bytes.addAll(utf8.encode('--------------------------------\n'));
    bytes.addAll(utf8.encode('\n\n\n\n'));

    // Cut paper
    bytes.addAll([29, 86, 66, 0]);

    await _sendBytes(ip, actualPort, bytes);
  }

  static Future<void> printProforma({
    required Map<String, dynamic> printSettings,
    required String restaurantName,
    required String orderNo,
    required String tableName,
    required String captainName,
    required List<Map<String, dynamic>> items,
    required int subtotalPaise,
  }) async {
    final ip = text(printSettings['printerIp']);
    if (ip.isEmpty) {
      throw Exception('Printer IP is not configured in settings.');
    }
    final port = intValue(printSettings['printerPort']);
    final actualPort = port > 0 ? port : defaultPort;

    final bytes = <int>[];
    bytes.addAll([27, 64]); // Init

    bytes.addAll([27, 97, 1]); // Center
    bytes.addAll([27, 33, 16]); // Double height
    bytes.addAll(utf8.encode('$restaurantName\n'));
    bytes.addAll([27, 33, 0]); // Normal
    bytes.addAll(utf8.encode('PROFORMA BILL\n'));
    bytes.addAll(utf8.encode('--------------------------------\n'));

    bytes.addAll([27, 97, 0]); // Left
    bytes.addAll(utf8.encode('Order : $orderNo\n'));
    bytes.addAll(utf8.encode('Table : $tableName\n'));
    bytes.addAll(utf8.encode('Cap   : $captainName\n'));
    bytes.addAll(
      utf8.encode('Date  : ${DateTime.now().toString().substring(0, 16)}\n'),
    );
    bytes.addAll(utf8.encode('--------------------------------\n'));

    for (final item in items) {
      final qty = text(item['quantity']).padRight(3);
      final name = text(item['nameSnapshot']);
      final total = (intValue(item['totalPaise']) / 100)
          .toStringAsFixed(2)
          .padLeft(8);
      // Simple 32 column wrapping logic
      // e.g. "2x  Chicken Tikka      120.00"
      String line = '${qty}x $name';
      if (line.length > 23) line = line.substring(0, 23);
      line = '${line.padRight(24)}$total\n';
      bytes.addAll(utf8.encode(line));
    }

    bytes.addAll(utf8.encode('--------------------------------\n'));
    bytes.addAll([27, 97, 2]); // Right align
    bytes.addAll([27, 33, 8]); // Emphasized
    final totalStr = (subtotalPaise / 100).toStringAsFixed(2);
    bytes.addAll(utf8.encode('Total: Rs $totalStr\n'));
    bytes.addAll([27, 33, 0]); // Normal
    bytes.addAll([27, 97, 1]); // Center
    bytes.addAll(utf8.encode('--------------------------------\n'));
    bytes.addAll(utf8.encode('Thank You! Visit Again\n'));
    bytes.addAll(utf8.encode('\n\n\n\n'));

    // Cut paper
    bytes.addAll([29, 86, 66, 0]);

    await _sendBytes(ip, actualPort, bytes);
  }

  static Future<void> _sendBytes(String ip, int port, List<int> bytes) async {
    Socket? socket;
    try {
      socket = await Socket.connect(
        ip,
        port,
        timeout: const Duration(seconds: 3),
      );
      socket.add(bytes);
      await socket.flush();
    } finally {
      socket?.destroy();
    }
  }
}
