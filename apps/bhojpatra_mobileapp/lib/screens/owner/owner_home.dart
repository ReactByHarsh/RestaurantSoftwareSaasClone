import 'package:flutter/material.dart';
import 'overview_tab.dart';
import 'tables_tab.dart';

class OwnerHome extends StatefulWidget {
  const OwnerHome({super.key, required this.snapshot, required this.onRefresh});

  final Map<String, dynamic> snapshot;
  final Future<void> Function() onRefresh;

  @override
  State<OwnerHome> createState() => _OwnerHomeState();
}

class _OwnerHomeState extends State<OwnerHome> {
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: [
          OverviewTab(snapshot: widget.snapshot, onRefresh: widget.onRefresh),
          TablesTab(snapshot: widget.snapshot, onRefresh: widget.onRefresh),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (index) => setState(() => _currentIndex = index),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Overview',
          ),
          NavigationDestination(
            icon: Icon(Icons.table_restaurant_outlined),
            selectedIcon: Icon(Icons.table_restaurant),
            label: 'Tables',
          ),
        ],
      ),
    );
  }
}
