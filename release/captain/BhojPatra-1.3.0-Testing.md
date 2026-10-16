# BhojPatra 1.3.0 — local test package

Install the paired **Desk 0.1.29** Windows installer and **BhojPatra 1.3.0 arm64-v8a** APK. The APK upgrades the existing Captain package using the same signing key; do not uninstall first if you want to preserve phone drafts. Use armeabi-v7a only for older 32-bit Android devices.

The Windows installer is approximately 7 MB and embeds the WebView2 bootstrapper, not the large offline WebView2 runtime. An initial internet connection is needed if Windows has no compatible WebView2 runtime. The installer has a Tauri updater signature, but not a Windows Authenticode certificate; Windows may show an unsigned-publisher/SmartScreen warning.

## Connect and test orders

1. Keep Desk open. Connect phone/tablet and counter to the same trusted LAN/Wi-Fi. Disable guest/client isolation. Use staff credentials created in Desk's Admin Panel.
2. In BhojPatra, choose Restaurant. Let it discover Desk, or enter the desktop IP. Captain accounts get Tables / Orders / Kitchen / Account; owner/admin/manager accounts get Home / Reports / Tables / Account.
3. Add several products to one table, switch tables and navigation tabs, then return. Saved phone drafts must remain. Tap Review draft for notes/extras and optional customer details.
4. Send order / KOT and confirm the table's items and totals also appear on Desk. Test two phones adding to the same active table. A retry must not duplicate the accepted items.
5. Temporarily disconnect phone Wi-Fi. The draft should remain safe; reconnect and Retry confirmation. Do not treat an unconfirmed draft as an accepted kitchen order.

## Configure and test kitchen printing

In Desk's Printer Center, set the receipt printer and optional default KOT printer. For separate kitchens/bar, enter station printer queues or LAN addresses such as `tcp://192.168.1.50:9100`. Map products to the appropriate kitchen station. Enable Auto-print KOTs sent from phones, then Save.

Test each route with its Test button. Send phone orders to different stations and verify that each kitchen receives its own items. Leave the default KOT and station targets blank to share the receipt printer. Bill and KOT jobs to the same target are serialized.

Offline/failing printer jobs remain visible in Printer Center. Check for an already printed ticket before explicitly retrying a failed/interrupted job: transport acknowledgment does not prove physical paper output, and a failed acknowledgment can still mean partial output. Do not use automatic repeats during restaurant service.

## Owner reports

Check sales, products, payments, expenses, stock, purchases, cancellations and business summary. Use date presets/custom ranges, tap chart bars or payment segments, inspect bill details and Copy report CSV. Compare totals with Desk using the same business dates.

Tips are not added to bill/report sales. Failed/credit payments are not successful cash collections. Stock is current stock, regardless of the selected historical date range. Sales less expenses is not accounting profit.

Owner remote requires the cloud account and data synced by Desk. If cloud sync is disabled, use Restaurant/LAN mode for current data; remote reports cannot receive new offline desktop activity.

## Verification and limits

Static analysis, mobile widget/model tests, desktop/Rust tests and isolated HTTP/WebSocket order tests pass. Physical Android installation, Wi-Fi discovery/permissions and actual printer output still need this on-site test. No R2 publication or GitHub push is included in this package.
