import 'package:flutter/material.dart';
import '../../utils/utils.dart';
import '../../widgets/common_widgets.dart';

class TablesTab extends StatelessWidget {
  const TablesTab({super.key, required this.snapshot, required this.onRefresh});

  final Map<String, dynamic> snapshot;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final tables = listOf(snapshot['tables']);

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SectionTitle('Table Status'),
          TableGrid(tables: tables, compact: false),
        ],
      ),
    );
  }
}
