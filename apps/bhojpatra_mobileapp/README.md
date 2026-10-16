# BhojPatra 1.3.1

Native Android phone/tablet ordering and owner-reporting companion for **BhojPatra Desk 0.1.29 or newer**. The app uses the restaurant's orange/navy theme and BhojPatra logo. Its APK retains the `lib/main_captain.dart` entry point, application ID `com.bhojpatra.captain` and existing signing key so previously installed Captain APKs can upgrade without losing drafts. Its displayed name is now **BhojPatra**.

## Install and pair

1. Install the included Desk 0.1.29 Windows installer on the counter, preserving its existing restaurant data. Keep Desk open and signed in.
2. In Desk → Admin Panel → Staff, create/enable an account with the Captain role, login ID/phone and password/PIN. Staff credentials are verified locally by Desk, without requiring cloud sync.
3. Install the `arm64-v8a` APK on a modern Android phone/tablet. Use `armeabi-v7a` only for older 32-bit Android devices. `x86_64` is for compatible Intel devices/emulators.
4. Join the same trusted Wi-Fi network as the counter (the desktop may use Ethernet on the same router). Open BhojPatra and allow local/nearby network permission if Android asks.
5. The app automatically searches for Desk. If several restaurants are discovered, select the correct one. Sign in with the staff account. If discovery is blocked, enter the desktop IPv4 address; port 3000 is added automatically.

The app discovers desktops on the Wi-Fi the device is **already connected to**. It does not silently join password-protected Wi-Fi networks. Guest Wi-Fi/client isolation must be disabled for phone-to-counter communication. A hotspot also works when both devices can reach each other.

## Ordering

- Filter tables by section, running/available status or saved drafts. Search tables/products and save menu favourites for fast repeat ordering.
- Tap a product to choose extras and kitchen instructions. Optional customer name/phone are in Review draft.
- Phone drafts are saved independently for each table and survive switching tables or restarting the app. Drafts are not visible on the counter until sent.
- Send order / KOT waits for a desktop acknowledgment. Desk computes section prices, premiums, category tax/discount rules and kitchen station routing.
- Confirmed items and totals are available in the table's Confirmed items view. Request bill marks the table for the counter; captains do not settle payments.
- If a request cannot be confirmed, the draft stays locked with a Retry confirmation action. The stable request ID makes retries idempotent, including after a phone restart. A rejected request remains an editable draft.
- Two captains can append to the same active table without replacing each other's items. Queued counter saves are prevented from erasing unseen captain commands.
- Tables, Orders, Kitchen and Account bottom navigation keeps the interface compact. Orders and Kitchen show live tickets and bill/item details; network and confirmation errors use toast feedback, not raw error banners.
- The desktop tables, order items and kitchen KOTs update through the LAN event channel. KOT printing happens through Desk; the phone does not independently print a second ticket.

## Owner access and reports

Sign in with a local Owner, Admin or Manager account for Home, Reports, Tables and Account navigation. Owners get sales, product sales, payment collections, expenses, current stock, purchases, bill/KOT cancellations and a business summary. Select Today, 7 days, Month or a custom range; tap chart bars/payment segments to inspect underlying records and bills. Copy the selected report as CSV for sharing. Pull down or use Refresh to update data.

Version 1.3.1 loads live LAN state independently of the phone's SQLite cache. Cache initialization/read/write failures cannot suppress desktop data or turn an accepted order into a failed acknowledgment. A late cache read cannot overwrite live data. Full realtime updates are applied even during refreshes; older HTTP responses and timestamped events cannot replace a newer snapshot. Missing/incomplete LAN responses show a connection error rather than manufactured empty restaurant data. Account shows the server URL, refresh time, loaded table/order/menu counts and any offline-cache problem. LIVE indicates the event channel; POLLING indicates HTTP is working without the realtime channel, with a 10-second fallback refresh.

The **Owner remote** login option uses the configured cloud service and only accepts owner/admin/manager roles. It displays data last synced by Desk, not a substitute for an online desktop. When cloud sync is disabled on Desk, remote owner reports cannot receive new desktop data; use Restaurant/LAN access for current reports. Remote owner refreshes are read-only and never upload cached restaurant state.

Tips are excluded from bill sales/report totals. Failed payments and credit/account tenders are not cash collections. Stock is the current balance, not a historical reconstruction for the selected date range. Sales less expenses is not accounting profit.

## Multiple kitchen printers

In **Desk → Printer Center → Kitchen / KOT printer routes**:

