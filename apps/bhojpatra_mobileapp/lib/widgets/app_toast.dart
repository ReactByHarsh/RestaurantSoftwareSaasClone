import 'package:flutter/material.dart';
import '../theme/bhojpatra_theme.dart';

void appToast(BuildContext context, String message, {bool error = false}) {
  final messenger = ScaffoldMessenger.of(context);
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(
    SnackBar(
      duration: Duration(seconds: error ? 5 : 3),
      behavior: SnackBarBehavior.floating,
      // Position above the order actions, including when the keyboard is open.
      margin: EdgeInsets.fromLTRB(
        12,
        12,
        12,
        (MediaQuery.sizeOf(context).height -
                MediaQuery.viewInsetsOf(context).bottom -
                MediaQuery.paddingOf(context).bottom -
                220)
            .clamp(12, double.infinity),
      ),
      backgroundColor: error ? const Color(0xff9f1239) : Brand.navy,
      content: Row(
        children: [
          Icon(
            error ? Icons.info_outline : Icons.check_circle_outline,
            color: Colors.white,
            size: 19,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(message, maxLines: 4, overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
      showCloseIcon: true,
    ),
  );
}

String friendlyError(Object error) {
  final message = error.toString().replaceFirst('Exception: ', '');
  if (RegExp(
    r'SocketException|ClientException|Failed to fetch|Connection refused|Network is unreachable|TimeoutException',
    caseSensitive: false,
  ).hasMatch(message)) {
    return 'Cannot reach the counter. Check Wi-Fi and keep BhojPatra Desk open. Your draft is safe.';
  }
  return message;
}
