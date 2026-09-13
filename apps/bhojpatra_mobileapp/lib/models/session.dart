import '../utils/utils.dart';

class SavedSession {
  SavedSession({
    required this.serverUrl,
    required this.login,
    required this.password,
    required this.outletId,
    required this.user,
    this.mode = 'lan',
  });

  final String serverUrl;
  final String login;
  final String password;
  final String outletId;
  final Map<String, dynamic> user;
  final String mode;

  String get userId => text(user['id']);
  String get userName => text(user['name']);
  String get role => text(user['role']);
  String get tenantId => text(user['tenantId']);

  Map<String, dynamic> toJson() => {
    'serverUrl': serverUrl,
    'login': login,
    'password': password,
    'outletId': outletId,
    'user': user,
    'mode': mode,
  };

  factory SavedSession.fromJson(Map<String, dynamic> json) {
    final storedMode = text(json['mode']);
    return SavedSession(
      serverUrl: text(json['serverUrl']),
      login: text(json['login']),
      password: text(json['password']),
      outletId: text(json['outletId']),
      user: Map<String, dynamic>.from((json['user'] as Map?) ?? const {}),
      mode: storedMode == 'cloud_owner'
          ? 'cloud_live'
          : text(
        storedMode,
        fallback: serverModeLabel(text(json['serverUrl'])) == 'CLOUD'
            ? 'cloud_live'
            : 'lan',
      ),
    );
  }
}