1. Configure the bill printer as usual. Enter a default KOT printer queue or LAN address, such as `tcp://192.168.1.50:9100`. Leave it blank to use the bill printer.
2. Override individual kitchen/bar station targets if needed. A station target wins over the default KOT target. Use installed Windows queue names for USB/Bluetooth/driver printers or an IP/hostname and raw printing port for LAN/Wi-Fi ESC/POS printers. Reserve static printer IPs on the router.
3. Assign menu products to the correct kitchen station in the product editor. Test each station route before service.
4. Enable **Auto-print KOTs sent from phones** and save. Keep Desk open. Combined KOT mode only combines tickets from the same order going to the same physical printer; separate stations are not redirected to the bill printer.

Phone KOTs are durably queued on Desk before printer I/O. Failed or interrupted jobs remain in Printer Center with their target and error. Check the kitchen before explicitly retrying an uncertain/failed job, since a printer may have received data without returning a complete acknowledgment. Receipt and KOT jobs to the same printer are serialized, and KOTs never open the cash drawer. Automated KOTs require a direct printer transport, not the browser/system print dialog. This queue is kept on the counter device, not uploaded as an instruction to another desktop.

## Offline and network behavior

No internet/cloud service is required for captain ordering. Keep Desk running: it is the authority for accepting orders. Wi-Fi loss allows draft preparation, **not** unconfirmed automatic kitchen orders. Reconnect and tap Retry to confirm pending requests. The app polls as a WebSocket fallback and can rediscover the same outlet after an IP change. It never silently switches to another restaurant or cloud ordering.

Desk serves authenticated HTTP on TCP 3000 and responds to discovery on UDP 3001. Permit these on the trusted/private LAN in Windows Firewall; the existing Desk installer includes firewall hooks, which require elevation to successfully add rules. Use the provided `Enable-CaptainLan.ps1` from an elevated PowerShell if necessary. Do not expose the API to the public internet. LAN Basic authentication is not encrypted; use a trusted restaurant network. Phone credentials are kept in platform secure storage, and Android backups are disabled for this package.

## Build and signing

Run `powershell -ExecutionPolicy Bypass -File scripts/Build-Captain.ps1` from this folder. It analyzes/tests and builds ABI-specific signed release APKs, copied into `release/captain` at the repository root. Flutter, Android SDK and Java 17 must be installed.

The dedicated release keystore and Windows-DPAPI-protected password live outside Git under the build user's `.tauri` directory (`bhojpatra-captain-release.jks`, `bhojpatra-captain-password.dpapi`). Preserve the signing key for future app upgrades. The protected password can be decrypted only under this Windows user's DPAPI context; arrange a secure credential export before migrating build devices. Never commit signing keys/passwords or generate a replacement key for an already distributed package.

## Verification

- `flutter analyze` and `flutter test` cover local drafts, stable retry IDs, authentication headers, acknowledgment handling, actual HTTP hello discovery, owner report accounting/drill-downs and phone/tablet layouts (320, 390 and 1280 pixels).
- Desktop TypeScript tests cover independent station targets, shared-printer grouping, durable deduplication, failed/interrupted jobs and queue-storage failures. Native tests verify hostname/TCP printer output against an isolated local socket, not a physical printer.
- Native `cargo test --lib` covers pricing, required modifiers, closed-order guards, two captains, duplicate sends, bill requests and protection against stale counter saves.
- For an isolated real HTTP/WebSocket integration test, run `cargo run --example captain_lan_smoke` in `apps/web/src-tauri`, then set `BHOJPATRA_TEST_LAN_URL=http://127.0.0.1:3008` and run `flutter test test/captain_integration_test.dart`. The fixture server listens only on localhost and never opens customer databases. Restart it before each integration run.
- Device installation, Android permission prompts, actual Wi-Fi broadcasts and the physical printer still require testing on the restaurant's Android device/network.
- `test/owner_loading_test.dart` covers actual MobileHome loading and navigation through mocked authenticated HTTP, broken/delayed cache reads, date-filtered reports, in-flight refresh/realtime races and all owner tabs. `test/owner_lan_smoke_test.dart` provides optional read-only live owner login/state/realtime verification using scoped `BHOJPATRA_OWNER_TEST_URL`, `BHOJPATRA_OWNER_TEST_LOGIN` and `BHOJPATRA_OWNER_TEST_PASSWORD` environment variables. Never put real credentials in files or test fixtures.

These builds are local test deliverables. No GitHub push or R2 auto-update publication is performed by the captain build script.
