import 'package:flutter/material.dart';
import 'overview_tab.dart';
import 'tables_tab.dart';
import '../../models/session.dart';
import '../captain/captain_workspace.dart';
import '../kitchen/kitchen_workspace.dart';

class OwnerHome extends StatefulWidget {
  const OwnerHome({
    super.key,
    required this.snapshot,
    required this.session,
    required this.onRefresh,
    required this.onSave,
  });

  final Map<String, dynamic> snapshot;
  final SavedSession session;
  final Future<void> Function() onRefresh;
  final Future<void> Function(Map<String, dynamic>) onSave;

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
          CaptainWorkspace(
            snapshot: widget.snapshot,
            session: widget.session,
            onSave: widget.onSave,
          ),
          KitchenWorkspace(snapshot: widget.snapshot, onSave: widget.onSave),
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
          NavigationDestination(
            icon: Icon(Icons.room_service_outlined),
            selectedIcon: Icon(Icons.room_service),
            label: 'Captain',
          ),
          NavigationDestination(
            icon: Icon(Icons.soup_kitchen_outlined),
            selectedIcon: Icon(Icons.soup_kitchen),
            label: 'Kitchen',
          ),
        ],
      ),
    );
  }
}
