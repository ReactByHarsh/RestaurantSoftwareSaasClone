import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:bhojpatra_mobile/api/cloud_api.dart';
import 'package:bhojpatra_mobile/models/captain_draft.dart';
import 'package:bhojpatra_mobile/models/session.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final url = Platform.environment['BHOJPATRA_TEST_LAN_URL'];
  test(
    'two phones, duplicate retry, HTTP state and realtime use the Rust order engine',
    () async {
      final session = SavedSession(
        serverUrl: url!,
        login: 'captain@test.local',
        password: 'test-only',
        outletId: 'out_test',
        user: {'id': 'cap1', 'name': 'Captain', 'role': 'captain'},
      );
      final phone1 = CloudApi(session);
      final phone2 = CloudApi(session);
      addTearDown(phone1.dispose);
      addTearDown(phone2.dispose);
      final socket = phone2.connectRealtime();
      addTearDown(() => socket.sink.close());
      final connected = Completer<void>();
      final changed = Completer<void>();
      final subscription = socket.stream.listen((message) {
        final event = jsonDecode(message as String);
        if (event['type'] == 'CONNECTED' && !connected.isCompleted) {
          connected.complete();
        }
        if (event['type'] == 'STATE_UPDATED' && !changed.isCompleted) {
          changed.complete();
        }
      });
      addTearDown(subscription.cancel);
      await connected.future.timeout(const Duration(seconds: 5));
      final draft1 = CaptainDraft(tableId: 't1')
        ..add({'id': 'tea', 'name': 'Tea'}, quantity: 5, note: 'Less sugar');
      final draft2 = CaptainDraft(tableId: 't1')
        ..add({'id': 'tea', 'name': 'Tea'}, quantity: 2, note: 'No sugar');
      final command1 = draft1.command();
      await Future.wait([
        phone1.submitCaptainCommand(command1),
        phone2.submitCaptainCommand(draft2.command()),
      ]);
      await changed.future.timeout(const Duration(seconds: 5));
      await phone1.submitCaptainCommand(command1);
      final state = await phone2.fetchState();
      expect(state['orders'], hasLength(1));
      expect(state['orderItems'], hasLength(2));
      expect(state['kots'], hasLength(2));
      expect(state['orders'][0]['totalPaise'], 24255);
      expect(state['tables'][0]['activeOrderId'], state['orders'][0]['id']);
      expect(state['cloudSync']['enabled'], false);
      final requestBill = CaptainDraft(
        tableId: 't1',
        expectedOrderId: state['orders'][0]['id'] as String,
      )..action = 'request_bill';
      final billed = await phone1.submitCaptainCommand(requestBill.command());
      expect(billed['tables'][0]['status'], 'bill_requested');
    },
    skip: url == null
        ? 'Start the isolated Rust contract server and set BHOJPATRA_TEST_LAN_URL to run.'
        : false,
  );
}
